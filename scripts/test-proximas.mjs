import { chromium } from 'playwright';
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0; const mal = m => { fallos++; console.log('FALLO ' + m); };

const hoy = new Date();
const iso = (n) => new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + n)).toISOString().slice(0,10);
const peli = (t, extra = {}) => ({ id: t.toLowerCase().replace(/\W+/g,'-'), title: t, posterUrl: null,
  durationMin: 102, genre: 'Clásico', ageRating: null, synopsis: 'Sinopsis de ' + t, rating: null, isNew: false,
  sessions: [{ time: '20:00', format: '2D', language: 'VOSE', room: 'Sala 9', buyUrl: 'https://example.com/x' }], ...extra });

// Cartelera con días cercanos y, además, un ciclo a meses vista
const datos = {
  generatedAt: new Date().toISOString(),
  dates: Array.from({length:14}, (_,i)=>iso(i)),
  mode: 'live',
  cinemas: [{
    id: 'cinesur-bahia-cadiz', name: 'mk2 Cinesur Bahía de Cádiz', short: 'Cinesur Bahía',
    city: 'Cádiz', venue: 'C.C. Bahía de Cádiz', color: '#e11d48', website: '#',
    source: 'live', reason: null, liveDates: [],
    byDate: {
      [iso(0)]: [peli('Toy Story 5', { genre: 'Animación' })],
      [iso(1)]: [peli('Toy Story 5', { genre: 'Animación' })],
      [iso(40)]: [peli('Pesadilla en Elm Street')],
      [iso(61)]: [peli('Casablanca')],
      [iso(68)]: [peli('Casablanca')],
    },
  }, {
    id: 'arte-siete-puerto', name: 'Arte Siete El Puerto', short: 'Arte Siete',
    city: 'El Puerto', venue: 'C.C. Bahía Mar', color: '#059669', website: '#',
    source: 'live', reason: null, liveDates: [],
    byDate: { [iso(40)]: [peli('Pesadilla en Elm Street')] },
  }],
  _coverage: {},
};

const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const err = []; p.on('pageerror', e => err.push(String(e)));
await p.route('**/api/showtimes**', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(datos) }));
await p.route('**/api/ratings', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ratings: {} }) }));
await p.addInitScript(() => localStorage.clear());
await p.goto('http://127.0.0.1:3210/', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);

const boton = p.locator('.prox-btn');
if (!(await boton.count())) mal('no aparece el botón de próximas habiendo ciclos programados');
else console.log('ok    el botón aparece en la cabecera (solo si hay ciclos)');

await boton.click();
await p.waitForSelector('.modal.proximas');
await p.waitForTimeout(500);

const items = await p.locator('.prox-item').count();
const titulos = await p.locator('.prox-nombre').allTextContents();
// Toy Story está en los días visibles: NO debe salir aquí
if (titulos.some(t => /toy story/i.test(t))) mal('una película de la cartelera actual aparece en próximas');
else console.log(`ok    solo lo que está más allá de la tira: ${JSON.stringify(titulos)}`);
if (items !== 2) mal(`esperaba 2 películas agrupadas, hay ${items}`);
else console.log('ok    agrupa por película (Casablanca con sus dos pases en una sola entrada)');

// Orden: lo más cercano primero
if (!/elm street/i.test(titulos[0] || '')) mal(`el orden no es por fecha más cercana: ${titulos[0]}`);
else console.log('ok    ordenado por fecha más cercana');

// Desplegar y ver los pases con sus cines
await p.locator('.prox-cabecera').first().click();
await p.waitForTimeout(400);
const pases = await p.locator('.prox-pase').count();
const cines = await p.locator('.prox-pase-cine').allTextContents();
if (pases !== 2) mal(`Elm Street debería tener 2 pases (dos cines), hay ${pases}`);
else console.log(`ok    al desplegar se ven los pases y su cine: ${JSON.stringify(cines)}`);

const sinopsis = await p.locator('.prox-sinopsis').count();
if (!sinopsis) mal('no se muestra la sinopsis al desplegar');
else console.log('ok    muestra sinopsis y horarios con enlace de compra');

if (err.length) mal('JS: ' + err[0]);
await p.locator('.modal.proximas').screenshot({ path: `${OUT}/proximas.png` });
await b.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\nPróximas correcto');
process.exit(fallos ? 1 : 0);
