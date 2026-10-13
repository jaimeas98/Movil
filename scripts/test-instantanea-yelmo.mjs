// La instantánea local es el último eslabón de la cadena de Yelmo: se usa solo
// cuando su API bloquea, y solo si es reciente. Aquí se comprueba esa lógica.
import { leerInstantanea, fetchYelmo, usarInstantanea } from '../lib/cinemas/yelmo.js';

let fallos = 0;
const ok = (m) => console.log('ok    ' + m);
const mal = (m) => { fallos++; console.log('FALLO ' + m); };

const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dma = (iso) => iso.split('-').reverse().join('/');
const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const maniana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const pase = (titulo, iso, hora) => ({
  Movies: [{ Title: titulo, RunTime: 100, Formats: [
    { Name: '2D', Language: 'Español', Showtimes: [{ Time: hora, ShowtimeId: '1', TimeFilter: `${dma(iso)} 22:30:00` }] }] }],
});

// Misma forma exacta que devuelve el API de Yelmo, que es como la guarda el
// recolector: así no hay dos formatos que mantener.
const hacer = (generatedAt) => ({
  generatedAt,
  cines: { 'yelmo-bahia-sur': { Key: 'premium-bahia-sur', VistaId: '1340',
    Dates: [pase('Peli de ayer', ayer, '20:00'), pase('Peli de hoy', hoy, '20:30'), pase('Peli de mañana', maniana, '21:00')] } },
});

// 1. Instantánea reciente → se usa
let r = leerInstantanea('yelmo-bahia-sur', hacer(new Date().toISOString()));
if (!r) mal('una instantánea recién hecha debería servir datos');
else ok(`instantánea fresca → ${Object.keys(r).length} día(s): ${Object.keys(r).join(', ')}`);

// 2. Los días ya pasados no se arrastran
if (r && Object.keys(r).some((d) => d < hoy)) mal(`arrastra días pasados: ${Object.keys(r).filter((d) => d < hoy)}`);
else ok('descarta los días ya pasados');

// 3. Conserva hoy y los siguientes
if (!r || !r[hoy]) mal('debería conservar el día de hoy');
else ok('conserva hoy y los días siguientes');

// 4. De hace un par de días → se usa, pero marcada con su fecha
const deAntes = leerInstantanea('yelmo-bahia-sur', hacer(new Date(Date.now() - 40 * 3600 * 1000).toISOString()));
if (!deAntes) mal('una instantánea de hace 40 h debería seguir sirviendo (mejor que el cine vacío)');
else if (!deAntes.staleAt) mal('una de hace 40 h debe ir marcada con su fecha, no como de ahora');
else ok('una de hace 40 h se usa, marcada con su fecha');
const reciente = leerInstantanea('yelmo-bahia-sur', hacer(new Date(Date.now() - 5 * 3600 * 1000).toISOString()));
if (reciente?.staleAt) mal('una de hace 5 h (dentro del turno) no debería marcarse como antigua');
else ok('una de hace 5 h se presenta normal');
if (Object.keys(deAntes ?? {}).includes('staleAt')) mal('la marca no puede aparecer como si fuera un día más');

// 4b. Más de 7 días → no se usa (mejor vacío que mentir)
if (leerInstantanea('yelmo-bahia-sur', hacer(new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString()))) {
  mal('una instantánea de hace 8 días no debería usarse');
} else ok('una de más de 7 días se descarta en vez de mentir');

// 5. Vacía o de otro cine → nada
if (leerInstantanea('yelmo-bahia-sur', { generatedAt: null, cines: {} })) mal('sin datos no debería devolver nada');
else ok('sin instantánea no inventa nada');
if (leerInstantanea('yelmo-jerez', hacer(new Date().toISOString()))) mal('no debería dar datos de un cine que no está');
else ok('un cine que no está en la instantánea no se rellena con otro');

// 6. Integración: con Yelmo bloqueado y sin instantánea, falla limpio
let peticiones = 0;
globalThis.fetch = async () => (peticiones++, new Response('<title>Attention Required! | Cloudflare</title>', {
  status: 403, headers: { server: 'cloudflare', 'content-type': 'text/html' } }));
try {
  usarInstantanea({ generatedAt: null, cines: {} });
  await fetchYelmo('yelmo-bahia-sur');
  mal('con todo bloqueado y sin instantánea debería fallar, no devolver datos');
} catch (e) {
  ok(`con todo bloqueado falla de forma clara: "${e.message.slice(0, 60)}…"`);
}

// 7. Integración: con Yelmo bloqueado y CON instantánea del móvil, la web la
// enseña. Es el caso real de cada día; el 13-10-2026 fallaba: el error del API
// se lanzaba antes de llegar a leer la instantánea y Yelmo salía vacío.
peticiones = 0;
try {
  usarInstantanea(hacer(new Date().toISOString()));
  const datos = await fetchYelmo('yelmo-bahia-sur');
  if (datos?.[hoy]?.[0]?.title === 'Peli de hoy') ok('con Yelmo bloqueado, la web enseña la instantánea del móvil');
  else mal(`con instantánea debería devolver sus películas, y ha dado: ${JSON.stringify(datos).slice(0, 80)}`);
  if (peticiones === 1) ok('y no insiste con más peticiones a una web que ya ha bloqueado');
  else mal(`ha hecho ${peticiones} peticiones a Yelmo; con la primera bloqueada sobra el resto`);
} catch (e) {
  mal(`con instantánea fresca no debería fallar: ${e.message}`);
}

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas pasan');
process.exit(fallos ? 1 : 0);
