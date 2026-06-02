// Adaptador de Yelmo Cines (Bahía Sur y Jerez).
//
// API confirmada: POST /now-playing.aspx/GetNowPlaying con {"cityKey":"cadiz"}.
// Devuelve todos los cines de Cádiz; filtramos por clave de recinto.
// Estructura: d.Cinemas[].Dates[] (array de ~7 días) → Movies[] → Formats[] → Showtimes[].
//
// Devolvemos un mapa { 'YYYY-MM-DD': [películas] } con todos los días disponibles.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const CITY_KEY = 'cadiz';
const CINEMA_KEYS = {
  'yelmo-bahia-sur': 'premium-bahia-sur',
  'yelmo-jerez': 'area-sur',
};

export async function fetchYelmo(cinemaId) {
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
  if (!cinema) {
    throw new Error(`Yelmo: cine '${cinemaKey}' no encontrado (hay: ${cinemas.map((c) => c.Key).join(', ')})`);
  }

  const dates = cinema.Dates ?? [];
  if (!dates.length) throw new Error('Yelmo: Dates vacío en la respuesta');

  // El primer día de la respuesta es "hoy" en hora de Madrid; el resto van
  // consecutivos. Derivamos cada fecha del TimeFilter si está, o por offset.
  const todayStr = msToMadridDate(Date.now());

  const byDate = {};
  dates.forEach((day, idx) => {
    const iso = dateOfDay(day, idx, todayStr);
    if (!iso) return;
    const movies = (day.Movies ?? []).map(parseYelmoMovie);
    if (movies.length) byDate[iso] = movies;
  });

  if (!Object.keys(byDate).length) throw new Error('Yelmo: sin películas en ninguna fecha');
  return byDate;
}

// ── Fechas ────────────────────────────────────────────────────────────────────

function dateOfDay(day, idx, todayStr) {
  const tf = day.Movies?.[0]?.Formats?.[0]?.Showtimes?.[0]?.TimeFilter ?? '';
  const ms = Number((tf.match(/\/Date\((\d+)\)\//) || [])[1]);
  if (!isNaN(ms)) return msToMadridDate(ms);
  // Fallback: offset desde hoy.
  return addDays(todayStr, idx);
}

function msToMadridDate(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Parser de película ─────────────────────────────────────────────────────────

function parseYelmoMovie(f) {
  const title = f.Title || 'Sin título';
  const sessions = [];

  for (const fmt of f.Formats ?? []) {
    const format = fmt.Name || '2D';
    const lang = (fmt.Language || '').toUpperCase();
    const language =
      lang.includes('ORIGINAL') || lang.includes('VOSE') || lang.includes('INGLÉS')
        ? 'VOSE'
        : 'VE';

    for (const s of fmt.Showtimes ?? []) {
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
    rating: null,
    sessions: sortSessions(sessions),
  };
}
