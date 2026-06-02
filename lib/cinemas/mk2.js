// Adaptador de mk2 Cinesur Bahía de Cádiz.
//
// Estrategia para obtener datos REALES de todos los días:
//
//  1. Cartelera base → lista de películas (título, póster, duración, género).
//  2. Para cada día (hoy + 6 más) intentamos la cartelera con parámetro de fecha
//     (?dia=N, ?id_dia=N) — si el CMS soporta ese parámetro devuelve ese día.
//  3. Fallback: página individual de cada película con data-num para detectar
//     si el HTML contiene sesiones de varios días en una sola carga.
//  4. Si nada da resultado para un día concreto, el agregador lo rellena con muestra.
//
// Devolvemos { 'YYYY-MM-DD': [películas] } con todos los días con datos reales.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const BASE = 'https://www.mk2cines.es';
const CARTELERA_URL = `${BASE}/es/mk2-cinesur-bahia-de-cadiz/cartelera`;
const CINEMA_SLUG = 'cinesur-bahia-de-cadiz';
const DAYS_AHEAD = 6;

export async function fetchMk2() {
  const todayMadrid = madridToday();

  // ── 1. Cartelera base para obtener la lista de películas ──────────────────────
  const cartHtml = await fetchText(CARTELERA_URL);
  const movies = extractMovieList(cartHtml);
  if (!movies.length) throw new Error('mk2: no se encontraron películas en la cartelera');

  // ── 2. Intentar cartelera con parámetro de día para cada día ─────────────────
  // El CMS mk2/Cinemana en algunas instalaciones soporta ?dia=N (N=0 hoy, 1 mañana…)
  // Si la respuesta tiene sesiones del cine Bahía las usamos. Hacemos todas las
  // peticiones en paralelo para no bloquear.
  const dayHtmls = await fetchDayedCarteleras(DAYS_AHEAD);

  // ── 3. Construir byDate desde las carteleras por día ─────────────────────────
  const byDateFromCartelera = buildByDateFromDayedCarteleras(dayHtmls, todayMadrid, movies);

  // Si conseguimos sesiones de al menos hoy vía cartelera, devolvemos.
  if (byDateFromCartelera[todayMadrid]?.length) {
    return byDateFromCartelera;
  }

  // ── 4. Fallback: páginas individuales de película ────────────────────────────
  // Obtenemos hoy con certeza + intentamos extraer días adicionales vía data-num.
  const perMovie = await Promise.all(
    movies.map(async (movie) => {
      try {
        const html = await fetchText(`${BASE}/es/${movie._slug}`, { timeoutMs: 9000 });
        const sessionsByDate = extractSessionsByDateFromMoviePage(html, todayMadrid);
        const genre = extractGenreFromMoviePage(html);
        return { movie: { ...movie, genre: genre || movie.genre }, sessionsByDate };
      } catch {
        return { movie, sessionsByDate: {} };
      }
    })
  );

  const byDate = {};
  for (const { movie, sessionsByDate } of perMovie) {
    for (const [iso, sessions] of Object.entries(sessionsByDate)) {
      if (!sessions.length) continue;
      if (!byDate[iso]) byDate[iso] = [];
      const { _slug, ...clean } = movie;
      byDate[iso].push({ ...clean, sessions: sortSessions(sessions) });
    }
  }

  if (!Object.keys(byDate).length) throw new Error('mk2: no se pudieron extraer sesiones por día');
  return byDate;
}

// ── Carteleras con parámetro de día ──────────────────────────────────────────

async function fetchDayedCarteleras(daysAhead) {
  // Para cada offset probamos los dos parámetros más comunes del CMS.
  // El día 0 es la URL base (cartelera ya cargada antes, la pasamos vacía).
  const results = new Array(daysAhead + 1).fill(null);
  await Promise.all(
    Array.from({ length: daysAhead + 1 }, (_, offset) => async () => {
      if (offset === 0) return; // la URL base ya se cargó
      const urls = [
        `${CARTELERA_URL}?dia=${offset}`,
        `${CARTELERA_URL}?id_dia=${offset}`,
        `${CARTELERA_URL}?day=${offset}`,
      ];
      for (const url of urls) {
        try {
          const html = await fetchText(url, { timeoutMs: 8000 });
          // Verificar que devuelve sesiones del cine Bahía (no es la misma página de hoy)
          if (html.includes(CINEMA_SLUG) && html.includes('data-ho')) {
            results[offset] = html;
            return;
          }
          // Comprobar también si tiene bloques horarios
          if (html.includes('<div class="horarios">') && html.includes(CINEMA_SLUG)) {
            results[offset] = html;
            return;
          }
        } catch { /* URL no válida, probar la siguiente */ }
      }
    }).map((fn) => fn())
  );
  return results;
}

function buildByDateFromDayedCarteleras(dayHtmls, todayMadrid, baseMovies) {
  const byDate = {};
  // Para cada día con HTML, extraer sesiones de la cartelera
  dayHtmls.forEach((html, offset) => {
    if (!html) return;
    const iso = addDays(todayMadrid, offset);
    // Intentar extrar sesiones directamente de la cartelera de ese día
    const sessions = extractBahiaSessions(html);
    if (!sessions.length) return;

    // Como la cartelera no siempre da el título por sesión, asociamos por posición
    // en el listado. Mejor: extraer movie blocks completos con título + sesiones.
    const movieBlocks = extractMovieBlocksWithSessions(html, iso);
    if (movieBlocks.length) {
      byDate[iso] = movieBlocks;
    }
  });
  return byDate;
}

// Extrae bloques de película con sus sesiones de una página de cartelera
function extractMovieBlocksWithSessions(html, iso) {
  const movies = [];
  // Dividir por item de película
  for (const block of html.split('<div class="film-list-item">').slice(1)) {
    const linkM = block.match(/href="https:\/\/www\.mk2cines\.es\/es\/([a-z0-9-]+)"[^>]*class="negro"[^>]*>([^<]+)<\/a>/);
    if (!linkM) continue;
    const title = linkM[2].trim();
    if (!title) continue;

    const sessions = extractBahiaSessions(block);
    if (!sessions.length) continue;

    const posterM = block.match(/src="(fr-\d+x\d+-data\/fotos\/[^"]+)"/);
    const durM = block.match(/(\d{2,3})\s*minutos/i);
    const ratingM = block.match(/<small>([^<]{3,40})<\/small>/);
    const genreM = block.match(/class="[^"]*gen[eé]ro[^"]*"[^>]*>([^<]{2,40})</) ||
                   block.match(/class="[^"]*genre[^"]*"[^>]*>([^<]{2,40})</);

    movies.push({
      id: slugify(title),
      title,
      posterUrl: posterM ? `${BASE}/${posterM[1]}` : null,
      durationMin: durM ? Number(durM[1]) : null,
      genre: genreM ? genreM[1].trim() : null,
      ageRating: ratingM ? ratingM[1].trim() : null,
      synopsis: null,
      rating: null,
      sessions: sortSessions(sessions),
    });
  }
  return movies;
}

// ── Sesiones de la página individual de película (fallback) ──────────────────

function extractSessionsByDateFromMoviePage(html, todayMadrid) {
  // Intentar extraer múltiples días usando data-num en el HTML
  const segments = splitDaySegments(html);
  if (segments.length > 1) {
    const result = {};
    for (const { num, html: seg } of segments) {
      const sessions = extractBahiaSessions(seg);
      if (!sessions.length) continue;
      const iso = addDays(todayMadrid, parseInt(num, 10) || 0);
      if (!result[iso]) result[iso] = [];
      result[iso].push(...sessions);
    }
    // Deduplicar por día
    for (const iso of Object.keys(result)) {
      const seen = new Set();
      result[iso] = result[iso].filter((s) => {
        const k = `${s.time}|${s.language}|${s.room || ''}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    if (Object.keys(result).length) return result;
  }

  // Si no hay data-num múltiples, extraer solo sesiones de hoy
  const sessions = extractBahiaSessions(html);
  return sessions.length ? { [todayMadrid]: sessions } : {};
}

// ── Lista de películas (página de cartelera base) ─────────────────────────────

function extractMovieList(html) {
  const movies = [];
  const seen = new Set();
  const SKIP = new Set([
    'aviso-privacidad', 'cartelera', 'vose', 'contacto', 'tarjeta-mk2',
    'horarios', 'mk2-cinesur-bahia-de-cadiz', 'cartelera-vose',
  ]);

  for (const block of html.split('<div class="film-list-item">').slice(1)) {
    const linkM = block.match(/href="https:\/\/www\.mk2cines\.es\/es\/([a-z0-9-]+)"[^>]*class="negro"[^>]*>([^<]+)<\/a>/);
    if (!linkM) continue;
    const slug = linkM[1];
    const title = linkM[2].trim();
    if (SKIP.has(slug) || seen.has(slug) || !title) continue;
    seen.add(slug);

    const posterM = block.match(/src="(fr-\d+x\d+-data\/fotos\/[^"]+)"/);
    const durM = block.match(/(\d{2,3})\s*minutos/i);
    const ratingM = block.match(/<small>([^<]{3,40})<\/small>/);
    const genreM = block.match(/class="[^"]*gen[eé]ro[^"]*"[^>]*>([^<]{2,40})</) ||
                   block.match(/class="[^"]*genre[^"]*"[^>]*>([^<]{2,40})</);

    movies.push({
      id: slugify(title),
      title,
      posterUrl: posterM ? `${BASE}/${posterM[1]}` : null,
      durationMin: durM ? Number(durM[1]) : null,
      genre: genreM ? genreM[1].trim() : null,
      ageRating: ratingM ? ratingM[1].trim() : null,
      synopsis: null,
      rating: null,
      sessions: [],
      _slug: slug,
    });
  }
  return movies;
}

// ── Género desde la página individual de película ─────────────────────────────

function extractGenreFromMoviePage(html) {
  const patterns = [
    /class="[^"]*gen[eé]ro[^"]*"[^>]*>\s*([^<]{2,40})\s*</i,
    /class="[^"]*genre[^"]*"[^>]*>\s*([^<]{2,40})\s*</i,
    /[Gg]én[ée]ro[^:]*:\s*<[^>]+>\s*([^<]{2,40})\s*</,
    /[Gg]én[ée]ro[^:]*:\s*([A-ZÁÉÍÓÚÑA-Záéíóúña-z][^<\n,]{1,30})/,
    /<meta[^>]+name="genre"[^>]*content="([^"]{2,40})"/i,
    /<meta[^>]+content="([^"]{2,40})"[^>]*name="genre"/i,
    /class="[^"]*tipo[^"]*"[^>]*>\s*([^<]{2,40})\s*</i,
    /class="[^"]*categor[^"]*"[^>]*>\s*([^<]{2,40})\s*</i,
  ];
  for (const p of patterns) {
    const val = html.match(p)?.[1]?.trim();
    if (val && val.length > 1 && val.length < 40) return val;
  }
  return null;
}

// ── Sesiones del cine Bahía dentro de un bloque HTML ─────────────────────────

function extractBahiaSessions(segmentHtml) {
  const sessions = [];
  const blocks = segmentHtml.split('<div class="horarios">').slice(1);
  for (const block of blocks) {
    if (!block.includes(CINEMA_SLUG)) continue;
    const room = detectRoom(block);
    for (const a of block.matchAll(
      /<a[^>]+href="([^"]*cinesur-bahia-de-cadiz[^"]*)"[^>]*>([\s\S]*?)<\/a>/g
    )) {
      const href = a[1].replace(/&amp;/g, '&');
      const content = a[2];
      const isVose = /<span[^>]*>\s*VOSE\s*<\/span>/i.test(content);
      const timeM = content.replace(/<[^>]+>/g, '').match(/\b(\d{1,2}:\d{2})\b/);
      if (!timeM) continue;
      sessions.push({
        time: timeM[1].padStart(5, '0'),
        format: '2D',
        language: isVose ? 'VOSE' : 'VE',
        room,
        buyUrl: href.includes('?') ? href.slice(0, href.indexOf('?')) : href,
      });
    }
  }
  const seen = new Set();
  return sessions.filter((s) => {
    const k = `${s.time}|${s.language}|${s.room || ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function detectRoom(block) {
  const m = block.match(/rotulo_sala_(\w+)"[^>]*>([^<]+)</i);
  if (!m) return null;
  const type = m[1].toLowerCase();
  if (type.includes('premium')) return 'Sala Premium';
  if (type.includes('confort')) return 'Sala Confort';
  return (m[2] || '').trim() || null;
}

// ── Segmentos de contenido por data-num (multi-día en una página) ─────────────

function splitDaySegments(html) {
  const markers = [];
  const re = /data-num="(\d+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const idx = m.index;
    const before = html.slice(Math.max(0, idx - 90), idx);
    if (!/cambiar-dia|rotulo_dia/.test(before)) {
      markers.push({ num: m[1], idx });
    }
  }
  if (!markers.length) return [];
  return markers.map((mk, i) => ({
    num: mk.num,
    html: html.slice(mk.idx, i + 1 < markers.length ? markers[i + 1].idx : html.length),
  }));
}

// ── Fechas ────────────────────────────────────────────────────────────────────

function madridToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
