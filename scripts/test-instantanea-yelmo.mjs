// La instantánea local es el último eslabón de la cadena de Yelmo: se usa solo
// cuando su API bloquea, y solo si es reciente. Aquí se comprueba esa lógica.
import { leerInstantanea, fetchYelmo } from '../lib/cinemas/yelmo.js';

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

// 4. Demasiado vieja → no se usa (mejor vacío que mentir)
if (leerInstantanea('yelmo-bahia-sur', hacer(new Date(Date.now() - 40 * 3600 * 1000).toISOString()))) {
  mal('una instantánea de hace 40 h no debería usarse');
} else ok('una de más de 36 h se descarta en vez de mentir');

// 5. Vacía o de otro cine → nada
if (leerInstantanea('yelmo-bahia-sur', { generatedAt: null, cines: {} })) mal('sin datos no debería devolver nada');
else ok('sin instantánea no inventa nada');
if (leerInstantanea('yelmo-jerez', hacer(new Date().toISOString()))) mal('no debería dar datos de un cine que no está');
else ok('un cine que no está en la instantánea no se rellena con otro');

// 6. Integración: con Yelmo bloqueado y sin instantánea, falla limpio
globalThis.fetch = async () => new Response('<title>Attention Required! | Cloudflare</title>', {
  status: 403, headers: { server: 'cloudflare', 'content-type': 'text/html' } });
try {
  await fetchYelmo('yelmo-bahia-sur');
  mal('con todo bloqueado y sin instantánea debería fallar, no devolver datos');
} catch (e) {
  ok(`con todo bloqueado falla de forma clara: "${e.message.slice(0, 60)}…"`);
}

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas pasan');
process.exit(fallos ? 1 : 0);
