// El estado del móvil para el panel, montado con lo que publica en la rama
// `estado-movil` (scripts/movil/tarea.sh) y las órdenes pendientes.

import { leerFicheros, RAMA_ESTADO } from './github.js';
import { leerOrdenesYResultados, pendientes } from './ordenes.js';

// Igual que el vigilante (scripts/vigilante/revisar.mjs): dos vueltas
// perdidas seguidas y ya no se le considera vivo.
export const VIVO_S = 45 * 60;

const FICHEROS = ['estado.json', 'registro.txt', 'historial.jsonl', 'recogidas.jsonl', 'bateria-historial.json'];

function json(texto) {
  try { return JSON.parse(texto); } catch { return null; }
}

// Líneas JSON (las rotas se saltan), de la más reciente a la más antigua.
export function lineasJson(texto, max) {
  if (!texto) return [];
  const out = [];
  for (const l of texto.split('\n')) {
    if (!l.trim()) continue;
    const d = json(l);
    if (d && typeof d === 'object' && !Array.isArray(d)) out.push(d);
  }
  return out.reverse().slice(0, max);
}

export async function estadoMovil(ahora = Date.now()) {
  const [{ contenidos, errores }, ord] = await Promise.all([
    leerFicheros(RAMA_ESTADO, FICHEROS),
    leerOrdenesYResultados().catch((e) => ({ error: e.message, ordenes: [], resultados: [] })),
  ]);
  const informe = json(contenidos['estado.json']);
  const vuelta = Date.parse(informe?.vuelta ?? '');
  const latidoHace = Number.isFinite(vuelta) ? Math.max(0, Math.round((ahora - vuelta) / 1000)) : null;
  const historial = json(contenidos['bateria-historial.json']);
  const resultados = [...ord.resultados].sort((a, b) => String(b.inicio ?? '').localeCompare(String(a.inicio ?? '')));

  const fallos = [...Object.entries(errores).map(([f, m]) => `${f}: ${m}`), ...(ord.error ? [`órdenes: ${ord.error}`] : [])];
  return {
    informe,
    latidoHace,
    vivo: latidoHace !== null && latidoHace <= VIVO_S,
    bateria: informe?.bateria ?? null,
    historialBateria: Array.isArray(historial)
      ? historial.filter((p) => Number.isFinite(p?.t) && Number.isFinite(p?.pct)).map((p) => ({ t: p.t, pct: p.pct, cargando: Boolean(p.cargando) }))
      : [],
    ultimasVueltas: lineasJson(contenidos['historial.jsonl'], 700),
    ultimasRecogidas: lineasJson(contenidos['recogidas.jsonl'], 60),
    registro: contenidos['registro.txt'] ?? null,
    ordenes: { pendientes: pendientes(ord.ordenes, ord.resultados), resultados },
    ficheros: {
      ...Object.fromEntries(FICHEROS.map((f) => [f, contenidos[f] != null])),
      'ordenes-resultado.json': Boolean(ord.hayResultados),
      'ordenes.json': Boolean(ord.hayOrdenes),
    },
    error: fallos.length ? fallos.join(' · ') : null,
  };
}
