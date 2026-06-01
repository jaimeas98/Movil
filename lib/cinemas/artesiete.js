// Adaptador de Arte Siete El Puerto (Artesiete Bahía, C.C. Bahía Mar, ID_Centro=33).
//
// La página del cine embede TODA la programación como un array JSON
// codificado en HTML (&quot; → ") dentro de un atributo del DOM.
// Cada elemento es una sesión con: Titulo, diacompleto, Hora, NombreSala,
// NombreFormato, Cartel, Duracion, NombreGenero, NombreCalificacion, Sinopsis.
// Filtramos por diacompleto=dateStr y agrupamos por ID_Espectaculo.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const CINE_URL = 'https://bahia.artesiete.es/Cine/33/Artesiete-Bahia';
const POSTER_BASE = 'https://bahia.artesiete.es/Posters/';

export async function fetchArteSiete(cinemaId, dateStr) {
  const html = await fetchText(CINE_URL);
  const sessions = extractAllSessions(html);
  if (!sessions || !sessions.length) {
    throw new Error('Arte Siete: no se encontraron sesiones en el HTML');
  }

  // diacompleto = "DD/MM/YYYY" → filtrar por fecha pedida
  const forDate = sessions.filter((s) => diaToIso(s.diacompleto) === dateStr);
  if (!forDate.length) {
    throw new Error(`Arte Siete: sin sesiones para ${dateStr}`);
  }

  // Agrupar por película (ID_Espectaculo)
  const movieMap = new Map();
  for (const s of forDate) {
    const key = String(s.ID_Espectaculo);
    if (!movieMap.has(key)) {
      movieMap.set(key, {
        id: slugify(s.Titulo || 'Sin título'),
        title: s.Titulo || 'Sin título',
        posterUrl: s.Cartel ? `${POSTER_BASE}${s.Cartel}` : null,
        durationMin: Number(s.Duracion) || null,
        genre: s.NombreGenero || null,
        ageRating: s.NombreCalificacion || null,
        synopsis: s.Sinopsis?.trim() || null,
        sessions: [],
      });
    }

    const movie = movieMap.get(key);
    const fmt = s.NombreFormato || s.NombreEspectaculo || '';
    const isVose = /v\.?o\.?s\.?e?\.?/i.test(fmt);
    movie.sessions.push({
      time: (s.Hora || '').slice(0, 5),
      format: s.NombreFormato || '2D',
      language: isVose ? 'VOSE' : 'VE',
      room: s.NombreSala || null,
      buyUrl: null,
    });
  }

  return [...movieMap.values()].map((m) => ({
    ...m,
    sessions: sortSessions(m.sessions),
  }));
}

// ── Extraer array de sesiones del HTML codificado ─────────────────────────────

function extractAllSessions(html) {
  // Las sesiones están en un atributo HTML como JSON con &quot; en lugar de "
  // Campo distintivo presente en cada sesión: &quot;diacompleto&quot;:
  const marker = '&quot;diacompleto&quot;:';
  const markerPos = html.indexOf(marker);
  if (markerPos < 0) return null;

  // El array de sesiones empieza con '[{' antes del primer elemento
  const arrayStart = html.lastIndexOf('[{', markerPos);
  if (arrayStart < 0) return null;

  // El atributo HTML usa comillas simples → el array termina con "}]'"
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
  const p = dc.split('/');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : '';
}
