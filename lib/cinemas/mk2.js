// Adaptador de mk2 Cinesur Bahía de Cádiz.
//
// La web mk2cines.es es una app Next.js; la cartelera se sirve con __NEXT_DATA__
// incrustado en el HTML. Si el path en el JSON cambia, se prueban varios candidatos.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

// URL de la cartelera del recinto (slug confirmado en la web oficial)
const MK2_URL = 'https://www.mk2cines.es/es/mk2-cinesur-bahia-de-cadiz/cartelera';

export async function fetchMk2(cinemaId, dateStr) {
  const html = await fetchText(MK2_URL);
  const movies = parseMk2Html(html, dateStr);
  if (!movies.length) {
    throw new Error('mk2: sin películas en el HTML (puede que la estructura haya cambiado)');
  }
  return movies;
}

function parseMk2Html(html, dateStr) {
  // Intentar extraer __NEXT_DATA__
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const json = JSON.parse(m[1]);
      const movies = extractMk2Movies(json, dateStr);
      if (movies.length) return movies;
    } catch { /* seguir con otros métodos */ }
  }

  // Intentar extraer datos de window.__INITIAL_STATE__ u otras variables JS
  const stateM = html.match(/window\.__(?:INITIAL_STATE|NUXT|STATE)__\s*=\s*(\{[\s\S]*?\})\s*[;<]/);
  if (stateM) {
    try {
      const json = JSON.parse(stateM[1]);
      const movies = extractMk2Movies(json, dateStr);
      if (movies.length) return movies;
    } catch { /* ignorar */ }
  }

  return [];
}

function extractMk2Movies(json, dateStr) {
  const pp = json?.props?.pageProps ?? json ?? {};

  // Candidatos de path donde pueden estar las películas
  const candidates = [
    pp.movies, pp.films, pp.billboard, pp.cartelera,
    pp.data?.movies, pp.data?.films, pp.data?.billboard,
    pp.initialData?.movies, pp.initialData?.films,
    pp.cinema?.movies, pp.cinema?.films,
  ];

  for (const list of candidates) {
    if (Array.isArray(list) && list.length) {
      const mapped = list.map((f) => mapMk2Film(f, dateStr)).filter((f) => f.sessions.length > 0);
      if (mapped.length) return mapped;
      // Si ninguno tiene sesiones podría ser que todas están filtradas, devolvemos de todas formas
      const all = list.map((f) => mapMk2Film(f, dateStr));
      if (all.length) return all;
    }
  }

  // Búsqueda más profunda: recorrer el árbol JSON buscando arrays con estructura de película
  return deepFindMovies(json, dateStr);
}

function deepFindMovies(node, dateStr, depth = 0) {
  if (depth > 6 || !node || typeof node !== 'object') return [];
  if (Array.isArray(node)) {
    if (node.length > 0 && looksLikeMovieArray(node)) {
      return node.map((f) => mapMk2Film(f, dateStr));
    }
    for (const item of node) {
      const found = deepFindMovies(item, dateStr, depth + 1);
      if (found.length) return found;
    }
  } else {
    for (const val of Object.values(node)) {
      const found = deepFindMovies(val, dateStr, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

function looksLikeMovieArray(arr) {
  const first = arr[0];
  if (!first || typeof first !== 'object') return false;
  const keys = Object.keys(first).map((k) => k.toLowerCase());
  return (
    (keys.includes('title') || keys.includes('titulo') || keys.includes('name')) &&
    (keys.includes('sessions') || keys.includes('showtimes') || keys.includes('horarios') ||
     keys.includes('poster') || keys.includes('runtime') || keys.includes('duration'))
  );
}

function mapMk2Film(f, dateStr) {
  const title = f.title || f.Title || f.name || f.titulo || 'Sin título';
  const rawSessions = f.sessions || f.Sessions || f.showtimes || f.horarios || [];
  const sessions = rawSessions
    .filter((s) => {
      const d = s.date || s.Date || s.fecha || '';
      return !d || d.slice(0, 10) === dateStr;
    })
    .map((s) => ({
      time: (s.time || s.Time || s.hora || s.hour || '').slice(0, 5),
      format: s.format || s.Format || s.tipo || '2D',
      language: /vos/i.test(JSON.stringify(s)) ? 'VOSE' : 'VE',
      room: s.room || s.sala || s.Screen || null,
      buyUrl: s.buyUrl || s.url || null,
    }));

  return {
    id: slugify(title),
    title,
    posterUrl: f.poster || f.Poster || f.image || f.imagen || f.coverImage || null,
    durationMin: Number(f.runtime || f.Runtime || f.duration || f.duracion || f.minutes) || null,
    genre: f.genre || f.Genre || f.genero || null,
    ageRating: f.rating || f.Rating || f.clasificacion || f.ageRating || null,
    synopsis: f.synopsis || f.Synopsis || f.sinopsis || f.description || null,
    sessions: sortSessions(sessions),
  };
}
