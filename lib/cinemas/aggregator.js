// Orquestador: obtiene la cartelera COMPLETA (todos los días) de los 4 cines.
// Cada cine se intenta en vivo con su adaptador, que devuelve un mapa
// { 'YYYY-MM-DD': [películas] }. Si falla, se usan datos de ejemplo para ese
// cine en todo el rango de fechas. La web nunca se queda vacía.
//
// El resultado se cachea unos minutos en memoria para que la app cargue una
// sola vez y el cambio de día sea instantáneo en el cliente.

import { CINEMAS } from './config.js';
import { mergeMoviesByTitle } from '../normalize.js';
import { buildSampleByDate } from './sample.js';
import { fetchYelmo } from './yelmo.js';
import { fetchMk2 } from './mk2.js';
import { fetchArteSiete } from './artesiete.js';

const LIVE_FETCHERS = {
  'cinesur-bahia-cadiz': fetchMk2,
  'yelmo-bahia-sur': fetchYelmo,
  'yelmo-jerez': fetchYelmo,
  'arte-siete-puerto': fetchArteSiete,
};

const RANGE_DAYS = 14;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
let _cache = null; // { at: number, data }

// Lista de fechas (ISO) de hoy a +RANGE_DAYS en hora de Madrid.
function dateRange() {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const out = [];
  for (let i = 0; i < RANGE_DAYS; i++) {
    const d = new Date(today + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function getCinema(cinema, isoDates) {
  const fetcher = LIVE_FETCHERS[cinema.id];
  let source = 'live';
  let reason = null;
  let byDate = {};

  try {
    const live = await fetcher(cinema.id);
    if (live && Object.keys(live).length) {
      // Normalizar/mezclar duplicados por título dentro de cada día.
      for (const [iso, movies] of Object.entries(live)) {
        byDate[iso] = mergeMoviesByTitle(movies);
      }
      // Rellenar fechas sin datos o con array vacío con datos de ejemplo.
      // Cubre tanto fechas ausentes como días con sesiones vacías del live.
      const sampleFill = buildSampleByDate(cinema.id, isoDates);
      for (const iso of isoDates) {
        if (!byDate[iso]?.length) byDate[iso] = sampleFill[iso];
      }
    } else {
      throw new Error('respuesta vacía');
    }
  } catch (err) {
    source = 'sample';
    reason = String(err && err.message ? err.message : err);
    byDate = buildSampleByDate(cinema.id, isoDates);
  }

  return {
    id: cinema.id,
    name: cinema.name,
    short: cinema.short,
    city: cinema.city,
    venue: cinema.venue,
    color: cinema.color,
    website: cinema.website,
    source,
    reason,
    byDate,
  };
}

export async function getShowtimes() {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) {
    return _cache.data;
  }

  const isoDates = dateRange();
  const cinemas = await Promise.all(CINEMAS.map((c) => getCinema(c, isoDates)));

  const data = {
    generatedAt: new Date().toISOString(),
    dates: isoDates,
    mode: cinemas.some((c) => c.source === 'live') ? 'mixed' : 'sample',
    cinemas,
  };

  _cache = { at: Date.now(), data };
  return data;
}

export function clearShowtimesCache() {
  _cache = null;
}
