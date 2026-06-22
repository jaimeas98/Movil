// Adaptador de Arte Siete El Puerto (Artesiete Bahía, C.C. Bahía Mar, ID_Centro=33).
//
// La página del cine embebe TODA la programación (varios días) como un array
// JSON en el HTML, codificado en &quot; o en comilla simple. Estrategia:
//  1. Petición a la página principal con cabeceras de navegador completas
//  2. tryExtractHtmlEncoded: JSON con &quot; encoding en atributo HTML
//  3. tryExtractRawJson: JSON sin encoding en atributo con comilla simple
//  4. tryExtractFromScripts: JSON en bloque <script>
//
// Devolvemos un mapa { 'YYYY-MM-DD': [películas] } con todos los días disponibles.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const CINE_URL = 'https://bahia.artesiete.es/Cine/33/Artesiete-Bahia';
const POSTER_BASE = 'https://bahia.artesiete.es/Posters/';

// Cabeceras extra que imitan un navegador visitando la página del cine
const EXTRA_HEADERS = {
  'Referer': 'https://bahia.artesiete.es/',
  'Origin': 'https://bahia.artesiete.es',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

export async function fetchArteSiete() {
  const html = await fetchText(CINE_URL, { headers: EXTRA_HEADERS });
  const sessions = extractAllSessions(html);
  if (!sessions || !sessions.length) {
    throw new Error('Arte Siete: no se encontraron sesiones en el HTML');
  }

  // Agrupar: fecha → (película → datos+sesiones)
  const byDate = {};
  for (const s of sessions) {
    const iso = diaToIso(s.diacompleto);
    if (!iso) continue;

    if (!byDate[iso]) byDate[iso] = new Map();
    const movieMap = byDate[iso];
    const key = String(s.ID_Espectaculo || slugify(s.Titulo));

    if (!movieMap.has(key)) {
      movieMap.set(key, {
        id: slugify(s.Titulo || 'Sin título'),
        title: cleanTitle(s.Titulo),
        posterUrl: s.Cartel ? `${POSTER_BASE}${s.Cartel}` : null,
        durationMin: Number(s.Duracion) || null,
        genre: s.NombreGenero || null,
        ageRating: cleanAge(s.NombreCalificacion),
        synopsis: s.Sinopsis ? s.Sinopsis.trim() : null,
        rating: null,
        isNew: isRecentRelease(s.FechaEstreno, iso),
        sessions: [],
      });
    }

    const movie = movieMap.get(key);
    const fmt = s.NombreFormato || '';
    const isVose = /v\.?o\.?s\.?e?/i.test(fmt) || /v\.?o\.?s\.?e?/i.test(s.NombreEspectaculo || '');
    const buyUrl = (s.ID_Sesion && s.ID_Espectaculo)
      ? `https://bahia.artesiete.es/Session/33/ARTESIETE%20BAHIA/${s.ID_Sesion}/${encodeURIComponent((s.Titulo || '').toUpperCase())}/${s.ID_Espectaculo}`
      : null;
    movie.sessions.push({
      time: (s.Hora || '').slice(0, 5),
      format: normalizeFormat(fmt),
      language: isVose ? 'VOSE' : 'VE',
      room: s.NombreSala || null,
      buyUrl,
    });
  }

  // Convertir cada Map a array de películas con sesiones ordenadas
  const result = {};
  for (const [iso, movieMap] of Object.entries(byDate)) {
    result[iso] = [...movieMap.values()].map((m) => ({
      ...m,
      sessions: sortSessions(m.sessions),
    }));
  }
  return result;
}

// ── Extracción multi-estrategia del array de sesiones ─────────────────────────

function extractAllSessions(html) {
  // Estrategia 0: atributo `fullsessionsinfo='[...]'` — es la fuente COMPLETA
  // de sesiones (todas las fechas, todos los pases). La página también incluye
  // `onlytitlesinfo='[...]'` con un subconjunto reducido (solo un pase por
  // película) que es lo que la estrategia 1 acababa cazando por error y
  // dejaba la cartelera con solo 7 días en lugar de 14.
  const rFull = tryExtractNamedAttribute(html, 'fullsessionsinfo');
  if (rFull?.length) return rFull;

  // Estrategia 1: primer JSON con &quot; encoding que contenga diacompleto
  const r1 = tryExtractHtmlEncoded(html);
  if (r1?.length) return r1;

  // Estrategia 2: JSON sin encoding (atributo con comilla simple)
  const r2 = tryExtractRawJson(html);
  if (r2?.length) return r2;

  // Estrategia 3: JSON en bloques <script>
  const r3 = tryExtractFromScripts(html);
  if (r3?.length) return r3;

  return null;
}

// Busca un atributo HTML concreto (p.ej. fullsessionsinfo) con valor de la
// forma `attr='[{...}]'` (comilla simple), decodifica entidades y parsea.
// El cierre del atributo es la siguiente comilla simple TRAS un `}]`.
function tryExtractNamedAttribute(html, attrName) {
  const openRe = new RegExp(`${attrName}='(\\[\\{)`);
  const openM = html.match(openRe);
  if (!openM || openM.index == null) return null;
  // openM.index apunta al inicio del nombre de atributo; el '[{' está a
  // attrName.length + 2 ("='" tras el nombre).
  const arrayStart = openM.index + attrName.length + 2;

  // Buscar la primera comilla simple que sigue a `}]` (cierre del array
  // dentro del atributo). Permitimos espacios opcionales por seguridad.
  const closeRe = /\}\]\s*'/g;
  closeRe.lastIndex = arrayStart;
  const closeM = closeRe.exec(html);
  if (!closeM) return null;
  const arrayEnd = closeM.index + 2; // incluye `}]`

  const encoded = html.slice(arrayStart, arrayEnd);
  const decoded = decodeHtmlEntities(encoded);
  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* dejará caer al siguiente método */ }
  return null;
}

function tryExtractHtmlEncoded(html) {
  const marker = '&quot;diacompleto&quot;:';
  const markerPos = html.indexOf(marker);
  if (markerPos < 0) return null;

  const arrayStart = html.lastIndexOf('[{', markerPos);
  if (arrayStart < 0) return null;

  // Probar distintos cierres: el array termina }] seguido del delimitador del atributo
  for (const closing of ["}]'", '}]"', '}]`', '}] ', '}]\n', '}]&']) {
    const closePos = html.indexOf(closing, markerPos);
    if (closePos < 0) continue;
    const encoded = html.slice(arrayStart, closePos + 2); // +2 = }]
    const decoded = decodeHtmlEntities(encoded);
    try {
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch { /* intentar siguiente */ }
  }
  return null;
}

function tryExtractRawJson(html) {
  const marker = '"diacompleto":';
  const markerPos = html.indexOf(marker);
  if (markerPos < 0) return null;

  const arrayStart = html.lastIndexOf('[{', markerPos);
  if (arrayStart < 0) return null;

  for (const closing of ["}]'", '}]"', '}]', '}];']) {
    const closePos = html.indexOf(closing, markerPos);
    if (closePos < 0) continue;
    const endIdx = closePos + 2; // }]
    const raw = html.slice(arrayStart, endIdx);
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch { /* intentar siguiente */ }
  }
  return null;
}

function tryExtractFromScripts(html) {
  const scriptRe = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const script = m[1];
    if (!script.includes('diacompleto')) continue;

    const dPos = script.indexOf('diacompleto');
    const arrayStart = script.lastIndexOf('[{', dPos);
    if (arrayStart < 0) continue;

    for (const closing of ['};', '}];', '}]', '}]\n']) {
      const closePos = script.indexOf(closing, dPos);
      if (closePos < 0) continue;
      // Encontrar el ']' que cierra el array
      const endBracket = script.lastIndexOf(']', closePos + closing.indexOf(']'));
      if (endBracket < 0) continue;
      const candidate = script.slice(arrayStart, endBracket + 1);
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch { /* intentar siguiente */ }
    }
  }
  return null;
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function diaToIso(dc) {
  if (!dc) return '';
  const p = String(dc).split('/');
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : '';
}

function cleanTitle(t) {
  if (!t) return 'Sin título';
  if (t === t.toUpperCase()) {
    return t.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  }
  return t;
}

function cleanAge(c) {
  if (!c) return null;
  if (/pendiente/i.test(c)) return null;
  if (/todos los p/i.test(c)) return 'TP';
  return c;
}

function normalizeFormat(fmt) {
  if (!fmt) return '2D';
  return fmt.trim() || '2D';
}

// "Estreno" = FechaEstreno está dentro de los 14 días anteriores al día de
// la sesión. Artesiete trae FechaEstreno como "YYYY-MM-DD" ISO directo.
function isRecentRelease(fechaEstreno, sessionIso) {
  if (!fechaEstreno || !sessionIso) return false;
  const release = Date.parse(fechaEstreno);
  const session = Date.parse(sessionIso);
  if (isNaN(release) || isNaN(session)) return false;
  const diffDays = (session - release) / (1000 * 60 * 60 * 24);
  return diffDays >= -1 && diffDays <= 14;
}
