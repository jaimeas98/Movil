// Adaptador de mk2 Cinesur Bahía de Cádiz.
//
// Estrategia confirmada:
//  1. Cartelera de este recinto → lista de películas con título/póster/duración.
//  2. Página individual de cada película → extraer sesiones cuyo enlace de compra
//     contenga "cinesur-bahia-de-cadiz" (identificador estable en cine.entradas.com).
//
// mk2 solo publica sesiones del día actual en sus páginas de película.
// Para otras fechas lanzamos error → el agregador usa datos de muestra.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const BASE = 'https://www.mk2cines.es';
const CARTELERA_URL = `${BASE}/es/mk2-cinesur-bahia-de-cadiz/cartelera`;

export async function fetchMk2(cinemaId, dateStr) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  // mk2 solo muestra sesiones del día actual
  if (dateStr !== today) throw new Error('mk2: solo disponible para hoy');

  // Paso 1: lista de películas en cartelera
  const cartHtml = await fetchText(CARTELERA_URL);
  const movies = extractMovieList(cartHtml);
  if (!movies.length) throw new Error('mk2: no se encontraron películas en la cartelera');

  // Paso 2: sesiones por película
  const populated = await Promise.all(
    movies.map(async (movie) => {
      try {
        const html = await fetchText(`${BASE}/es/${movie._slug}`, { timeoutMs: 9000 });
        const sessions = extractSessionsForCinema(html);
        return { ...movie, sessions };
      } catch {
        return movie;
      }
    })
  );

  const result = populated.filter((m) => m.sessions.length > 0);
  if (!result.length) throw new Error('mk2: sin sesiones para hoy');

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
  const seen = new Set();
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

    // Deduplicar por time+idioma (el HTML repite bloques para móvil/escritorio)
    const key = `${timeM[1]}|${isVose}`;
    if (seen.has(key)) continue;
    seen.add(key);

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
