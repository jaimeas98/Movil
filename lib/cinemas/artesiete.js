// Adaptador de Arte Siete El Puerto (Artesiete Bahía, C.C. Bahía Mar).
//
// La web de Arte Siete tiene dos dominios:
//   - cinesartesiete.com  (sede corporativa)
//   - bahia.artesiete.es  (recinto El Puerto, ID de cine = 33)
// Se prueban distintas URL en orden hasta obtener datos.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const CINEMA_ID = 33; // ID interno del recinto Artesiete Bahía

export async function fetchArteSiete(cinemaId, dateStr) {
  // Intentamos varias URLs del recinto El Puerto
  const attempts = [
    () => fetchArteSieteSubdomain(dateStr),
    () => fetchArteSieteCorp(dateStr),
  ];

  for (const attempt of attempts) {
    try {
      const movies = await attempt();
      if (movies && movies.length) return movies;
    } catch { /* probar la siguiente */ }
  }

  throw new Error('Arte Siete: no se pudieron obtener películas con ningún método');
}

// ── Método 1: bahia.artesiete.es (recinto específico) ─────────────────────────

async function fetchArteSieteSubdomain(dateStr) {
  // El recinto tiene ID 33 en su sistema
  const urls = [
    `https://bahia.artesiete.es/Cartelera/${CINEMA_ID}`,
    `https://bahia.artesiete.es/Cartelera/${CINEMA_ID}?fecha=${dateStr}`,
    `https://bahia.artesiete.es/Cine/${CINEMA_ID}/ARTESIETE-BAHIA/Total`,
  ];

  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const movies = parseArteSieteHtml(html, dateStr);
      if (movies.length) return movies;
    } catch { /* siguiente */ }
  }
  return null;
}

// ── Método 2: cinesartesiete.com (sede corporativa) ───────────────────────────

async function fetchArteSieteCorp(dateStr) {
  const urls = [
    `https://www.cinesartesiete.com/el-puerto-de-santa-maria?date=${dateStr}`,
    `https://www.cinesartesiete.com/cartelera/el-puerto`,
    `https://www.cinesartesiete.com/cartelera/el-puerto?date=${dateStr}`,
  ];

  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const movies = parseArteSieteHtml(html, dateStr);
      if (movies.length) return movies;
    } catch { /* siguiente */ }
  }
  return null;
}

// ── Parser genérico ────────────────────────────────────────────────────────────

function parseArteSieteHtml(html, dateStr) {
  // Intentar __NEXT_DATA__ (si usan Next.js)
  const ndM = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (ndM) {
    try {
      const json = JSON.parse(ndM[1]);
      const movies = extractArteSieteMovies(json, dateStr);
      if (movies.length) return movies;
    } catch { /* ignorar */ }
  }

  // Intentar JSON embebido genérico (script con type=application/json)
  const jsonM = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g);
  if (jsonM) {
    for (const block of jsonM) {
      const inner = block.replace(/<[^>]+>/g, '');
      try {
        const json = JSON.parse(inner);
        const movies = extractArteSieteMovies(json, dateStr);
        if (movies.length) return movies;
      } catch { /* ignorar */ }
    }
  }

  // Intentar parsear HTML clásico (estructura ASP.NET/PHP habitual)
  return parseArteSieteClassicHtml(html, dateStr);
}

function extractArteSieteMovies(json, dateStr) {
  const pp = json?.props?.pageProps ?? json ?? {};
  const candidates = [
    pp.movies, pp.films, pp.billboard, pp.cartelera,
    pp.data?.movies, pp.data?.films, pp.data?.billboard,
  ];
  for (const list of candidates) {
    if (Array.isArray(list) && list.length) {
      return list.map((f) => mapArteSieteFilm(f, dateStr));
    }
  }
  return [];
}

// Parser HTML clásico: busca patrones comunes en webs de cines PHP/ASP.NET
function parseArteSieteClassicHtml(html, dateStr) {
  const movies = [];

  // Buscar títulos con sus horarios (patrón habitual en webs de cines españoles)
  // Cada película suele estar en un contenedor con su título y sus pases
  const movieBlocks = html.match(/<(?:article|div|section)[^>]*class="[^"]*(?:pelicula|movie|film|cartel)[^"]*"[^>]*>[\s\S]*?<\/(?:article|div|section)>/gi) || [];

  for (const block of movieBlocks) {
    const titleM = block.match(/<(?:h[1-6]|strong|a)[^>]*>(.*?)<\/(?:h[1-6]|strong|a)>/i);
    const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : '';
    if (!title) continue;

    const timeMatches = block.match(/\b(\d{2}:\d{2})\b/g) || [];
    const sessions = timeMatches.map((t) => ({
      time: t,
      format: /3D/i.test(block) ? '3D' : '2D',
      language: /vos/i.test(block) ? 'VOSE' : 'VE',
      room: null,
      buyUrl: null,
    }));

    if (title && sessions.length) {
      movies.push({
        id: slugify(title),
        title,
        posterUrl: (block.match(/src="([^"]*(?:poster|cartel|pelicula)[^"]*)"/) || [])[1] || null,
        durationMin: null,
        genre: null,
        ageRating: null,
        synopsis: null,
        sessions: sortSessions(sessions),
      });
    }
  }

  return movies;
}

function mapArteSieteFilm(f, dateStr) {
  const title = f.title || f.Title || f.name || f.titulo || 'Sin título';
  const rawSessions = f.sessions || f.Sessions || f.showtimes || f.horarios || [];
  const sessions = rawSessions
    .filter((s) => {
      const d = s.date || s.Date || s.fecha || '';
      return !d || d.slice(0, 10) === dateStr;
    })
    .map((s) => ({
      time: (s.time || s.Time || s.hora || s.hour || '').slice(0, 5),
      format: s.format || s.Format || '2D',
      language: /vos/i.test(JSON.stringify(s)) ? 'VOSE' : 'VE',
      room: s.room || s.sala || null,
      buyUrl: s.buyUrl || s.url || null,
    }));

  return {
    id: slugify(title),
    title,
    posterUrl: f.poster || f.Poster || f.image || f.imagen || null,
    durationMin: Number(f.runtime || f.Runtime || f.duration || f.duracion) || null,
    genre: f.genre || f.Genre || f.genero || null,
    ageRating: f.rating || f.Rating || f.clasificacion || null,
    synopsis: f.synopsis || f.Synopsis || f.sinopsis || null,
    sessions: sortSessions(sessions),
  };
}
