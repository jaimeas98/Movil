// Adaptador de Yelmo Cines (Bahía Sur y Jerez).
//
// Yelmo carga su cartelera en páginas Next.js con __NEXT_DATA__ y/o
// mediante su API interna now-playing.aspx/GetNowPlaying (POST).
// Se intentan ambas estrategias en orden antes de hacer fallback a ejemplo.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const CARTELERA_URLS = {
  'yelmo-bahia-sur': 'https://www.yelmocines.es/cartelera/cadiz/premium-bahia-sur',
  'yelmo-jerez': 'https://www.yelmocines.es/cartelera/cadiz/jerez',
};

// Términos de búsqueda para localizar el cine dentro de la respuesta de la API POST.
const CINEMA_TERMS = {
  'yelmo-bahia-sur': ['bahia sur', 'bahía sur', 'san fernando', 'premium'],
  'yelmo-jerez': ['jerez', 'area sur', 'área sur'],
};

export async function fetchYelmo(cinemaId, dateStr) {
  const pageUrl = CARTELERA_URLS[cinemaId];
  if (!pageUrl) throw new Error(`Sin URL para Yelmo ${cinemaId}`);

  const html = await fetchText(pageUrl);

  // Estrategia 1: página Next.js con __NEXT_DATA__ (más moderno)
  const fromNext = parseYelmoNextData(html, dateStr);
  if (fromNext && fromNext.length) return fromNext;

  // Estrategia 2: API POST legacy (now-playing.aspx)
  const fromPost = await fetchYelmoPostApi(cinemaId, html, dateStr);
  if (fromPost && fromPost.length) return fromPost;

  throw new Error('Yelmo: no se pudo extraer cartelera con ningún método');
}

// ── Estrategia 1: __NEXT_DATA__ ───────────────────────────────────────────────

function parseYelmoNextData(html, dateStr) {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let json;
  try { json = JSON.parse(m[1]); } catch { return null; }

  const pp = json?.props?.pageProps ?? {};
  // Intentar distintos paths habituales en la web de Yelmo
  const candidates = [
    pp.movies, pp.billboard, pp.films, pp.showtimes,
    pp.data?.movies, pp.data?.billboard, pp.data?.films,
    pp.initialData?.movies,
  ];
  for (const list of candidates) {
    if (Array.isArray(list) && list.length) {
      const mapped = list.flatMap((f) => mapNextFilm(f, dateStr)).filter(Boolean);
      if (mapped.length) return mapped;
    }
  }
  return null;
}

function mapNextFilm(f, dateStr) {
  const title = f.title || f.Title || f.name || '';
  if (!title) return [];
  const rawSessions = f.sessions || f.Sessions || f.showtimes || f.horarios || [];
  // Si hay info de fecha, filtrar por día
  const sessions = rawSessions
    .filter((s) => {
      const d = s.date || s.Date || s.fecha || '';
      return !d || d.slice(0, 10) === dateStr;
    })
    .map((s) => ({
      time: (s.time || s.Time || s.hora || s.hour || '').slice(0, 5),
      format: s.format || s.Format || s.tipo || '2D',
      language: /vos/i.test(JSON.stringify(s)) ? 'VOSE' : 'VE',
      room: s.room || s.sala || null,
      buyUrl: s.url || s.buyUrl || null,
    }));
  return [{
    id: slugify(title),
    title,
    posterUrl: f.poster || f.Poster || f.image || f.imagen || null,
    durationMin: Number(f.runtime || f.Runtime || f.duration || f.duracion) || null,
    genre: f.genre || f.Genre || f.genero || null,
    ageRating: f.rating || f.Rating || f.clasificacion || null,
    synopsis: f.synopsis || f.Synopsis || f.sinopsis || null,
    sessions: sortSessions(sessions),
  }];
}

// ── Estrategia 2: API POST legacy ─────────────────────────────────────────────

async function fetchYelmoPostApi(cinemaId, html, dateStr) {
  // Extraer la lista de ciudades del JS de la página (si está presente)
  const cityM = html.match(/var\s+cities\s*=\s*(\[[\s\S]*?\])\s*[,;]/);
  let cities = null;
  if (cityM) {
    try { cities = JSON.parse(cityM[1]); } catch { /* ignorar */ }
  }

  let cityKey = null;
  const terms = CINEMA_TERMS[cinemaId] || [];

  if (cities) {
    outer: for (const city of cities) {
      for (const cinema of (city.Cinemas || [])) {
        const name = (cinema.Name || '').toLowerCase();
        if (terms.some((t) => name.includes(t))) {
          cityKey = city.Key;
          break outer;
        }
      }
      const cname = (city.Name || '').toLowerCase();
      if (terms.some((t) => cname.includes(t))) {
        cityKey = city.Key;
        break;
      }
    }
  }

  if (!cityKey) return null;

  let text;
  try {
    text = await fetchText('https://www.yelmocines.es/now-playing.aspx/GetNowPlaying', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ cityKey }),
    });
  } catch { return null; }

  let data;
  try { data = JSON.parse(text); } catch { return null; }

  return parseYelmoPostResponse(data, cinemaId, dateStr);
}

function parseYelmoPostResponse(data, cinemaId, dateStr) {
  // ASP.NET JSON envuelve la respuesta en `.d`
  let root = data?.d;
  if (typeof root === 'string') {
    try { root = JSON.parse(root); } catch { return null; }
  }
  if (!root) return null;

  const cityList = Array.isArray(root) ? root : [root];
  const terms = CINEMA_TERMS[cinemaId] || [];
  const targetDate = new Date(dateStr + 'T12:00:00');

  for (const city of cityList) {
    for (const cinema of (city.Cinemas || [city])) {
      const name = (cinema.Name || '').toLowerCase();
      const matchesCinema = !terms.length || terms.some((t) => name.includes(t));
      if (!matchesCinema) continue;

      const dates = cinema.Dates || city.Dates || [];
      for (const d of dates) {
        // FilterDate: "/Date(1234567890000)/"
        const fd = d.FilterDate || d.filterDate || '';
        const ms = Number((fd.match(/\/Date\((\d+)\)\//) || [])[1]);
        const match = !isNaN(ms)
          ? new Date(ms).toISOString().slice(0, 10) === dateStr
          : (d.Date || d.date || '').slice(0, 10) === dateStr;
        if (!match) continue;

        const movies = (d.Movies || d.movies || []).map(parseYelmoPostFilm);
        if (movies.length) return movies;
      }
    }
  }
  return null;
}

function parseYelmoPostFilm(f) {
  const title = f.Title || f.title || 'Sin título';
  const sessions = [];
  for (const fmt of (f.Formats || f.formats || [])) {
    const language = /vos|vose/i.test(JSON.stringify(fmt)) ? 'VOSE' : 'VE';
    const format = fmt.Name || fmt.name || '2D';
    for (const s of (fmt.Sessions || fmt.sessions || [])) {
      sessions.push({
        time: (s.Time || s.time || '').slice(0, 5),
        format,
        language,
        room: null,
        buyUrl: s.ShowtimeId
          ? `https://www.yelmocines.es/compra-entradas?showtimeId=${s.ShowtimeId}`
          : null,
      });
    }
  }
  return {
    id: slugify(title),
    title,
    posterUrl: f.Poster || f.poster || null,
    durationMin: Number(f.Runtime || f.runtime || f.Duration || 0) || null,
    genre: f.Genre || f.genre || null,
    ageRating: f.Rating || f.rating || null,
    synopsis: f.Synopsis || f.synopsis || null,
    sessions: sortSessions(sessions),
  };
}
