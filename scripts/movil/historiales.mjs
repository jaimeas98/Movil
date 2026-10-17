// Historiales del móvil para el panel de control: ver los fallos con el
// tiempo, no solo el último informe. Los usa tarea.sh:
//
//   … node historiales.mjs recogida   una línea en recogidas.jsonl por recogida
//   … node historiales.mjs vuelta     una línea en historial.jsonl por vuelta, y
//                                     copia los tres historiales a la rama de informes
//
// Todo por variables de entorno (ver cada función). Los ficheros "de verdad"
// viven en ~/.recolector; a ~/estado-movil va una copia. Así, si la rama de
// informes se vuelve a clonar, no se pierde nada.
//
// Son EXTRAS: tarea.sh los llama después de escribir estado.json (el latido) y
// sin dejar que un fallo aquí pare la vuelta.
//
// El informe es público: aquí solo van datos técnicos (resultados, cuentas,
// batería), como en estado.json.

import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const SIETE_DIAS_MS = 7 * 24 * 3600 * 1000;

function leerJsonl(ruta) {
  let texto = '';
  try { texto = readFileSync(ruta, 'utf8'); } catch { return []; }
  const out = [];
  for (const l of texto.split('\n')) {
    if (!l.trim()) continue;
    try { const d = JSON.parse(l); if (d && typeof d === 'object') out.push(d); } catch { /* línea rota: fuera */ }
  }
  return out;
}

function escribirAtomico(ruta, texto) {
  writeFileSync(ruta + '.tmp', texto);
  renameSync(ruta + '.tmp', ruta);
}

// Añade una línea y deja solo los últimos 7 días (y como mucho `max` líneas).
export function anotarLinea(lineas, nueva, { ahora = Date.now(), max = 800 } = {}) {
  return [...lineas, nueva]
    .filter((l) => ahora - Date.parse(l?.t ?? '') <= SIETE_DIAS_MS)
    .slice(-max);
}

const recorta = (s, n) => (s ? String(s).replace(/\s+/g, ' ').trim().slice(0, n) : null);

// Días y películas por cine en lo que hay ahora en data/yelmo.js y data/respaldo.js.
export function cuentas(yelmo, respaldo) {
  const cines = {};
  for (const [id, c] of Object.entries(yelmo?.cines ?? {})) {
    const titulos = new Set();
    for (const d of c?.Dates ?? []) for (const m of d?.Movies ?? []) titulos.add(m?.Title);
    cines[id] = { dias: (c?.Dates ?? []).length, peliculas: titulos.size };
  }
  for (const [id, c] of Object.entries(respaldo?.cines ?? {})) {
    const titulos = new Set();
    for (const pelis of Object.values(c?.byDate ?? {})) for (const m of pelis ?? []) titulos.add(m?.id ?? m?.title);
    cines[id] = { dias: Object.keys(c?.byDate ?? {}).length, peliculas: titulos.size, at: c?.at ?? null };
  }
  return cines;
}

async function importar(ruta) {
  try { return (await import(pathToFileURL(ruta).href + `?v=${Date.now()}`)).default; } catch { return null; }
}

// T (inicio, s), MOTIVO, RESULTADO, PARTES, ORDEN, YELMO, RESPALDO, LOCAL
async function recogida(e) {
  const inicio = Number(e.T) * 1000 || Date.now();
  const linea = {
    t: new Date(inicio).toISOString(),
    motivo: recorta(e.MOTIVO, 120),
    resultado: recorta(e.RESULTADO, 120),
    duracionS: Math.max(0, Math.round((Date.now() - inicio) / 1000)),
    orden: e.ORDEN || null,
    partes: String(e.PARTES || '').split(/\s+/).filter(Boolean),
    cines: cuentas(await importar(e.YELMO), await importar(e.RESPALDO)),
  };
  escribirAtomico(e.LOCAL, anotarLinea(leerJsonl(e.LOCAL), linea, { max: 200 }).map((l) => JSON.stringify(l)).join('\n') + '\n');
}

// ESTADO (estado.json recién escrito), ORDEN, BASE (~/.recolector), DESTINO (~/estado-movil)
function vuelta(e) {
  let estado = null;
  try { estado = JSON.parse(readFileSync(e.ESTADO, 'utf8')); } catch { /* sin informe, sin línea */ }
  const local = join(e.BASE, 'historial.jsonl');
  if (estado) {
    const b = estado.bateria;
    const linea = {
      t: estado.vuelta,
      resultado: recorta(estado.resultado, 120),
      motivo: recorta(estado.motivo, 120),
      error: recorta(estado.error, 200),
      bateria: Number.isFinite(b?.porcentaje) ? b.porcentaje : null,
      cargando: b ? Boolean(b.cargando) : null,
      ritmo: b?.ritmoPorHora ?? null,
      codigo: estado.codigo ?? null,
      orden: e.ORDEN || null,
    };
    escribirAtomico(local, anotarLinea(leerJsonl(local), linea).map((l) => JSON.stringify(l)).join('\n') + '\n');
  }
  // Copias a la rama de informes. Cada una por su cuenta: que falte una no
  // impide las demás.
  for (const f of ['historial.jsonl', 'recogidas.jsonl']) {
    try { copyFileSync(join(e.BASE, f), join(e.DESTINO, f)); } catch { /* aún no existe */ }
  }
  // La batería solo si es un JSON que valga (puede estar roto: ver probar.sh).
  try {
    const h = JSON.parse(readFileSync(join(e.BASE, 'bateria-historial.json'), 'utf8'));
    if (Array.isArray(h)) escribirAtomico(join(e.DESTINO, 'bateria-historial.json'), JSON.stringify(h) + '\n');
  } catch { /* sin historial de batería todavía */ }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const orden = process.argv[2];
  if (orden === 'recogida') await recogida(process.env);
  else if (orden === 'vuelta') vuelta(process.env);
  else { console.error('uso: historiales.mjs recogida|vuelta'); process.exit(2); }
}
