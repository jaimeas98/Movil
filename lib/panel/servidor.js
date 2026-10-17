// Lo que ve el servidor de la cartelera, para el panel: estado de cada cine
// según el agregador, la edad de la instantánea de Yelmo y de la copia de
// respaldo que publica el móvil, y qué claves de servicios hay configuradas
// (solo sí/no: los valores no salen nunca de las variables de entorno).

import { getShowtimes, clearShowtimesCache } from '../cinemas/aggregator.js';
import { plantillaDe } from '../cinemas/enlaces.js';
import instantanea from '../../data/yelmo.js';
import respaldo from '../../data/respaldo.js';
import { ErrorPanel } from './http.js';

const segundosDesde = (ms, ahora) => (Number.isFinite(ms) ? Math.max(0, Math.round((ahora - ms) / 1000)) : null);
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

export function resumenCine(c, hoy, ahora = Date.now()) {
  const dias = Object.keys(c.byDate ?? {}).filter((d) => c.byDate[d]?.length).sort();
  const titulos = new Set();
  let sesiones = 0;
  const porDia = {};
  for (const d of dias) {
    porDia[d] = c.byDate[d].length;
    for (const m of c.byDate[d]) { titulos.add(m.id || m.title); sesiones += m.sessions?.length ?? 0; }
  }
  const deHoy = c.byDate?.[hoy] ?? [];
  const datosDe = Number.isFinite(c.datosDe) ? c.datosDe : null;
  return {
    id: c.id,
    nombre: c.name,
    corto: c.short,
    fuente: c.source,
    motivo: c.reason ?? null,
    origen: c.origen ?? null,
    datosDe: iso(datosDe),
    edadS: segundosDesde(datosDe, ahora),
    dias: dias.length,
    primerDia: dias[0] ?? null,
    ultimoDia: dias.at(-1) ?? null,
    peliculas: titulos.size,
    sesiones,
    hoy: { peliculas: deHoy.length, sesiones: deHoy.reduce((n, m) => n + (m.sessions?.length ?? 0), 0) },
    porDia,
    diasCompletados: c.diasCompletados ?? 0,
    plantilla: plantillaDe(c.id) ? 'propia' : 'original',
  };
}

function resumenInstantanea(ahora) {
  const at = Date.parse(instantanea?.generatedAt ?? '');
  const cines = {};
  for (const [id, c] of Object.entries(instantanea?.cines ?? {})) cines[id] = { dias: c?.Dates?.length ?? 0 };
  return { generadoEn: iso(at), edadS: segundosDesde(at, ahora), origen: instantanea?.origen ?? null, cines };
}

function resumenRespaldo(ahora) {
  const at = Date.parse(respaldo?.generatedAt ?? '');
  const cines = {};
  for (const [id, c] of Object.entries(respaldo?.cines ?? {})) {
    cines[id] = { at: c?.at ?? null, dias: Object.keys(c?.byDate ?? {}).length };
  }
  return { generadoEn: iso(at), edadS: segundosDesde(at, ahora), cines };
}

export function claves(env = process.env) {
  const hay = (k) => typeof env[k] === 'string' && env[k].trim() !== '';
  return {
    tmdb: hay('TMDB_READ_TOKEN') || hay('TMDB_API_KEY'),
    omdb: hay('OMDB_API_KEY'),
    github: hay('PANEL_GITHUB_TOKEN'),
  };
}

export function resumenServidor(datos, ahora = Date.now()) {
  const hoy = datos.dates?.[0];
  const generado = Date.parse(datos.generatedAt);
  return {
    generadoEn: datos.generatedAt,
    cacheHace: segundosDesde(generado, ahora),
    cines: datos.cinemas.map((c) => resumenCine(c, hoy, ahora)),
    instantaneaYelmo: resumenInstantanea(ahora),
    respaldo: resumenRespaldo(ahora),
    claves: claves(),
    error: null,
  };
}

export async function estadoServidor() {
  return resumenServidor(await getShowtimes());
}

// Saltarse la caché de 5 min del agregador. Como mucho uno cada 20 s por
// instancia: cada refresco son peticiones a las webs de los cines.
let _ultimoRefresco = 0;
export async function refrescarServidor(ahora = Date.now()) {
  if (ahora - _ultimoRefresco < 20000) {
    throw new ErrorPanel(429, 'limite', 'Se acaba de refrescar; espera unos segundos.');
  }
  _ultimoRefresco = ahora;
  clearShowtimesCache();
  return estadoServidor();
}
