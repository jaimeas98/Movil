// Adaptador de mk2 Cinesur Bahía de Cádiz.
//
// Estrategia:
//  1. Cartelera del recinto → lista de películas (título, póster, duración…).
//  2. Página individual de cada película → contiene la programación de VARIOS
//     días. Cada día es una pestaña (rotulo_dia{N}, data-num) y su contenido
//     un bloque por cine. Dentro del bloque de "Bahía de Cádiz" extraemos las
//     sesiones (enlaces a cine.entradas.com con "cinesur-bahia-de-cadiz") y el
//     tipo de sala (rotulo_sala_premium / confort).
//
// Devolvemos un mapa { 'YYYY-MM-DD': [películas] } con todos los días.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const BASE = 'https://www.mk2cines.es';
const CARTELERA_URL = `${BASE}/es/mk2-cinesur-bahia-de-cadiz/cartelera`;
const CINEMA_SLUG = 'cinesur-bahia-de-cadiz';

export async function fetchMk2() {
  const todayMadrid = madridToday();

  // Paso 1: lista de películas en cartelera
  const cartHtml = await fetchText(CARTELERA_URL);
  const movies = extractMovieList(cartHtml);
  if (!movies.length) throw new Error('mk2: no se encontraron películas en la cartelera');

  // Paso 2: para cada película, sesiones + género desde la página individual
  const perMovie = await Promise.all(
    movies.map(async (movie) => {
      try {
        const html = await fetchText(`${BASE}/es/${movie._slug}`, { timeoutMs: 9000 });
        const sessionsByDate = extractSessionsByDate(html, todayMadrid);
        const genre = extractGenreFromMoviePage(html);
        return { movie: { ...movie, genre: genre || movie.genre }, sessionsByDate };
      } catch {
        return { movie, sessionsByDate: {} };
      }
    })
  );

  // Paso 3: reorganizar a { fecha: [películas] }
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

// ── Lista de películas (página de cartelera) ──────────────────────────────────

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
    // Algunos listados incluyen el género en una etiqueta de tipo "categoría"
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

// ── Género desde la página individual de película ────────────────────────────

function extractGenreFromMoviePage(html) {
  // Varios patrones posibles en páginas de cine españolas
  const patterns = [
    // <span class="genre">Animación</span> o variantes
    /class="[^"]*gen[eé]ro[^"]*"[^>]*>\s*([^<]{2,40})\s*</i,
    /class="[^"]*genre[^"]*"[^>]*>\s*([^<]{2,40})\s*</i,
    // Género: <span>Acción</span>
    /[Gg]én[ée]ro[^:]*:\s*<[^>]+>\s*([^<]{2,40})\s*</,
    /[Gg]én[ée]ro[^:]*:\s*([A-ZÁÉÍÓÚÑA-Záéíóúña-z][^<\n,]{1,30})/,
    // <meta property="og:description"> a veces incluye el género
    /<meta[^>]+name="genre"[^>]*content="([^"]{2,40})"/i,
    /<meta[^>]+content="([^"]{2,40})"[^>]*name="genre"/i,
    // Etiqueta "tipo" o "categoría"
    /class="[^"]*tipo[^"]*"[^>]*>\s*([^<]{2,40})\s*</i,
    /class="[^"]*categor[^"]*"[^>]*>\s*([^<]{2,40})\s*</i,
  ];

  for (const p of patterns) {
    const m = html.match(p);
    const val = m?.[1]?.trim();
    if (val && val.length > 1 && val.length < 40) return val;
  }
  return null;
}

// ── Sesiones por día (página individual de película) ──────────────────────────

function extractSessionsByDate(html, todayMadrid) {
  // 1) Pestañas de día: rotulo_dia{N} … cambiar-dia … data-num="N" > Etiqueta
  const dayDates = parseDayTabs(html, todayMadrid); // { num: iso }
  const numKeys = Object.keys(dayDates);
  if (!numKeys.length) return {};

  // 2) Contenedores de contenido por día: data-num que NO son pestañas.
  const segments = splitDaySegments(html); // [{ num, html }]

  const result = {};

  if (segments.length) {
    // Cada segmento de contenido pertenece a un día.
    for (const seg of segments) {
      const iso = dayDates[seg.num];
      if (!iso) continue;
      const sessions = extractBahiaSessions(seg.html);
      if (sessions.length) result[iso] = (result[iso] || []).concat(sessions);
    }
  } else {
    // Sin segmentos separados: el HTML muestra solo el día por defecto (hoy).
    const sessions = extractBahiaSessions(html);
    if (sessions.length) result[todayMadrid] = sessions;
  }

  return result;
}

// Pestañas: devuelve { '0': '2026-06-01', '1': '2026-06-02', ... }
function parseDayTabs(html, todayMadrid) {
  const out = {};
  const re = /(rotulo_dia\d*[^"]*cambiar-dia|cambiar-dia[^"]*rotulo_dia\d*)[^"]*"\s+data-num="(\d+)"[^>]*>([^<]+)</g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const num = m[2];
    const label = m[3].trim();
    const iso = labelToIso(label, num, todayMadrid);
    if (iso) out[num] = iso;
  }
  return out;
}

// Segmentos de contenido por día: localizamos los data-num que NO son pestañas
// (no llevan cambiar-dia/rotulo_dia cerca) y cortamos entre ellos.
function splitDaySegments(html) {
  const markers = [];
  const re = /data-num="(\d+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const idx = m.index;
    const before = html.slice(Math.max(0, idx - 90), idx);
    const isTab = /cambiar-dia|rotulo_dia/.test(before);
    if (!isTab) markers.push({ num: m[1], idx });
  }
  if (!markers.length) return [];

  const segments = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].idx;
    const end = i + 1 < markers.length ? markers[i + 1].idx : html.length;
    segments.push({ num: markers[i].num, html: html.slice(start, end) });
  }
  return segments;
}

// Extrae sesiones del cine Bahía dentro de un trozo de HTML (un día).
// Maneja varios bloques (p.ej. Sala Premium y sala normal) con su tipo de sala.
function extractBahiaSessions(segmentHtml) {
  const sessions = [];

  // Cada cine es un bloque <div class="horarios">…<div class="horas">…</div></div>
  const blocks = segmentHtml.split('<div class="horarios">').slice(1);
  for (const block of blocks) {
    if (!block.includes(CINEMA_SLUG)) continue; // solo el cine Bahía

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

  // Deduplicar por hora+idioma+sala (el HTML repite bloques móvil/escritorio).
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

// ── Fechas ────────────────────────────────────────────────────────────────────

function madridToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// Convierte la etiqueta de pestaña a ISO. Acepta "Hoy", "Mañana" y "Weekday DD/MM".
function labelToIso(label, num, todayMadrid) {
  const low = label.toLowerCase();
  if (low.includes('hoy')) return todayMadrid;
  if (low.includes('mañana') || low.includes('manana')) return addDays(todayMadrid, 1);

  const dm = label.match(/(\d{1,2})\/(\d{1,2})/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    const [ty, tm] = todayMadrid.split('-').map(Number);
    // Si el mes de la etiqueta es anterior al actual, es del próximo año.
    const year = month < tm ? ty + 1 : ty;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Sin fecha legible: asumir días consecutivos desde hoy.
  return addDays(todayMadrid, Number(num) || 0);
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
