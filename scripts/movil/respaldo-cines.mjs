// Copia de seguridad de mk2 y Arte Siete, hecha desde el móvil.
//
// POR QUÉ
// Hoy la web los lee en directo sin problema, pero Yelmo también funcionaba
// hasta que un día puso Cloudflare y la cartelera se quedó vacía. Si a mk2 o a
// Arte Siete les pasa lo mismo, o su web se cae un rato, la web tira de esta
// copia (avisando de cuándo es) en vez de enseñar el cine en blanco.
//
// Usa los MISMOS adaptadores que la web (lib/cinemas), así que la copia tiene
// exactamente la forma que la web ya sabe enseñar.
//
// LO NUEVO NO BORRA LO QUE YA HABÍA
// Igual que con Yelmo: un día que viene en la nueva recogida manda, uno que no
// viene se conserva de la anterior (hasta 7 días), y un cine que falla
// conserva su copia anterior entera. Si fallan los dos, no se escribe nada.
//
//   DESTINO=data/respaldo.js node --no-warnings scripts/movil/respaldo-cines.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CONSERVAR_MS = 7 * 24 * 3600 * 1000;

const hoyMadrid = (ms) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(ms));

// previa/nuevos: { [cineId]: { at, byDate: { iso: [películas] }, dias: { iso: fechaRecogida } } }
// nuevos solo trae los cines que han respondido, con su byDate recién leído.
export function fusionarRespaldo(previa, nuevos, ahora = Date.now()) {
  const hoy = hoyMadrid(ahora);
  const marca = new Date(ahora).toISOString();
  const cines = {};
  const conservados = {};
  for (const id of new Set([...Object.keys(previa ?? {}), ...Object.keys(nuevos)])) {
    const antes = previa?.[id];
    const nuevo = nuevos[id];
    const byDate = {};
    const dias = {};
    for (const [iso, pelis] of Object.entries(nuevo?.byDate ?? {})) {
      if (iso >= hoy && pelis?.length) { byDate[iso] = pelis; dias[iso] = marca; }
    }
    let n = 0;
    for (const [iso, pelis] of Object.entries(antes?.byDate ?? {})) {
      const recogido = Date.parse(antes.dias?.[iso] ?? antes.at ?? '') || 0;
      if (iso >= hoy && !byDate[iso] && pelis?.length && ahora - recogido <= CONSERVAR_MS) {
        byDate[iso] = pelis; dias[iso] = antes.dias?.[iso] ?? antes.at; n++;
      }
    }
    if (!Object.keys(byDate).length) continue;
    cines[id] = { at: nuevo ? marca : antes.at, byDate, dias };
    if (n) conservados[id] = n;
  }
  return { cines, conservados };
}

async function principal() {
  const DESTINO = process.env.DESTINO || 'data/respaldo.js';
  const { fetchMk2 } = await import('../../lib/cinemas/mk2.js');
  const { fetchArteSiete } = await import('../../lib/cinemas/artesiete.js');
  const FUENTES = { 'cinesur-bahia-cadiz': fetchMk2, 'arte-siete-puerto': fetchArteSiete };

  const nuevos = {};
  for (const [id, leer] of Object.entries(FUENTES)) {
    try {
      const byDate = await leer(id);
      const dias = Object.keys(byDate ?? {}).filter((d) => byDate[d]?.length);
      if (!dias.length) throw new Error('sin películas');
      nuevos[id] = { byDate };
      console.log(`✅ respaldo ${id}: ${dias.length} días`);
    } catch (e) {
      console.log(`⚠️  respaldo ${id}: ${String(e?.message ?? e).slice(0, 120)} (se conserva la copia anterior)`);
    }
  }
  if (!Object.keys(nuevos).length) {
    console.log('respaldo: no ha respondido ningún cine; no se toca la copia');
    return;
  }

  let previa = null;
  try {
    const t = readFileSync(DESTINO, 'utf8');
    previa = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)).cines;
  } catch { /* no había copia previa */ }

  const { cines, conservados } = fusionarRespaldo(previa, nuevos);
  for (const [id, n] of Object.entries(conservados)) {
    console.log(`🛟 respaldo ${id}: ${n} día(s) que no venían se conservan de la copia anterior`);
  }
  writeFileSync(
    DESTINO,
    '// Copia de seguridad de mk2 y Arte Siete, hecha desde el móvil.\n' +
    '// La genera scripts/movil/respaldo-cines.mjs — NO se edita a mano.\n' +
    'export default ' + JSON.stringify({ generatedAt: new Date().toISOString(), cines }) + ';\n'
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // Un fallo aquí nunca debe tumbar la vuelta: es una copia de seguridad.
  try { await principal(); } catch (e) { console.log(`⚠️  respaldo: ${e.message}`); }
}
