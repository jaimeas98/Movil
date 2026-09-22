// Cuando un cine deja de responder —Yelmo ha puesto Cloudflare delante de su
// API y bloquea a nuestro servidor— la web debe seguir enseñando lo último que
// sí consiguió, avisando de que es antiguo, en vez de quedarse en blanco.
import { getShowtimes, clearShowtimesCache } from '../lib/cinemas/aggregator.js';

let fallos = 0;
const mal = (m) => { fallos++; console.log('FALLO ' + m); };

// Interceptamos fetch para simular: primero todo bien, luego Cloudflare corta.
const real = globalThis.fetch;
let bloquearYelmo = false;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('yelmocines.es')) {
    if (bloquearYelmo) {
      return new Response('<!DOCTYPE html><title>Attention Required! | Cloudflare</title>', {
        status: 403, headers: { 'content-type': 'text/html', server: 'cloudflare' },
      });
    }
    return new Response(JSON.stringify({ d: { Cinemas: [
      { Key: 'premium-bahia-sur', VistaId: '1340', Dates: [
        { Movies: [{ Title: 'Peli de prueba', RunTime: 100, Formats: [
          { Name: '2D', Language: 'Español', Showtimes: [{ Time: '20:00', ShowtimeId: '1', TimeFilter: '22/09/2026 22:30:00' }] }] }] },
      ] },
      { Key: 'area-sur', VistaId: '803', Dates: [] },
    ] } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  // Los demás cines no importan en esta prueba
  return new Response('', { status: 500 });
};

const yelmo = (d) => d.cinemas.find((c) => c.id === 'yelmo-bahia-sur');

const bueno = yelmo(await getShowtimes());
if (bueno.source !== 'live') mal(`primera carga: esperaba 'live', salió '${bueno.source}' (${bueno.reason})`);
else console.log(`ok    con el API respondiendo → '${bueno.source}', ${Object.keys(bueno.byDate).length} día(s)`);

// Ahora Cloudflare corta
bloquearYelmo = true;
clearShowtimesCache();
const tras = yelmo(await getShowtimes());

if (tras.source === 'error') mal('tras el bloqueo el cine se queda vacío en vez de usar el respaldo');
else if (tras.source !== 'stale') mal(`esperaba 'stale', salió '${tras.source}'`);
else console.log(`ok    tras el bloqueo → '${tras.source}', conserva ${Object.keys(tras.byDate).length} día(s)`);

if (!tras.staleAt) mal('no se informa de cuándo se obtuvieron los datos');
else console.log('ok    informa de la hora del respaldo, para poder avisarlo en pantalla');

if (!/cloudflare/i.test(tras.reason || '')) mal(`el motivo no menciona el bloqueo: "${tras.reason}"`);
else console.log(`ok    el motivo lo dice claro: "${tras.reason}"`);

const iguales = JSON.stringify(Object.keys(tras.byDate)) === JSON.stringify(Object.keys(bueno.byDate));
if (!iguales) mal('el respaldo no conserva los mismos días');
else console.log('ok    el respaldo conserva los mismos días que la última respuesta buena');

globalThis.fetch = real;
console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas pasan');
process.exit(fallos ? 1 : 0);
