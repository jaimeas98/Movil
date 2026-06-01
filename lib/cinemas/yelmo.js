// Adaptador de Yelmo Cines (Bahía Sur y Jerez).
//
// Yelmo no publica una API oficial documentada, pero su web carga la cartelera
// mediante endpoints internos. Aquí dejamos preparada la integración: se intenta
// la llamada en vivo y, si falla o cambia el formato, el agregador hace fallback
// a datos de ejemplo para que la web nunca se quede vacía.
//
// NOTA: el id de recinto de Yelmo debe confirmarse en el primer despliegue
// (donde hay red abierta) inspeccionando las llamadas reales de yelmocines.es.

import { fetchJson } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

// Marcadores de posición para los identificadores internos de cada recinto Yelmo.
const YELMO_VENUE_IDS = {
  'yelmo-bahia-sur': null, // TODO: confirmar tras el primer deploy
  'yelmo-jerez': null, // TODO: confirmar tras el primer deploy
};

export async function fetchYelmo(cinemaId, dateStr) {
  const venueId = YELMO_VENUE_IDS[cinemaId];
  if (!venueId) {
    throw new Error(`Falta el venueId de Yelmo para ${cinemaId} (pendiente de confirmar en deploy)`);
  }

  // Estructura de endpoint a confirmar/ajustar con tráfico real.
  const url = `https://www.yelmocines.es/now-playing.aspx?cinema=${venueId}&date=${dateStr}`;
  const data = await fetchJson(url);

  return parseYelmo(data);
}

// Parser tolerante: intenta varias formas habituales de la respuesta de Yelmo.
function parseYelmo(data) {
  const films = data?.movies || data?.Films || data?.results || [];
  return films.map((f) => {
    const title = f.title || f.Title || f.name || 'Sin título';
    const sessionsRaw = f.sessions || f.Sessions || f.showtimes || [];
    const sessions = sessionsRaw.map((s) => ({
      time: (s.time || s.Time || s.hour || '').slice(0, 5),
      format: s.format || s.Format || '2D',
      language: /vos/i.test(JSON.stringify(s)) ? 'VOSE' : 'VE',
      room: s.room || s.Room || null,
      buyUrl: s.url || s.buyUrl || null,
    }));
    return {
      id: slugify(title),
      title,
      posterUrl: f.poster || f.Poster || f.image || null,
      durationMin: Number(f.runtime || f.Runtime || f.duration) || null,
      genre: f.genre || f.Genre || null,
      ageRating: f.rating || f.Rating || null,
      synopsis: f.synopsis || f.Synopsis || null,
      sessions: sortSessions(sessions),
    };
  });
}
