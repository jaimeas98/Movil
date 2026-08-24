// Comprueba que la nota superpuesta al cartel se lee sobre CUALQUIER cartel.
// El caso que motivó esto: un cartel beige claro dejaba el número ilegible.
//
// Mide el contraste real componiendo en el navegador, no sobre el papel: se
// sustituyen los carteles por blanco puro y negro puro (los dos extremos), se
// captura la insignia y se compara el color computado del texto con el color
// de fondo predominante ya compuesto.
//
// Requiere el servidor de desarrollo en el puerto 3210 y playwright + pngjs
// instalados sin guardar (npm i --no-save playwright pngjs). Playwright NO
// está en package.json a propósito: su postinstall descarga ~150MB y
// ralentizaría el build de Vercel.
//
//   CARTELERA_SAMPLE=1 npx next dev -p 3210
//   node scripts/test-contraste-nota.mjs /tmp/shots

import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'fs';

const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const lum = (r, g, b_) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b_);
};
const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

let fallos = 0;
for (const tema of ['dark', 'light']) {
  for (const [nombre, color] of [['blanco', '#ffffff'], ['negro', '#000000']]) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
    const p = await ctx.newPage();
    // Sustituimos TODOS los carteles por un color plano: es el peor caso real.
    await p.route('**/*', (route) => {
      if (route.request().resourceType() === 'image') return route.abort();
      route.continue();
    });
    // Sin claves de TMDB en local la nota nunca llega: la fabricamos.
    await p.route('**/api/ratings', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      const ratings = Object.fromEntries((body.titles || []).map((t) => [t,
        { imdb: '7.4', rt: '85%', metacritic: '72', tmdb: null, average: 78, genre: null }]));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ratings }) });
    });
    await p.goto('http://127.0.0.1:3210/', { waitUntil: 'networkidle' });
    await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
    await p.addStyleTag({ content: `.poster-ph, .poster img { background: ${color} !important; background-image: none !important; }` });
    await p.waitForSelector('.poster-rating');
    await p.waitForTimeout(500);

    const ruta = `${OUT}/nota-${tema}-${nombre}.png`;
    await p.locator('.poster-rating').first().screenshot({ path: ruta });

    // La tinta NO se deduce de la imagen: en un cartel blanco el píxel más
    // claro es la esquina redondeada del propio cartel, no el número. Usamos el
    // color computado real del texto y lo comparamos con el fondo compuesto.
    const tinta = await p.locator('.poster-rating').first().evaluate((el) => {
      const c = getComputedStyle(el).color.match(/[0-9.]+/g).map(Number);
      return [c[0], c[1], c[2]];
    });
    const png = PNG.sync.read(fs.readFileSync(ruta));
    const cuenta = new Map();
    for (let i = 0; i < png.data.length; i += 4) {
      const k = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`;
      cuenta.set(k, (cuenta.get(k) || 0) + 1);
    }
    const fondo = [...cuenta.entries()].sort((a, c) => c[1] - a[1])[0][0].split(',').map(Number);
    const r = ratio(lum(...tinta), lum(...fondo));
    const ok = r >= 4.5;
    if (!ok) fallos++;
    console.log(`${ok ? 'ok    ' : 'FALLO '} cartel ${nombre.padEnd(6)} tema ${tema.padEnd(5)} -> ${r.toFixed(2)}:1  tinta rgb(${tinta}) sobre rgb(${fondo})`);
    await ctx.close();
  }
}
await b.close();
console.log(fallos ? `\n${fallos} por debajo de 4.5:1` : '\nTodos cumplen AA (4.5:1)');
process.exit(fallos ? 1 : 0);
