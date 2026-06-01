// Adaptador de mk2 Cinesur Bahía de Cádiz.
//
// Estrategia confirmada:
//  1. Cartelera de este recinto → lista de películas con título/póster/duración.
//  2. Página individual de cada película → extraer sesiones cuyo enlace de compra
//     contenga "cinesur-bahia-de-cadiz" (identificador estable en cine.entradas.com).
//
// Las páginas de película muestran sesiones del día actual. Para otras fechas
// devolvemos las películas sin sesiones (mejor que datos inventados).

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const BASE = 'https://www.mk2cines.es';
const CARTELERA_URL = `${BASE}/es/mk2-cinesur-bahia-de-cadiz/cartelera`;
const CINEMA_SLUG_IN_URL = 'cinesur-bahia-de-cadiz';

export async function fetchMk2(cinemaId, dateStr) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  // Paso 1: lista de películas en cartelera
  const cartHtml = await fetchText(CARTELERA_URL);
  const movies = extractMovieList(cartHtml);
  if (!movies.length) throw new Error('mk2: no se encontraron películas en la cartelera');

  // Paso 2: sesiones por película (solo para hoy; futuras fechas → sin sesiones)
  const isToday = dateStr === today;
  const populated = await Promise.all(
    movies.map(async (movie) => {
      if (!isToday) return movie;
      try {
        const html = await fetchText(`${BASE}/es/${movie._slug}`, { timeoutMs: 9000 });
        const sessions = extractSessionsForCinema(html);
        return { ...movie, sessions };
      } catch {
        return movie;
      }
    })
  );

  // Devolver solo películas con sesiones (si hay), o todas si es para otra fecha
  const withSessions = populated.filter((m) => m.sessions.length > 0);
  const result = (isToday && withSessions.length > 0) ? withSessions : populated;

  if (!result.length) throw new Error('mk2: respuesta vacía tras procesar sesiones');

  // Limpiar campo interno antes de devolver
  return result.map(({ _slug, ...m }) => m);
}

// ── Extraer lista de películas de la página de cartelera ──────────────────────

function extractMovieList(html) {
  const movies = [];
  const seen = new Set();
  const SKIP = new Set([
    'aviso-privacidad', 'cartelera', 'vose', 'contacto', 'tarjeta-mk2',
    'horarios', 'mk2-cinesur-bahia-de-cadiz', 'cartelera-vose',
  ]);

  for (const block of html.split('<div class="film-list-item">').slice(1)) {
    // Título y slug
    const linkM = block.match(/href="https:\/\/www\.mk2cines\.es\/es\/([a-z0-9-]+)"[^>]*class="negro"[^>]*>([^<]+)<\/a>/);
    if (!linkM) continue;
    const slug = linkM[1];
    const title = linkM[2].trim();
    if (SKIP.has(slug) || seen.has(slug) || !title) continue;
    seen.add(slug);

    // Póster (relativo, lo convertimos a URL absoluta)
    const posterM = block.match(/src="(fr-\d+x\d+-data\/fotos\/[^"]+)"/);
    // Duración
    const durM = block.match(/(\d{2,3})\s*minutos/i);
    // Clasificación
    const ratingM = block.match(/<small>([^<]{3,40})<\/small>/);

    movies.push({
      id: slugify(title),
      title,
      posterUrl: posterM ? `${BASE}/${posterM[1]}` : null,
      durationMin: durM ? Number(durM[1]) : null,
      genre: null,
      ageRating: ratingM ? ratingM[1].trim() : null,
      synopsis: null,
      sessions: [],
      _slug: slug,
    });
  }
  return movies;
}

// ── Extraer sesiones de la página individual de una película ─────────────────

function extractSessionsForCinema(html) {
  const sessions = [];
  // Los enlaces de compra para este cine contienen "cinesur-bahia-de-cadiz"
  for (const m of html.matchAll(
    /<a[^>]+href="([^"]*cinesur-bahia-de-cadiz[^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  )) {
    const href = m[1].replace(/&amp;/g, '&');
    const content = m[2];
    const isVose = /<span[^>]*>VOSE<\/span>/i.test(content);
    const timeM = content.replace(/<[^>]+>/g, '').match(/\b(\d{2}:\d{2})\b/);
    if (!timeM) continue;

    sessions.push({
      time: timeM[1],
      format: '2D',
      language: isVose ? 'VOSE' : 'VE',
      room: null,
      buyUrl: href.includes('?') ? href.slice(0, href.indexOf('?')) : href,
    });
  }
  return sortSessions(sessions);
}
