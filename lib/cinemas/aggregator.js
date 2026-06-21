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
import { buildSampleByDate } from './sample.js';

// Fallback de datos de EJEMPLO solo para desarrollo local / capturas de pantalla.
// Se activa con CARTELERA_SAMPLE=1. En producción (Vercel) la variable no existe,
// así que el comportamiento real (no inventar películas) se mantiene intacto.
const USE_SAMPLE = process.env.CARTELERA_SAMPLE === '1';

// Log estructurado del servidor. Visible en los logs de Vercel.
// Objetivo: cuando el usuario dice "el martes mk2 no sale", buscar en los logs
// "[cartelera]" para ver qué devolvió cada cine y en qué fechas.
function logCinema(cinema, isoDates) {
  const days = cinema.liveDates?.length ?? 0;
  const total = Object.values(cinema.byDate ?? {}).reduce((n, arr) => n + (arr?.length ?? 0), 0);

  if (cinema.source === 'sample') {
    console.log(`[cartelera] 🧪 ${cinema.id}: datos de EJEMPLO (CARTELERA_SAMPLE=1)`);
    return;
  }
  if (cinema.source === 'error') {
    console.warn(`[cartelera] ❌ ${cinema.id}: FALLO — ${cinema.reason}`);
    return;
  }

  // source === 'live': resumen + días con 0 películas (los que el usuario podría reportar)
  console.log(`[cartelera] ✅ ${cinema.id}: ${total} películas·sesiones en ${days}/${isoDates.length} días`);
  const missing = isoDates.filter((iso) => !(cinema.byDate[iso]?.length));
  if (missing.length) {
    console.warn(`[cartelera] ⚠️  ${cinema.id}: sin datos en ${missing.join(', ')}`);
  }
  // Tabla compacta: ISO → nº películas (para que sea buscable en logs de Vercel)
  const table = isoDates.map((iso) => `${iso}:${cinema.byDate[iso]?.length ?? 0}`).join(' | ');
  console.log(`[cartelera]    ${cinema.id} por día: ${table}`);
}

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

    // Solo en local con CARTELERA_SAMPLE=1: rellenar con datos de ejemplo para
    // poder ver/capturar la web cuando las webs reales están bloqueadas.
    if (USE_SAMPLE) {
      const sample = buildSampleByDate(cinema.id, isoDates);
      for (const [iso, movies] of Object.entries(sample)) byDate[iso] = movies;
      liveDates = Object.keys(byDate).filter((iso) => byDate[iso]?.length).sort();
      source = 'sample';
    }
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
  console.log(`[cartelera] 🎬 fetch iniciado — ${new Date().toISOString()} — rango: ${isoDates[0]} → ${isoDates.at(-1)}`);
  const cinemas = await Promise.all(CINEMAS.map((c) => getCinema(c, isoDates)));
  cinemas.forEach((c) => logCinema(c, isoDates));

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
