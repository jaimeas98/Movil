// Adaptador de Yelmo Cines (Bahía Sur y Jerez).
//
// API confirmada: POST /now-playing.aspx/GetNowPlaying con {"cityKey":"cadiz"}.
// Devuelve todos los cines de Cádiz; filtramos por clave de recinto.
// Estructura: d.Cinemas[].Dates[] (array de 7 días) → Movies[] → Formats[] → Showtimes[].

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const CITY_KEY = 'cadiz';
const CINEMA_KEYS = {
  'yelmo-bahia-sur': 'premium-bahia-sur',
  'yelmo-jerez': 'area-sur',
};

export async function fetchYelmo(cinemaId, dateStr) {
  const cinemaKey = CINEMA_KEYS[cinemaId];
  if (!cinemaKey) throw new Error(`Sin clave confirmada para Yelmo ${cinemaId}`);

  const text = await fetchText('https://www.yelmocines.es/now-playing.aspx/GetNowPlaying', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ cityKey: CITY_KEY }),
  });

  const data = JSON.parse(text);
  const cinemas = data?.d?.Cinemas ?? [];

  const cinema = cinemas.find((c) => c.Key === cinemaKey);
  if (!cinema) throw new Error(`Yelmo: cine '${cinemaKey}' no encontrado (hay: ${cinemas.map(c => c.Key).join(', ')})`);

  const dates = cinema.Dates ?? [];
  if (!dates.length) throw new Error('Yelmo: Dates vacío en la respuesta');

  const dayData = findDayData(dates, dateStr);
  if (!dayData) throw new Error(`Yelmo: sin programación para ${dateStr} (${dates.length} días disponibles)`);

  const movies = dayData.Movies ?? [];
  if (!movies.length) throw new Error(`Yelmo: sin películas para ${dateStr} en ${cinemaKey}`);

  return movies.map(parseYelmoMovie);
}

// ── Localización del día correcto ─────────────────────────────────────────────

function findDayData(dates, dateStr) {
  // Estrategia 1: derivar la fecha del TimeFilter del primer pase de cada día
  for (const day of dates) {
    const tf = day.Movies?.[0]?.Formats?.[0]?.Showtimes?.[0]?.TimeFilter ?? '';
    const ms = Number((tf.match(/\/Date\((\d+)\)\//) || [])[1]);
    if (!isNaN(ms)) {
      const dayDate = msToMadridDate(ms);
      if (dayDate === dateStr) return day;
    }
  }

  // Estrategia 2: índice relativo a hoy en hora Madrid
  const todayStr = msToMadridDate(Date.now());
  const idx = daysBetween(todayStr, dateStr);
  return (idx >= 0 && idx < dates.length) ? dates[idx] : null;
}

function msToMadridDate(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function daysBetween(fromIso, toIso) {
  return Math.round((new Date(toIso + 'T12:00:00Z') - new Date(fromIso + 'T12:00:00Z')) / 86400000);
}

// ── Parser de película ─────────────────────────────────────────────────────────

function parseYelmoMovie(f) {
  const title = f.Title || 'Sin título';
  const sessions = [];

  for (const fmt of (f.Formats ?? [])) {
    const format = fmt.Name || '2D';
    const lang = (fmt.Language || '').toUpperCase();
    const language =
      lang.includes('ORIGINAL') || lang.includes('VOSE') || lang.includes('INGLÉS')
        ? 'VOSE'
        : 'VE';

    for (const s of (fmt.Showtimes ?? [])) {
      sessions.push({
        time: (s.Time ?? '').slice(0, 5),
        format,
        language,
        room: s.Screen ? String(s.Screen) : null,
        buyUrl: s.ShowtimeId
          ? `https://www.yelmocines.es/compra-entradas?showtimeId=${s.ShowtimeId}`
          : null,
      });
    }
  }

  return {
    id: slugify(title),
    title,
    posterUrl: f.Poster ?? null,
    durationMin: Number(f.RunTime) || null,
    genre: f.Gender || null,
    ageRating: f.Rating ?? null,
    synopsis: f.Synopsis ?? null,
    sessions: sortSessions(sessions),
  };
}
