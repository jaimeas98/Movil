// Adaptador de Yelmo Cines (Bahía Sur y Jerez).
//
// API primaria: POST /now-playing.aspx/GetNowPlaying con {"cityKey":"cadiz"}.
// Devuelve todos los cines de Cádiz; filtramos por clave de recinto.
// Estructura: d.Cinemas[].Dates[] (array de ~7 días) → Movies[] → Formats[] → Showtimes[].
//
// Problema conocido: el API "now playing" excluye hoy cuando ya han pasado muchas
// sesiones del día. En ese caso intentamos:
//  1. GetNowPlayingByDate con la fecha de hoy (puede que no exista — catch silencioso)
//  2. Scraping del HTML de la cartelera del cine: busca __NEXT_DATA__ o JSON embebido
//
// Devolvemos un mapa { 'YYYY-MM-DD': [películas] } con todos los días disponibles.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const CITY_KEY = 'cadiz';
const CINEMA_KEYS = {
  'yelmo-bahia-sur': 'premium-bahia-sur',
  'yelmo-jerez': 'area-sur',
};
const CINEMA_PAGE_URLS = {
  'yelmo-bahia-sur': 'https://www.yelmocines.es/cartelera/cadiz/premium-bahia-sur',
  'yelmo-jerez': 'https://www.yelmocines.es/cartelera/cadiz/jerez',
};

const API_URL = 'https://www.yelmocines.es/now-playing.aspx/GetNowPlaying';
const API_DATE_URL = 'https://www.yelmocines.es/now-playing.aspx/GetNowPlayingByDate';

const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.yelmocines.es/',
  'Origin': 'https://www.yelmocines.es',
};

export async function fetchYelmo(cinemaId) {
  const cinemaKey = CINEMA_KEYS[cinemaId];
  if (!cinemaKey) throw new Error(`Sin clave confirmada para Yelmo ${cinemaId}`);

  const todayStr = msToMadridDate(Date.now());

  // ── 1. API principal: "now playing" para todos los días disponibles ─────────
  const byDate = {};
  try {
    const text = await fetchText(API_URL, {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({ cityKey: CITY_KEY }),
    });
    const data = JSON.parse(text);
    const cinema = findCinema(data?.d?.Cinemas ?? [], cinemaKey);
    if (!cinema) {
      throw new Error(`Yelmo: cine '${cinemaKey}' no encontrado (hay: ${(data?.d?.Cinemas ?? []).map((c) => c.Key).join(', ')})`);
    }

    const dates = cinema.Dates ?? [];
    if (!dates.length) throw new Error('Yelmo: Dates vacío en la respuesta');

    dates.forEach((day, idx) => {
      const iso = dateOfDay(day, idx, todayStr);
      if (!iso) return;
      const movies = (day.Movies ?? []).map(parseYelmoMovie);
      if (movies.length) byDate[iso] = movies;
    });
  } catch (err) {
    // Si la llamada principal falla completamente, propagar para que el agregador use muestra
    if (!Object.keys(byDate).length) throw err;
  }

  // ── 2. Si hoy no está en la respuesta, intentar endpoint por fecha ──────────
  if (!byDate[todayStr]) {
    try {
      const text = await fetchText(API_DATE_URL, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ cityKey: CITY_KEY, date: todayStr }),
        timeoutMs: 8000,
      });
      const data = JSON.parse(text);
      const cinema = findCinema(data?.d?.Cinemas ?? [], cinemaKey);
      if (cinema) {
        for (const day of (cinema.Dates ?? [])) {
          const iso = dateOfDay(day, 0, todayStr);
          if (iso === todayStr) {
            const movies = (day.Movies ?? []).map(parseYelmoMovie);
            if (movies.length) { byDate[todayStr] = movies; break; }
          }
        }
      }
    } catch { /* endpoint no existe o falla — silencioso */ }
  }

  // ── 3. Si hoy sigue sin datos, scraping del HTML de la cartelera ────────────
  if (!byDate[todayStr]) {
    try {
      const pageUrl = CINEMA_PAGE_URLS[cinemaId];
      const html = await fetchText(pageUrl, {
        timeoutMs: 12000,
        headers: { 'Referer': 'https://www.yelmocines.es/', 'Cache-Control': 'no-cache' },
      });
      const todayMovies = extractTodayFromYelmoHtml(html, todayStr, cinemaKey);
      if (todayMovies?.length) byDate[todayStr] = todayMovies;
    } catch { /* silencioso */ }
  }

  if (!Object.keys(byDate).length) throw new Error('Yelmo: sin películas en ninguna fecha');
  return byDate;
}

// ── Helpers de búsqueda de cine ───────────────────────────────────────────────

function findCinema(cinemas, cinemaKey) {
  let cinema = cinemas.find((c) => c.Key === cinemaKey);
  if (!cinema) {
    const fragment = cinemaKey.replace(/^premium-/, '');
    cinema = cinemas.find((c) => c.Key?.includes(fragment));
  }
  return cinema || null;
}

// ── Extracción de hoy desde el HTML de la página de cartelera ────────────────

function extractTodayFromYelmoHtml(html, todayStr, cinemaKey) {
  // Buscar __NEXT_DATA__ (Next.js SSR)
  const nextM = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (nextM) {
    try {
      const nextData = JSON.parse(nextM[1]);
      return extractMoviesFromNextData(nextData, todayStr, cinemaKey);
    } catch { /* continuar */ }
  }

  // Buscar JSON embebido con "Showtimes" o "Movies" que contenga hoy
  const jsonRe = /\{[^{}]*"Movies"\s*:\s*\[[\s\S]{20,}/g;
  let m;
  while ((m = jsonRe.exec(html)) !== null) {
    try {
      // Intentar parsear el objeto completo
      const candidate = extractBalancedJson(html, m.index);
      if (!candidate) continue;
      const obj = JSON.parse(candidate);
      if (obj?.Movies?.length) {
        return obj.Movies.map(parseYelmoMovie);
      }
    } catch { /* continuar */ }
  }

  return null;
}

function extractMoviesFromNextData(nextData, todayStr, cinemaKey) {
  // Buscar en la estructura de datos de Next.js los datos de películas
  const pages = nextData?.props?.pageProps;
  if (!pages) return null;

  // Puede estar en distintos lugares según la versión de la web
  const candidates = [
    pages?.showData?.Cinemas,
    pages?.data?.Cinemas,
    pages?.cinemaData?.Dates,
    pages?.initialData?.d?.Cinemas,
  ];

  for (const cinemas of candidates) {
    if (!Array.isArray(cinemas)) continue;
    const cinema = findCinema(cinemas, cinemaKey);
    if (!cinema) continue;
    for (const day of (cinema.Dates ?? [])) {
      const iso = dateOfDay(day, 0, todayStr);
      if (iso === todayStr && day.Movies?.length) {
        return day.Movies.map(parseYelmoMovie);
      }
    }
  }
  return null;
}

function extractBalancedJson(text, start) {
  let depth = 0;
  for (let i = start; i < text.length && i < start + 50000; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// ── Fechas ────────────────────────────────────────────────────────────────────

function dateOfDay(day, idx, todayStr) {
  const tf = day.Movies?.[0]?.Formats?.[0]?.Showtimes?.[0]?.TimeFilter ?? '';
  // Formato 1: "DD/MM/YYYY HH:MM:SS" — string en hora local de España. Es lo
  // que devuelve la API cuando consultamos desde España.
  const dm = tf.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
  // Formato 2: "/Date(ms)/" — la API devuelve este formato a clientes
  // internacionales (incluido Vercel). El ms NO es UTC verdadero: el
  // serializador .NET de Yelmo encoda la hora local española *como si fuera
  // UTC*. Encima, TimeFilter representa el END-OF-DAY de validez de las
  // sesiones, no el día calendario en sí — y según el cine ese momento cae
  // entre 22:30 (Bahía Sur) y 00:30 *siguiente día* (Área Sur). Restamos 6h
  // al ms para asegurarnos de aterrizar DENTRO del día de las sesiones, y
  // luego leemos los componentes UTC como si fueran la fecha local española.
  const ms = Number((tf.match(/\/Date\((\d+)\)\//) || [])[1]);
  if (!isNaN(ms) && ms > 0) {
    return new Date(ms - 6 * 3600 * 1000).toISOString().slice(0, 10);
  }
  // Último recurso: asumir que day[0] es hoy y avanzar.
  return addDays(todayStr, idx);
}

function msToMadridDate(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Parser de película ─────────────────────────────────────────────────────────

function parseYelmoMovie(f) {
  const title = f.Title || 'Sin título';
  const sessions = [];

  for (const fmt of f.Formats ?? []) {
    const format = fmt.Name || '2D';
    const lang = (fmt.Language || '').toUpperCase();
    const language =
      lang.includes('ORIGINAL') || lang.includes('VOSE') || lang.includes('INGLÉS')
        ? 'VOSE'
        : 'VE';

    for (const s of fmt.Showtimes ?? []) {
      sessions.push({
        time: (s.Time ?? '').slice(0, 5),
        format,
        language,
        room: s.Screen ? String(s.Screen) : null,
        buyUrl: s.ShowtimeId
          ? `https://www.yelmocines.es/compra-entradas?showtimeId=${s.ShowtimeId}`
          : null,
      });
    }
  }

  return {
    id: slugify(title),
    title,
    posterUrl: f.Poster ?? null,
    durationMin: Number(f.RunTime) || null,
    genre: f.Gender || f.Genre || f.Genres?.[0] || null,
    ageRating: f.Rating ?? null,
    synopsis: f.Synopsis ?? null,
    rating: null,
    isNew: /estreno/i.test(f.Status ?? ''),
    sessions: sortSessions(sessions),
  };
}
