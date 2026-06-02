// Adaptador de Arte Siete El Puerto (Artesiete Bahía, C.C. Bahía Mar, ID_Centro=33).
//
// La página del cine embebe TODA la programación (varios días) como un array
// JSON codificado en HTML (&quot; → ") dentro de un atributo del DOM.
// Cada elemento es una sesión con: Titulo, diacompleto (DD/MM/YYYY), Hora,
// NombreSala, NombreFormato, Cartel, Duracion, NombreGenero, NombreCalificacion,
// Sinopsis, ID_Espectaculo.
//
// Devolvemos un mapa { 'YYYY-MM-DD': [películas] } con todos los días disponibles.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const CINE_URL = 'https://bahia.artesiete.es/Cine/33/Artesiete-Bahia';
const POSTER_BASE = 'https://bahia.artesiete.es/Posters/';

export async function fetchArteSiete() {
  const html = await fetchText(CINE_URL);
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
        sessions: [],
      });
    }

    const movie = movieMap.get(key);
    const fmt = s.NombreFormato || '';
    const isVose = /v\.?o\.?s\.?e?/i.test(fmt) || /v\.?o\.?s\.?e?/i.test(s.NombreEspectaculo || '');
    movie.sessions.push({
      time: (s.Hora || '').slice(0, 5),
      format: normalizeFormat(fmt),
      language: isVose ? 'VOSE' : 'VE',
      room: s.NombreSala || null,
      buyUrl: null,
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

// ── Extraer array de sesiones del HTML codificado ─────────────────────────────

function extractAllSessions(html) {
  // Campo distintivo presente en cada sesión: &quot;diacompleto&quot;:
  const marker = '&quot;diacompleto&quot;:';
  const markerPos = html.indexOf(marker);
  if (markerPos < 0) return null;

  // El array empieza en el '[{' anterior al primer elemento…
  const arrayStart = html.lastIndexOf('[{', markerPos);
  if (arrayStart < 0) return null;

  // …y termina en el '}]' del atributo (comilla simple o doble).
  let closePos = html.indexOf("}]'", markerPos);
  if (closePos < 0) closePos = html.indexOf('}]"', markerPos);
  if (closePos < 0) return null;

  const encoded = html.slice(arrayStart, closePos + 2);
  const decoded = encoded
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  try {
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function diaToIso(dc) {
  if (!dc) return '';
  const p = String(dc).split('/');
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : '';
}

function cleanTitle(t) {
  if (!t) return 'Sin título';
  // Pasa de MAYÚSCULAS a Capitalización por palabras (más legible).
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
  // "4K Atmos", "4K Laser", "Laser" → conservar; sin formato → 2D
  return fmt.trim() || '2D';
}
