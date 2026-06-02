// Adaptador de mk2 Cinesur Bahía de Cádiz.
//
// Estrategia multi-día:
//  1. Cartelera base (hoy): extrae lista de películas Y sesiones de hoy.
//  2. Para cada día futuro (offset 1-6):
//     a) Busca enlaces de navegación reales en el HTML de la cartelera base
//        (elementos class="cambiar-dia" con href, o datos en JS/data-*).
//     b) Si no los encuentra, prueba parámetros comunes del CMS Cinemana:
//        ?id_dia=N, ?dia=N, ?day=N, /cartelera/{YYYY-MM-DD}.
//     c) Valida que la respuesta NO sea el mismo HTML de hoy (params ignorados).
//  3. Si ningún día futuro se obtuvo vía cartelera, intenta páginas individuales
//     de película con splitDaySegments para multi-día en una sola carga.
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

  // ── 1. Cartelera base ─────────────────────────────────────────────────────────
  const cartHtml = await fetchText(CARTELERA_URL);
  const movies = extractMovieList(cartHtml);
  if (!movies.length) throw new Error('mk2: no se encontraron películas en la cartelera');

  // ── 2a. La cartelera base puede tener TODOS los días con data-num  ───────────
  // Algunos CMS sirven todos los días en el HTML inicial; splitDaySegments los separa.
  const cartSegments = splitDaySegments(cartHtml);
  if (cartSegments.length > 1) {
    const byDateSegs = {};
    for (const { num, html: seg } of cartSegments) {
      const iso = addDays(todayMadrid, parseInt(num, 10) || 0);
      const blocks = extractMovieBlocksWithSessions(seg, iso);
      if (blocks.length) byDateSegs[iso] = blocks;
    }
    if (byDateSegs[todayMadrid]?.length) return byDateSegs;
  }

  // ── 2b. Carteleras por día (hoy ya en index 0) ────────────────────────────────
  const dayHtmls = await fetchDayedCarteleras(cartHtml, todayMadrid, DAYS_AHEAD);

  // ── 3. Construir byDate: offset 0 siempre tiene el HTML de hoy ────────────────
  const byDate = buildByDateFromDayedCarteleras(dayHtmls, todayMadrid);

  // Si tenemos sesiones de hoy (siempre que el HTML sea válido), devolvemos.
  // byDate puede incluir también días futuros si el CMS soporta parámetros de día.
  if (byDate[todayMadrid]?.length) {
    return byDate;
  }

  // ── 4. Fallback: páginas individuales de película ────────────────────────────
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

  const byDateFallback = {};
  for (const { movie, sessionsByDate } of perMovie) {
    for (const [iso, sessions] of Object.entries(sessionsByDate)) {
      if (!sessions.length) continue;
      if (!byDateFallback[iso]) byDateFallback[iso] = [];
      const { _slug, ...clean } = movie;
      byDateFallback[iso].push({ ...clean, sessions: sortSessions(sessions) });
    }
  }

  // Fusionar días futuros de cartelera (si los hay) con el fallback de hoy
  for (const [iso, mlist] of Object.entries(byDate)) {
    if (!byDateFallback[iso]?.length && mlist.length) {
      byDateFallback[iso] = mlist;
    }
  }

  if (!Object.keys(byDateFallback).length) throw new Error('mk2: no se pudieron extraer sesiones por día');
  return byDateFallback;
}

// ── Obtener HTMLs de cartelera para cada día ──────────────────────────────────

async function fetchDayedCarteleras(baseHtml, todayMadrid, daysAhead) {
  // results[0] = hoy (ya tenemos el HTML base)
  const results = new Array(daysAhead + 1).fill(null);
  results[0] = baseHtml;

  // Intentar extraer enlaces de navegación del HTML
  const navLinks = extractNavLinks(baseHtml);

  // Firma del HTML de hoy para detectar si los parámetros son ignorados
  const todaySig = sessionSignature(baseHtml);

  await Promise.all(
    Array.from({ length: daysAhead }, (_, i) => async () => {
      const offset = i + 1;
      const isoTarget = addDays(todayMadrid, offset);

      // 1. Intentar el enlace de navegación real (si existe en el HTML)
      const navLink = navLinks[i]; // los enlaces están en orden: mañana, pasado, …
      if (navLink) {
        try {
          const url = navLink.startsWith('http') ? navLink : `${BASE}${navLink}`;
          const html = await fetchText(url, { timeoutMs: 8000 });
          if (isValidDayHtml(html, todaySig)) {
            results[offset] = html;
            return;
          }
        } catch { /* probar siguiente */ }
      }

      // 2. Parámetros comunes de Cinemana/mk2 CMS
      const candidates = [
        `${CARTELERA_URL}?id_dia=${offset}`,
        `${CARTELERA_URL}?dia=${offset}`,
        `${CARTELERA_URL}?day=${offset}`,
        `${CARTELERA_URL}/${isoTarget}`,
        `${CARTELERA_URL}?fecha=${isoTarget}`,
      ];
      for (const url of candidates) {
        try {
          const html = await fetchText(url, { timeoutMs: 8000 });
          if (isValidDayHtml(html, todaySig)) {
            results[offset] = html;
            return;
          }
        } catch { /* probar siguiente */ }
      }
    }).map((fn) => fn())
  );
  return results;
}

// Comprueba que el HTML tiene sesiones del cine Bahía y que NO es el mismo día.
function isValidDayHtml(html, todaySig) {
  if (!html.includes(CINEMA_SLUG)) return false;
  if (!html.includes('data-ho') && !html.includes('<div class="horarios">')) return false;
  // Si la firma de sesiones es idéntica a la de hoy, el CMS ignoró el parámetro
  if (sessionSignature(html) === todaySig) return false;
  return true;
}

// Firma corta de la sección de sesiones para detectar páginas idénticas
function sessionSignature(html) {
  const pos = html.indexOf('<div class="horarios">');
  if (pos < 0) return html.slice(0, 200);
  return html.slice(pos, pos + 600);
}

// Extrae enlaces de la navegación de días del HTML de la cartelera
function extractNavLinks(html) {
  const links = [];
  const seen = new Set();
  const add = (href) => {
    if (!href || href === '#' || seen.has(href)) return;
    seen.add(href);
    links.push(href);
  };

  // Pattern A: <a class="cambiar-dia" href="...">
  for (const re of [
    /<a[^>]+class="[^"]*cambiar-dia[^"]*"[^>]+href="([^"#][^"]*)"/gi,
    /<a[^>]+href="([^"#][^"]*)"[^>]+class="[^"]*cambiar-dia[^"]*"/gi,
  ]) {
    let m;
    while ((m = re.exec(html)) !== null) add(m[1]);
  }

  // Pattern B: data-url o data-href en cualquier elemento de cambiar-dia
  const reB = /class="[^"]*cambiar-dia[^"]*"[^>]+data-(?:url|href)="([^"#][^"]*)"/gi;
  let m;
  while ((m = reB.exec(html)) !== null) add(m[1]);

  // Pattern C: hrefs con id_dia= o dia= en el contexto de la cartelera
  const reC = /href="([^"]*(?:cartelera)[^"]*(?:id_dia|dia|day)=[^"]*)"/gi;
  while ((m = reC.exec(html)) !== null) add(m[1]);

  return links;
}

// ── Construir byDate desde los HTMLs de cartelera ────────────────────────────

function buildByDateFromDayedCarteleras(dayHtmls, todayMadrid) {
  const byDate = {};
  dayHtmls.forEach((html, offset) => {
    if (!html) return;
    const iso = addDays(todayMadrid, offset);
    const movieBlocks = extractMovieBlocksWithSessions(html, iso);
    if (movieBlocks.length) byDate[iso] = movieBlocks;
  });
  return byDate;
}

// Extrae bloques de película con sus sesiones de una página de cartelera
function extractMovieBlocksWithSessions(html, iso) {
  const movies = [];
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
      const fullTag = a[0]; // full <a ...>...</a>
      const href = a[1].replace(/&amp;/g, '&');
      const content = a[2];
      const isVose = /<span[^>]*>\s*VOSE\s*<\/span>/i.test(content);

      // Extraer hora: primero del texto del enlace, luego del atributo data-ho="HHMM"
      const textTime = content.replace(/<[^>]+>/g, '').match(/\b(\d{1,2}:\d{2})\b/);
      let time;
      if (textTime) {
        time = textTime[1].padStart(5, '0');
      } else {
        const hoM = fullTag.match(/\bdata-ho="(\d{3,4})"/);
        if (!hoM) continue;
        const ho = hoM[1].padStart(4, '0');
        time = `${ho.slice(0, 2)}:${ho.slice(2)}`;
      }

      sessions.push({
        time,
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
