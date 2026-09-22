// El respaldo del servidor vive en memoria y se pierde cuando la función se
// apaga. Este otro vive en el dispositivo, así que aguanta eso y funciona
// aunque no quede nada más. Se comprueba la lógica pura, sin navegador.
import assert from 'node:assert';

// Réplica mínima de localStorage
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
};

const RESPALDO_KEY = 'cartelera_respaldo_v1';
const RESPALDO_TTL_MS = 48 * 60 * 60 * 1000;
const leerRespaldo = () => { try { return JSON.parse(localStorage.getItem(RESPALDO_KEY) || '{}'); } catch { return {}; } };
function guardarRespaldo(cinemas) {
  const previo = leerRespaldo(); const ahora = Date.now();
  for (const c of cinemas ?? []) {
    if (c.source === 'live' && Object.keys(c.byDate ?? {}).length) previo[c.id] = { at: ahora, byDate: c.byDate };
  }
  for (const [id, v] of Object.entries(previo)) if (!v?.at || ahora - v.at > RESPALDO_TTL_MS) delete previo[id];
  localStorage.setItem(RESPALDO_KEY, JSON.stringify(previo));
}
function aplicarRespaldo(data) {
  if (!data?.cinemas) return data;
  const respaldo = leerRespaldo(); const ahora = Date.now();
  return { ...data, cinemas: data.cinemas.map((c) => {
    if (Object.keys(c.byDate ?? {}).length > 0) return c;
    const r = respaldo[c.id];
    if (!r?.at || ahora - r.at > RESPALDO_TTL_MS) return c;
    return { ...c, byDate: r.byDate, source: 'stale', staleAt: r.at };
  }) };
}

let fallos = 0;
const ok = (m) => console.log('ok    ' + m);
const mal = (m) => { fallos++; console.log('FALLO ' + m); };

const conDatos = { cinemas: [
  { id: 'yelmo-bahia-sur', source: 'live', byDate: { '2026-09-22': [{ title: 'Peli' }] } },
  { id: 'arte-siete-puerto', source: 'live', byDate: { '2026-09-22': [{ title: 'Otra' }] } },
]};
guardarRespaldo(conDatos.cinemas);
ok('se guarda lo que viene en vivo');

// Yelmo cae: llega vacío y marcado como error
const caido = { cinemas: [
  { id: 'yelmo-bahia-sur', source: 'error', reason: 'BLOQUEADO por Cloudflare (403)', byDate: {} },
  { id: 'arte-siete-puerto', source: 'live', byDate: { '2026-09-22': [{ title: 'Otra' }] } },
]};
const r = aplicarRespaldo(caido);
const yelmo = r.cinemas.find((c) => c.id === 'yelmo-bahia-sur');
if (yelmo.source !== 'stale') mal(`esperaba 'stale', salió '${yelmo.source}'`);
else ok(`el cine bloqueado se rellena desde el dispositivo → '${yelmo.source}'`);
if (!yelmo.staleAt) mal('no informa de cuándo se obtuvieron'); else ok('informa de la hora, para poder avisarlo');
if (!yelmo.byDate['2026-09-22']) mal('no recuperó los días'); else ok('recupera los días guardados');

const arte = r.cinemas.find((c) => c.id === 'arte-siete-puerto');
if (arte.source !== 'live') mal('un cine que SÍ responde no debe tocarse'); else ok('el cine que responde se deja intacto');

// Un respaldo no se respalda a sí mismo
almacen.clear();
guardarRespaldo([{ id: 'yelmo-bahia-sur', source: 'stale', byDate: { x: [1] } }]);
if (Object.keys(leerRespaldo()).length) mal('se guardó un dato ya caducado como si fuera bueno');
else ok('lo marcado como antiguo no se vuelve a guardar');

// Caducidad
almacen.set(RESPALDO_KEY, JSON.stringify({ 'yelmo-bahia-sur': { at: Date.now() - 49*3600*1000, byDate: { x: [1] } } }));
const viejo = aplicarRespaldo({ cinemas: [{ id: 'yelmo-bahia-sur', source: 'error', byDate: {} }] });
if (viejo.cinemas[0].source === 'stale') mal('usó un respaldo de hace más de 48 h');
else ok('un respaldo de más de 48 h ya no se usa');

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas pasan');
process.exit(fallos ? 1 : 0);
