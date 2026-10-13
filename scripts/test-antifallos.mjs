// Sistemas antifallos: una recogida corta o un cine caído no pueden dejar la
// cartelera con menos días de los que ya teníamos.
//  · Yelmo: el recolector del móvil fusiona cada recogida con la anterior.
//  · mk2 y Arte Siete: el móvil guarda una copia que la web usa si fallan.
import { fusionar, diaDe } from './movil/recolector-navegador.mjs';
import { fusionarRespaldo } from './movil/respaldo-cines.mjs';
import { getShowtimes, clearShowtimesCache, usarRespaldoMovil } from '../lib/cinemas/aggregator.js';
import { usarInstantanea } from '../lib/cinemas/yelmo.js';

let fallos = 0;
const ok = (m) => console.log('ok    ' + m);
const mal = (m) => { fallos++; console.log('FALLO ' + m); };
const H = 3600 * 1000, DIA = 24 * H;

const iso = (desplazamiento) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + desplazamiento * DIA));
const dma = (d) => d.split('-').reverse().join('/');
const bloque = (d, titulo = 'Peli') => ({ Movies: [{ Title: titulo, RunTime: 100, Formats: [
  { Name: '2D', Language: 'Español', Showtimes: [{ Time: '20:00', ShowtimeId: '1', TimeFilter: `${dma(d)} 22:30:00` }] }] }] });
const dias = (cine) => (cine?.Dates ?? []).map(diaDe);

// ── Yelmo: fusión en el recolector ─────────────────────────────────────────
const previa = { generatedAt: new Date(Date.now() - 11 * H).toISOString(), cines: {
  'yelmo-bahia-sur': { Key: 'premium-bahia-sur', Dates: [bloque(iso(-1)), bloque(iso(0), 'Vieja'), bloque(iso(1)), bloque(iso(2)), bloque(iso(3))] },
  'yelmo-jerez': { Key: 'area-sur', Dates: [bloque(iso(0)), bloque(iso(1))] },
} };
// La nueva solo trae hoy (con una película distinta) y no trae Jerez
const nueva = { cines: { 'yelmo-bahia-sur': { Key: 'premium-bahia-sur', Dates: [bloque(iso(0), 'Nueva')] } } };
const { cines, conservados } = fusionar(previa, nueva);
const bs = cines['yelmo-bahia-sur'];

JSON.stringify(dias(bs)) === JSON.stringify([iso(0), iso(1), iso(2), iso(3)])
  ? ok('Yelmo: una recogida que solo trae hoy conserva los días siguientes')
  : mal(`Yelmo: días tras fusionar ${dias(bs)}`);
bs.Dates[0].Movies[0].Title === 'Nueva'
  ? ok('Yelmo: el día que sí viene manda (si ha cambiado, se actualiza)')
  : mal('Yelmo: el día de hoy debería ser el de la recogida nueva');
!dias(bs).includes(iso(-1)) ? ok('Yelmo: los días ya pasados no se arrastran') : mal('Yelmo: arrastra ayer');
conservados['yelmo-bahia-sur'] === 3 ? ok('Yelmo: el registro dice cuántos días se han conservado') : mal(`conservados: ${JSON.stringify(conservados)}`);
JSON.stringify(dias(cines['yelmo-jerez'])) === JSON.stringify([iso(0), iso(1)])
  ? ok('Yelmo: un cine que no viene se conserva entero') : mal('Yelmo: se ha perdido Jerez');

// Lo conservado caduca: un día recogido hace 8 días ya no se arrastra
const vieja = { generatedAt: new Date(Date.now() - 8 * DIA).toISOString(), cines: {
  'yelmo-bahia-sur': { Dates: [bloque(iso(0)), bloque(iso(4))] } } };
const caducada = fusionar(vieja, nueva).cines['yelmo-bahia-sur'];
JSON.stringify(dias(caducada)) === JSON.stringify([iso(0)])
  ? ok('Yelmo: lo conservado caduca a los 7 días') : mal(`Yelmo: caducidad, quedan ${dias(caducada)}`);

// Y al fusionar otra vez, cada día recuerda cuándo se recogió de verdad
const segunda = fusionar({ generatedAt: new Date().toISOString(), cines }, nueva, Date.now() + 2 * DIA);
const sinRenovar = segunda.cines['yelmo-bahia-sur'].Dates.find((d) => diaDe(d) === iso(3));
sinRenovar && Date.parse(sinRenovar._recogido) < Date.now()
  ? ok('Yelmo: un día conservado no se "rejuvenece" al volver a fusionar')
  : mal('Yelmo: un día conservado debería mantener su fecha de recogida original');

// ── Copia de mk2 y Arte Siete en el móvil ──────────────────────────────────
const peli = (t) => [{ id: t, title: t, sessions: [{ time: '20:00' }] }];
const copiaPrevia = { 'cinesur-bahia-cadiz': { at: new Date(Date.now() - 11 * H).toISOString(),
  byDate: { [iso(-1)]: peli('a'), [iso(0)]: peli('a'), [iso(1)]: peli('b'), [iso(2)]: peli('c') } } };
const r = fusionarRespaldo(copiaPrevia, { 'cinesur-bahia-cadiz': { byDate: { [iso(0)]: peli('z') } } });
const mk = r.cines['cinesur-bahia-cadiz'];
JSON.stringify(Object.keys(mk.byDate).sort()) === JSON.stringify([iso(0), iso(1), iso(2)]) && mk.byDate[iso(0)][0].title === 'z'
  ? ok('copia mk2: lo nuevo manda y lo que falta se conserva (sin días pasados)') : mal(`copia mk2: ${JSON.stringify(Object.keys(mk.byDate))}`);
fusionarRespaldo(copiaPrevia, {}).cines['cinesur-bahia-cadiz']
  ? ok('copia mk2: si mk2 falla, su copia anterior se mantiene') : mal('copia mk2: se ha perdido al fallar');

// ── La web usando esa copia ────────────────────────────────────────────────
const real = globalThis.fetch;
let mk2 = 'caido';
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('mk2cines') && mk2 === 'caido') return new Response('', { status: 503 });
  return new Response('', { status: 500 });
};
const copiaWeb = (horas) => ({ generatedAt: 'x', cines: { 'cinesur-bahia-cadiz': {
  at: new Date(Date.now() - horas * H).toISOString(),
  byDate: { [iso(0)]: peli('Copia hoy'), [iso(1)]: peli('Copia mañana') } } } });
const cine = async (id) => { clearShowtimesCache(); return (await getShowtimes()).cinemas.find((c) => c.id === id); };
usarInstantanea({ generatedAt: null, cines: {} });

usarRespaldoMovil(copiaWeb(10));
let c = await cine('cinesur-bahia-cadiz');
c.source === 'stale' && c.byDate[iso(1)]?.[0]?.title === 'Copia mañana' && c.staleAt
  ? ok('web: con mk2 caído, enseña la copia del móvil avisando de su hora') : mal(`web: mk2 caído → ${c.source}`);

usarRespaldoMovil(copiaWeb(3 * 24));
c = await cine('cinesur-bahia-cadiz');
c.source === 'stale' ? ok('web: aunque la copia sea de hace 3 días, mejor eso que el cine vacío') : mal(`web: copia de 3 días → ${c.source}`);

usarRespaldoMovil(copiaWeb(8 * 24));
c = await cine('cinesur-bahia-cadiz');
c.source === 'error' ? ok('web: una copia de más de 7 días ya no se enseña') : mal(`web: copia de 8 días → ${c.source}`);

// Yelmo con la instantánea de hace 20 h: se ve, pero avisando
usarInstantanea({ generatedAt: new Date(Date.now() - 20 * H).toISOString(), cines: {
  'yelmo-bahia-sur': { Key: 'premium-bahia-sur', Dates: [bloque(iso(0)), bloque(iso(1))] } } });
c = await cine('yelmo-bahia-sur');
c.source === 'stale' && Object.keys(c.byDate).length === 2
  ? ok('web: Yelmo con datos de hace 20 h se enseña con el aviso de "datos del…"') : mal(`web: Yelmo de 20 h → ${c.source}`);

// Un cine que SÍ responde pero le faltan días: se completan con la copia
// reciente del móvil (el camino es el mismo para cualquier cine; aquí se
// prueba con Yelmo, que es el que se puede simular sin su HTML).
usarInstantanea({ generatedAt: new Date().toISOString(), cines: {
  'yelmo-bahia-sur': { Key: 'premium-bahia-sur', Dates: [bloque(iso(0)), bloque(iso(1))] } } });
const copiaHueco = (horas) => ({ cines: { 'yelmo-bahia-sur': { at: new Date(Date.now() - horas * H).toISOString(),
  byDate: { [iso(2)]: peli('Del hueco') } } } });
usarRespaldoMovil(copiaHueco(10));
c = await cine('yelmo-bahia-sur');
c.source === 'live' && c.byDate[iso(2)]?.[0]?.title === 'Del hueco' && c.byDate[iso(0)]
  ? ok('web: a un cine que responde le faltan días → se completan con la copia reciente')
  : mal(`web: hueco no completado (${c.source}, días ${Object.keys(c.byDate)})`);
usarRespaldoMovil(copiaHueco(48));
c = await cine('yelmo-bahia-sur');
!c.byDate[iso(2)] ? ok('web: pero con una copia de hace 2 días no se rellenan huecos') : mal('web: rellenó con una copia vieja');
usarRespaldoMovil(null);

globalThis.fetch = real;
console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas pasan');
process.exit(fallos ? 1 : 0);
