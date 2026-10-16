// Comprueba que la nota se lee (contraste AA, 4,5:1) allí donde se pinta.
//
// El caso que motivó esta prueba: la nota iba superpuesta al cartel y, sobre
// un cartel beige claro, el número era ilegible. En el rediseño la nota salió
// del cartel y va en la línea de datos de cada película, en texto; además la
// ficha la enseña en grande con su desglose. La prueba sigue midiendo el
// contraste REAL, compuesto en el navegador, en esos tres sitios y en los dos
// temas, y comprueba que la nota no ha vuelto a meterse encima del cartel.
//
// Mide así: captura del elemento, se busca el color de fondo predominante ya
// compuesto (en el propio navegador, con un <canvas>: no hace falta pngjs) y
// se compara con el color computado del texto. La tinta NO se deduce de la
// imagen: en los bordes antialiasados hay píxeles intermedios que mentirían.
//
// Requiere el servidor de desarrollo en el puerto 3210 (o CARTELERA_URL) y
// playwright instalado sin guardar (npm i --no-save playwright). Playwright
// NO está en package.json a propósito: su postinstall descarga ~150MB y
// ralentizaría el build de Vercel.
//
//   CARTELERA_SAMPLE=1 npx next dev -p 3210
//   node scripts/test-contraste-nota.mjs /tmp/shots

import { chromium } from 'playwright';

const OUT = process.argv[2] || '.';
const URL = process.env.CARTELERA_URL || 'http://127.0.0.1:3210/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const lum = (r, g, b_) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b_);
};
const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

// Color predominante de una captura PNG, decodificada en la propia página.
async function fondoDe(p, png) {
  return p.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const cuenta = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
      cuenta.set(k, (cuenta.get(k) || 0) + 1);
    }
    return [...cuenta.entries()].sort((x, y) => y[1] - x[1])[0][0].split(',').map(Number);
  }, png.toString('base64'));
}

const tintaDe = (loc) => loc.evaluate((el) => {
  const c = getComputedStyle(el).color.match(/[0-9.]+/g).map(Number);
  return [c[0], c[1], c[2]];
});

let fallos = 0;
for (const tema of ['dark', 'light']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  // Sin carteles: lo que se mide es la nota, no la imagen.
  await p.route('**/*', (route) => {
    if (route.request().resourceType() === 'image') return route.abort();
    route.continue();
  });
  // Sin claves de TMDB en local la nota nunca llega: la fabricamos.
  await p.route('**/api/ratings', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const ratings = Object.fromEntries((body.titles || []).map((t) => [t,
      { imdb: '7.4', rt: '85%', metacritic: '72', tmdb: '6.9', average: 78, genre: null }]));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ratings }) });
  });
  await p.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, tema);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForSelector('.peli-nota');
  await p.waitForTimeout(500);

  // La nota no puede volver a ir encima del cartel
  const encima = await p.evaluate(() => [...document.querySelectorAll('.peli-nota')].some((n) => n.closest('.peli-cartel')));
  if (encima) { fallos++; console.log(`FALLO  tema ${tema}: la nota vuelve a estar dentro del cartel`); }

  const medir = async (nombre, sel) => {
    const loc = p.locator(sel).first();
    const ruta = `${OUT}/nota-${tema}-${nombre}.png`;
    const png = await loc.screenshot({ path: ruta });
    const tinta = await tintaDe(loc);
    const fondo = await fondoDe(p, png);
    const r = ratio(lum(...tinta), lum(...fondo));
    const ok = r >= 4.5;
    if (!ok) fallos++;
    console.log(`${ok ? 'ok    ' : 'FALLO '} ${nombre.padEnd(14)} tema ${tema.padEnd(5)} -> ${r.toFixed(2)}:1  tinta rgb(${tinta}) sobre rgb(${fondo})`);
  };

  await medir('lista', '.peli-nota');
  await p.locator('.peli-titulo-boton').first().click();
  await p.waitForSelector('.ficha-media-num');
  await p.waitForTimeout(700);
  await medir('ficha-media', '.ficha-media-num');
  await medir('ficha-fuente', '.nota-num');
  await ctx.close();
}
await b.close();
console.log(fallos ? `\n${fallos} por debajo de 4.5:1` : '\nTodos cumplen AA (4.5:1)');
process.exit(fallos ? 1 : 0);
