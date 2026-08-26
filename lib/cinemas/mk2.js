// Adaptador de mk2 Cinesur Bahía de Cádiz.
//
// A día de hoy la cartelera de mk2 NO trae horarios: es solo un índice de
// películas. Los pases viven en la ficha de cada película, que muestra sus días
// en pestañas (`rotulo_dia`) rotuladas "Hoy", "Mañana" o "Sábado 22/08".
//
// Estrategia:
//  1. Cartelera base → lista de películas (título, cartel, duración, edad).
//  2. Si la cartelera trajera horarios (como hacía antes), se intenta primero
//     por ahí, incluidas las variantes por día del CMS Cinemana.
//  3. Ficha de cada película → sesiones del cine Bahía, agrupadas por día.
//
// REGLA IMPORTANTE sobre las fechas: el `data-num` de cada pestaña es su índice
// dentro de esa ficha, NO un desplazamiento desde hoy — una película que solo se
// proyecta el 29 de octubre tiene una única pestaña con data-num="0". La fecha
// se lee siempre del TEXTO del rótulo, y la sesión que no se pueda fechar se
// descarta en vez de suponer que es de hoy.
//
// Devolvemos { 'YYYY-MM-DD': [películas] } con todos los días con datos reales.

import { fetchText } from './http.js';
import { decodeEntities, slugify, sortSessions } from '../normalize.js';

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

  // La cartelera puede venir SIN horarios: hoy mk2 la usa solo como índice de
  // películas y los pases viven en la ficha de cada una. Cuando es así, los
  // caminos 2a/2b/3 no pueden dar nada, y 2b además gasta decenas de peticiones
  // probando parámetros de día que nunca validan. Nos saltamos todo eso.
  const carteleraTieneHorarios = cartHtml.includes('<div class="horarios">');
  let carteleraByDate = {}; // días obtenidos vía cartelera, para fusionar al final

  if (carteleraTieneHorarios) {
    // ── 2a. La cartelera puede traer TODOS los días con data-num ──────────────
    // Igual que en las fichas, la fecha buena es la del texto del rótulo; el
    // índice data-num no es un desplazamiento desde hoy.
    const cartSegments = splitDaySegments(cartHtml);
    if (cartSegments.length > 1) {
      const byDateSegs = {};
      for (const { html: seg } of cartSegments) {
        const iso = isoFromSegment(seg, todayMadrid);
        if (!iso) continue;
        const blocks = extractMovieBlocksWithSessions(seg, iso);
        if (blocks.length) byDateSegs[iso] = blocks;
      }
      if (byDateSegs[todayMadrid]?.length) return byDateSegs;
    }

    // ── 2b. Carteleras por día (hoy ya en index 0) ────────────────────────────
    const dayHtmls = await fetchDayedCarteleras(cartHtml, todayMadrid, DAYS_AHEAD);

    // ── 3. Construir byDate: offset 0 siempre tiene el HTML de hoy ────────────
    carteleraByDate = buildByDateFromDayedCarteleras(dayHtmls, todayMadrid);
    if (carteleraByDate[todayMadrid]?.length) return carteleraByDate;
  }

  // ── 4. Fichas individuales de película ───────────────────────────────────────
  const perMovie = await Promise.all(
    movies.map(async (movie) => {
      try {
        const html = await fetchText(`${BASE}/es/${movie._slug}`, { timeoutMs: 9000 });
        const sessionsByDate = extractSessionsByDateFromMoviePage(html, todayMadrid);
        const genre = extractGenreFromMoviePage(html);
        const synopsis = extractSynopsisFromMoviePage(html);
        return {
          movie: {
            ...movie,
            genre: genre || movie.genre,
            synopsis: synopsis || movie.synopsis,
            ageRating: cleanAgeRating(movie.ageRating),
          },
          sessionsByDate,
        };
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
  for (const [iso, mlist] of Object.entries(carteleraByDate)) {
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

// mk2 sirve los carteles a través de un redimensionador que lleva el tamaño en
// la propia ruta: "fr-216x326-data/fotos/x.jpg". 216px de ancho se ve borroso en
// cuanto la pantalla tiene algo de densidad, que es justo lo que se nota al
// comparar con Arte Siete, que sirve el archivo original. Pedimos el triple.
function carteleGrande(ruta) {
  if (!ruta) return null;
  return `${BASE}/${ruta.replace(/^fr-\d+x\d+-data/, 'fr-648x978-data')}`;
}

// Extrae bloques de película con sus sesiones de una página de cartelera
function extractMovieBlocksWithSessions(html, iso) {
  const movies = [];
  for (const block of html.split('<div class="film-list-item">').slice(1)) {
    const linkM = block.match(/href="https:\/\/www\.mk2cines\.es\/es\/([a-z0-9-]+)"[^>]*class="negro"[^>]*>([^<]+)<\/a>/);
    if (!linkM) continue;
    const title = decodeEntities(linkM[2]).trim();
    if (!title) continue;

    const sessions = extractBahiaSessions(block);
    if (!sessions.length) continue;

    const posterM = block.match(/src="(fr-\d+x\d+-data\/fotos\/[^"]+)"/);
    const durM = block.match(/(\d{2,3})\s*minutos/i);
    const ratingM = block.match(/<small>([^<]{3,40})<\/small>/);
    const genreM = block.match(/class="[^"]*gen[eé]ro[^"]*"[^>]*>([^<]{2,40})</) ||
                   block.match(/class="[^"]*genre[^"]*"[^>]*>([^<]{2,40})</);
    const isNew = /class="[^"]*cartel-novedad[^"]*"[^>]*>\s*ESTRENO/i.test(block);

    movies.push({
      id: slugify(title),
      title,
      posterUrl: carteleGrande(posterM?.[1]),
      durationMin: durM ? Number(durM[1]) : null,
      genre: genreM ? genreM[1].trim() : null,
      ageRating: cleanAgeRating(ratingM ? ratingM[1].trim() : null),
      synopsis: null,
      rating: null,
      isNew,
      sessions: sortSessions(sessions),
    });
  }
  return movies;
}

// ── Sesiones de la página individual de película (fallback) ──────────────────

export function extractSessionsByDateFromMoviePage(html, todayMadrid) {
  // OJO con `data-num`: es el índice de la pestaña de día DENTRO de la ficha de
  // esa película, NO un desplazamiento desde hoy. Una película que solo se
  // proyecta el 29 de octubre tiene un único rótulo con data-num="0". Deducir
  // la fecha del índice metía todo el ciclo de clásicos en el día de hoy.
  // La fecha REAL siempre está en el texto del rótulo ("Jueves 29/10", "Mañana"),
  // así que es la única fuente que usamos: lo que no sepamos fechar, se descarta.
  const result = {};
  for (const { html: seg } of splitDaySegments(html)) {
    const sessions = extractBahiaSessions(seg);
    if (!sessions.length) continue;
    const iso = isoFromSegment(seg, todayMadrid);
    if (!iso) continue; // sin fecha fiable preferimos no enseñar la sesión
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
  return result;
}

// Lee la fecha real (ISO YYYY-MM-DD) del título del rotulo_dia que abre el
// segmento. El texto es del tipo "Jueves 04/06" — DD/MM sin año. Inferimos el
// año a partir de hoy con tolerancia para el cambio de año (si el mes parseado
// es mucho menor que el actual, asumimos año siguiente).
export function isoFromSegment(seg, todayIso) {
  const m = seg.match(/rotulo_dia[^>]*>([^<]+)</);
  if (!m) return null;
  const label = m[1].trim();

  // Los primeros días mk2 los rotula en relativo, sin fecha: "Hoy", "Mañana".
  if (/^hoy\b/i.test(label)) return todayIso;
  if (/^ma[ñn]ana\b/i.test(label)) return addDays(todayIso, 1);

  // El resto llevan "Sábado 22/08" — día y mes, nunca el año.
  const dm = label.match(/(\d{1,2})\/(\d{1,2})/);
  if (!dm) return null;
  const day = String(dm[1]).padStart(2, '0');
  const month = String(dm[2]).padStart(2, '0');
  const year = Number(todayIso.slice(0, 4));
  const iso = `${year}-${month}-${day}`;
  // Como no hay año, una fecha ya pasada solo puede ser del año siguiente
  // (ciclos que cruzan diciembre).
  return iso < todayIso ? `${year + 1}-${month}-${day}` : iso;
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
    const title = decodeEntities(linkM[2]).trim();
    if (SKIP.has(slug) || seen.has(slug) || !title) continue;
    seen.add(slug);

    const posterM = block.match(/src="(fr-\d+x\d+-data\/fotos\/[^"]+)"/);
    const durM = block.match(/(\d{2,3})\s*minutos/i);
    const ratingM = block.match(/<small>([^<]{3,40})<\/small>/);
    const genreM = block.match(/class="[^"]*gen[eé]ro[^"]*"[^>]*>([^<]{2,40})</) ||
                   block.match(/class="[^"]*genre[^"]*"[^>]*>([^<]{2,40})</);
    const isNew = /class="[^"]*cartel-novedad[^"]*"[^>]*>\s*ESTRENO/i.test(block);

    movies.push({
      id: slugify(title),
      title,
      posterUrl: carteleGrande(posterM?.[1]),
      durationMin: durM ? Number(durM[1]) : null,
      genre: genreM ? genreM[1].trim() : null,
      ageRating: cleanAgeRating(ratingM ? ratingM[1].trim() : null),
      synopsis: null,
      rating: null,
      isNew,
      sessions: [],
      _slug: slug,
    });
  }
  return movies;
}

// ── Sinopsis desde la página individual de película ──────────────────────────
//
// En el HTML actual de mk2 la sinopsis vive en <span class="sinopsis gibsonL">
// y puede contener varios <p> con texto. Quitamos tags, normalizamos espacios
// y devolvemos el texto plano.
function extractSynopsisFromMoviePage(html) {
  const m = html.match(/<span[^>]*class="[^"]*sinopsis[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  if (!m) return null;
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 5 ? text : null;
}

// Normaliza la calificación por edad: descarta "Pendiente de calificación" y
// abrevia las cadenas largas que vienen del HTML a algo más compacto.
function cleanAgeRating(raw) {
  if (!raw) return null;
  if (/pendiente/i.test(raw)) return null;
  if (/apta para todos/i.test(raw)) return 'TP';
  let m = raw.match(/no recomendada (?:a )?menores (?:de )?(\d{1,2})/i);
  if (m) return `+${m[1]}`;
  m = raw.match(/no recomendada (?:para )?menores de (\d{1,2})/i);
  if (m) return `+${m[1]}`;
  return raw;
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

      // Extraer hora del texto del enlace. En el HTML real de mk2 el contenido
      // del <a> es típicamente "<span>VOSE</span>18:30" o "18:30". Tras quitar
      // tags queda "VOSE18:30" o "18:30" — un \b al inicio del regex falla
      // porque entre letra y dígito no hay word-boundary, así que matcheamos
      // sin \b y validamos rango horario para evitar falsos positivos.
      // El atributo data-ho NO contiene horas (es un id de sesión, ej. "9364"),
      // así que ya no se usa como fuente de horario.
      const textRaw = content.replace(/<[^>]+>/g, '');
      const tm = textRaw.match(/(\d{1,2}):(\d{2})/);
      if (!tm) continue;
      const hh = Number(tm[1]);
      const mm = Number(tm[2]);
      if (hh > 23 || mm > 59) continue;
      const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

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

// ── Segmentos de contenido por día (multi-día en una página) ─────────────────
//
// El HTML actual de las páginas individuales de película de mk2 contiene una
// secuencia de bloques:
//   <div class="rotulo_dia ... cambiar-dia" data-num="0">Jueves 04/06</div>
//   <div class="contenedor_cines ... cines-0">  ... horarios de ese día ...  </div>
//   <div class="rotulo_dia ... cambiar-dia" data-num="1">Viernes 05/06</div>
//   <div class="contenedor_cines ... cines-1" style="display:none">  ...  </div>
//   ...
//
// Usamos esos divs rotulo_dia como markers de inicio de cada día.
function splitDaySegments(html) {
  const markerRe = /<div[^>]*class="[^"]*rotulo_dia[^"]*"[^>]*data-num="(\d+)"/g;
  const markers = [];
  let m;
  while ((m = markerRe.exec(html)) !== null) {
    markers.push({ num: m[1], idx: m.index });
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
