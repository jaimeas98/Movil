// Orquestador: obtiene la cartelera COMPLETA (todos los días) de los 4 cines.
// Cada cine se intenta en vivo con su adaptador, que devuelve un mapa
// { 'YYYY-MM-DD': [películas] }. Los días/cines sin datos reales se dejan
// VACÍOS — preferimos no enseñar nada antes que mostrar películas inventadas.
// La UI ya se encarga de ocultar del selector los días sin programación
// en ningún cine.
//
// El resultado se cachea unos minutos en memoria para que la app cargue una
// sola vez y el cambio de día sea instantáneo en el cliente.

import { CINEMAS } from './config.js';
import { mergeMoviesByTitle } from '../normalize.js';
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
  const byDate = {};
  let liveDates = [];

  try {
    const live = await fetcher(cinema.id);
    if (!live || !Object.keys(live).length) throw new Error('respuesta vacía');
    for (const [iso, movies] of Object.entries(live)) {
      byDate[iso] = mergeMoviesByTitle(movies);
    }
    liveDates = Object.keys(byDate).filter((iso) => byDate[iso]?.length).sort();
  } catch (err) {
    // Adaptador falló por completo. Dejamos byDate vacío y marcamos el motivo
    // — la web mostrará "sin sesiones" para este cine, NO datos inventados.
    source = 'error';
    reason = String(err && err.message ? err.message : err);
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
    liveDates,
    byDate,
  };
}

export async function getShowtimes() {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) {
    return _cache.data;
  }

  const isoDates = dateRange();
  const cinemas = await Promise.all(CINEMAS.map((c) => getCinema(c, isoDates)));

  // Campo de diagnóstico: cuenta de películas por cine×día.
  const _coverage = {};
  for (const cinema of cinemas) {
    _coverage[cinema.id] = {};
    for (const iso of isoDates) {
      _coverage[cinema.id][iso] = cinema.byDate[iso]?.length ?? 0;
    }
  }

  const data = {
    generatedAt: new Date().toISOString(),
    dates: isoDates,
    mode: 'live',
    cinemas,
    _coverage,
  };

  _cache = { at: Date.now(), data };
  return data;
}

export function clearShowtimesCache() {
  _cache = null;
}
