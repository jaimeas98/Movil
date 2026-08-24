// Comprueba que los gestos táctiles acompañan al dedo en vez de ser un
// detector que decide al soltar. Verifica cuatro cosas:
//
//  1. la ficha se mueve mientras arrastras (antes estaba quieta)
//  2. con la ficha desplazada, arrastrar hacia abajo NO la cierra — era un
//     fallo real: el contenedor con scroll es el velo, no la ficha, así que
//     volver a subir leyendo la cerraba
//  3. el gesto cancela touchmove, que es lo que impide que el navegador se
//     quede el gesto y recargue la página
//  4. el contenido acompaña el arrastre al cambiar de día
//
// Requiere el servidor de desarrollo en el 3210 y playwright instalado sin
// guardar (npm i --no-save playwright), que se queda fuera de package.json a
// propósito para no ralentizar el build.
//
//   CARTELERA_SAMPLE=1 npx next dev -p 3210
//   node scripts/test-gestos.mjs /tmp/shots
//
// AVISO: esto comprueba la MECÁNICA, no la sensación. Los emuladores no
// reproducen el comportamiento táctil real de iOS ni su "tirar para recargar";
// el tacto de los umbrales hay que ajustarlo con el dedo puesto.

import { chromium } from 'playwright';
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', e => errores.push(String(e)));
await p.route('**/api/ratings', async (r) => {
  const body = JSON.parse(r.request().postData() || '{}');
  const ratings = Object.fromEntries((body.titles||[]).map(t => [t, { imdb:'7.4', rt:'85%', metacritic:'72', average:78 }]));
  await r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ratings }) });
});
await p.goto('http://127.0.0.1:3210/', { waitUntil: 'networkidle' });
await p.waitForSelector('.f-chip');
await p.waitForTimeout(700);

let fallos = 0;
const mal = m => { fallos++; console.log('FALLO ' + m); };

// Gesto táctil real, con seguimiento paso a paso
async function arrastrar(sel, dx, dy, pasos = 12) {
  await p.evaluate(async ({ sel, dx, dy, pasos }) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2;
    const y0 = Math.min(r.top + 40, innerHeight - 60);
    const punto = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    const ev = (tipo, x, y) => el.dispatchEvent(new TouchEvent(tipo, {
      bubbles: true, cancelable: true,
      touches: tipo === 'touchend' ? [] : [punto(x, y)],
      changedTouches: [punto(x, y)],
    }));
    ev('touchstart', x0, y0);
    for (let i = 1; i <= pasos; i++) {
      ev('touchmove', x0 + (dx * i) / pasos, y0 + (dy * i) / pasos);
      await new Promise(r => requestAnimationFrame(r));
    }
    ev('touchend', x0 + dx, y0 + dy);
  }, { sel, dx, dy, pasos });
}

// ── 1. La ficha debe SEGUIR AL DEDO ──────────────────────────────────────────
await p.locator('.movie-card, .movies-grid > *').first().click();
await p.waitForSelector('.modal');
await p.waitForTimeout(500);

const seguimiento = await p.evaluate(async () => {
  const hoja = document.querySelector('.modal');
  const r = hoja.getBoundingClientRect();
  const x0 = r.left + r.width / 2, y0 = r.top + 30;
  const punto = (y) => new Touch({ identifier: 1, target: hoja, clientX: x0, clientY: y });
  const ev = (t, y) => hoja.dispatchEvent(new TouchEvent(t, {
    bubbles: true, cancelable: true,
    touches: t === 'touchend' ? [] : [punto(y)], changedTouches: [punto(y)],
  }));
  ev('touchstart', y0);
  const muestras = [];
  for (let i = 1; i <= 8; i++) {
    const dy = i * 12;
    ev('touchmove', y0 + dy);
    await new Promise(r => requestAnimationFrame(r));
    const m = new DOMMatrix(getComputedStyle(hoja).transform);
    muestras.push({ dedo: dy, hoja: Math.round(m.m42) });
  }
  ev('touchend', y0 + 96);
  return muestras;
});
const sigue = seguimiento.filter(s => s.hoja > 0).length;
if (sigue < 6) mal(`la ficha no sigue al dedo: ${JSON.stringify(seguimiento)}`);
else console.log(`ok    la ficha sigue al dedo (dedo ${seguimiento.at(-1).dedo}px → hoja ${seguimiento.at(-1).hoja}px)`);
await p.waitForTimeout(700);

// ── 2. Con la ficha desplazada, arrastrar hacia abajo NO debe cerrarla ───────
await p.locator('.movie-card, .movies-grid > *').first().click();
await p.waitForSelector('.modal');
await p.waitForTimeout(500);
await p.evaluate(() => { document.querySelector('.modal-overlay').scrollTop = 200; });
await p.waitForTimeout(150);
const scrollReal = await p.evaluate(() => document.querySelector('.modal-overlay').scrollTop);
if (scrollReal > 0) {
  await arrastrar('.modal', 0, 160);
  await p.waitForTimeout(700);
  const sigueAbierta = await p.locator('.modal').count();
  if (!sigueAbierta) mal('la ficha se cerró mientras el usuario hacía scroll dentro (el fallo original)');
  else console.log('ok    con la ficha desplazada, arrastrar no la cierra');
} else {
  console.log('info  la ficha no tiene scroll a este tamaño; caso no comprobable aquí');
}
await p.keyboard.press('Escape');
await p.waitForTimeout(500);

// ── 3. touchmove debe estar cancelado (esto es lo que frena la recarga) ──────
await p.locator('.movie-card, .movies-grid > *').first().click();
await p.waitForSelector('.modal');
await p.waitForTimeout(500);
const cancelado = await p.evaluate(async () => {
  const hoja = document.querySelector('.modal');
  const r = hoja.getBoundingClientRect();
  const x0 = r.left + r.width / 2, y0 = r.top + 30;
  const punto = (y) => new Touch({ identifier: 1, target: hoja, clientX: x0, clientY: y });
  hoja.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [punto(y0)], changedTouches: [punto(y0)] }));
  const e = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [punto(y0 + 1)], changedTouches: [punto(y0 + 1)] });
  hoja.dispatchEvent(e);
  const r1 = e.defaultPrevented;
  const e2 = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [punto(y0 + 40)], changedTouches: [punto(y0 + 40)] });
  hoja.dispatchEvent(e2);
  const r2 = e2.defaultPrevented;
  hoja.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [punto(y0 + 40)] }));
  return { primeros: r1, arrastre: r2 };
});
if (!cancelado.primeros || !cancelado.arrastre) mal(`touchmove no cancelado: ${JSON.stringify(cancelado)}`);
else console.log('ok    el gesto cancela touchmove (es lo que impide la recarga del navegador)');
await p.waitForTimeout(800);

// ── 4. El contenido acompaña al cambiar de día ──────────────────────────────
await p.keyboard.press('Escape');
await p.waitForTimeout(600);
const diaAntes = await p.locator('.day-chip.active .dnum').textContent();
const acompana = await p.evaluate(async () => {
  const zona = document.querySelector('main');
  const titulo = document.querySelector('.selected-day');
  const r = zona.getBoundingClientRect();
  const x0 = r.left + r.width / 2, y0 = r.top + 300;
  const punto = (x) => new Touch({ identifier: 1, target: zona, clientX: x, clientY: y0 });
  const ev = (t, x) => zona.dispatchEvent(new TouchEvent(t, {
    bubbles: true, cancelable: true,
    touches: t === 'touchend' ? [] : [punto(x)], changedTouches: [punto(x)],
  }));
  ev('touchstart', x0);
  let maximo = 0;
  for (let i = 1; i <= 10; i++) {
    ev('touchmove', x0 - i * 16);
    await new Promise(r => requestAnimationFrame(r));
    const m = new DOMMatrix(getComputedStyle(titulo).transform);
    maximo = Math.min(maximo, m.m41);
  }
  ev('touchend', x0 - 160);
  return Math.round(maximo);
});
if (acompana >= -20) mal(`el título no acompaña el arrastre (desplazamiento máximo ${acompana}px)`);
else console.log(`ok    el contenido acompaña al dedo (${acompana}px de recorrido)`);
await p.waitForTimeout(900);
const diaDespues = await p.locator('.day-chip.active .dnum').textContent();
if (diaAntes === diaDespues) mal(`el día no cambió tras el gesto (sigue en ${diaDespues})`);
else console.log(`ok    el día cambió (${diaAntes} → ${diaDespues})`);

if (errores.length) mal('errores JS: ' + errores[0]);
await p.screenshot({ path: `${OUT}/gestos.png` });
await b.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\nGestos correctos');
process.exit(fallos ? 1 : 0);
