// La tira de días, la fila de cines y la arquitectura de la hoja.
//
// (El nombre viene del diseño anterior, que tenía una "ruleta" de chips de
// género con escalado progresivo; el rediseño la quitó: los géneros viven en
// un panel y los cines son interruptores. Lo que se sigue comprobando es lo
// que de aquello aún importa: que deslizar sobre una fila de chips no cambie
// de día, y la hoja.)
//
//  1. Todos los días miden lo mismo ("Mañana" incluido) y el elegido se
//     distingue de los demás
//  2. Deslizar en horizontal sobre la fila de cines es de la fila: no cambia
//     de día
//  3. La hoja: el que desplaza es su cuerpo, no el velo ni la propia hoja
//  4. Con el contenido desplazado, arrastrar el cuerpo no la cierra; desde el
//     tirador, sí
//
// Requiere el servidor de desarrollo en el 3210 (o CARTELERA_URL) y
// playwright instalado sin guardar (npm i --no-save playwright).
//
//   CARTELERA_SAMPLE=1 npx next dev -p 3210
//   node scripts/test-ruleta-y-hoja.mjs /tmp/shots

import { chromium } from 'playwright';
const OUT = process.argv[2] || '.';
const URL = process.env.CARTELERA_URL || 'http://127.0.0.1:3210/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 560 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const err = []; p.on('pageerror', e => err.push(String(e)));
await p.route('**/api/ratings', async (r) => {
  const body = JSON.parse(r.request().postData() || '{}');
  const ratings = Object.fromEntries((body.titles||[]).map(t => [t, { imdb:'7.4', rt:'85%', metacritic:'72', average:78 }]));
  await r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ratings }) });
});
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForSelector('.cine-interruptor');
await p.waitForTimeout(800);
let fallos = 0; const mal = m => { fallos++; console.log('FALLO ' + m); };

// 1. Todos los chips de día deben medir lo mismo (el bug de "Mañana").
// offsetWidth = ancho de MAQUETACIÓN.
const anchos = await p.locator('.day-chip').evaluateAll(els => els.map(e => ({
  t: e.textContent.replace(/\s+/g,' ').trim(), w: e.offsetWidth,
  activo: e.classList.contains('active'),
  fondo: getComputedStyle(e).backgroundColor,
})));
const unicos = [...new Set(anchos.map(a => a.w))];
if (unicos.length > 1) mal(`los días tienen anchos distintos: ${JSON.stringify(anchos.slice(0,4))}`);
else console.log(`ok    todos los días miden ${unicos[0]}px de maquetación, "Mañana" incluido`);
const act = anchos.find(a => a.activo), otro = anchos.find(a => !a.activo);
if (act && otro && act.fondo === otro.fondo) mal('el día seleccionado no se distingue del resto');
else if (act) console.log(`ok    el SELECCIONADO se distingue (${act.fondo} frente a ${otro.fondo})`);

// 2. Deslizar sobre la fila de cines no cambia de día
const diaAntes = await p.locator('.day-chip.active .dnum').textContent();
await p.evaluate(async () => {
  const fila = document.querySelector('.cines');
  const r = fila.getBoundingClientRect();
  const y = r.top + r.height / 2, x0 = r.right - 30;
  const t = (x) => new Touch({ identifier: 1, target: fila, clientX: x, clientY: y });
  const ev = (n, x) => fila.dispatchEvent(new TouchEvent(n, { bubbles: true, cancelable: true, touches: n === 'touchend' ? [] : [t(x)], changedTouches: [t(x)] }));
  ev('touchstart', x0);
  for (let i = 1; i <= 12; i++) { ev('touchmove', x0 - i * 20); await new Promise(r => requestAnimationFrame(r)); }
  ev('touchend', x0 - 240);
});
await p.waitForTimeout(700);
const diaDespues = await p.locator('.day-chip.active .dnum').textContent();
if (diaAntes !== diaDespues) mal(`deslizar sobre la fila de cines cambió de día (${diaAntes} → ${diaDespues})`);
else console.log('ok    deslizar sobre la fila de cines es de la fila: no cambia de día');

// 3. La hoja: scroll propio en el cuerpo; ni el velo ni la hoja desplazan
await p.locator('.peli-cartel').first().click();
await p.waitForSelector('.hoja');
await p.waitForTimeout(700);
const arq = await p.evaluate(() => {
  const h = document.querySelector('.hoja'), c = document.querySelector('.hoja-cuerpo');
  const capa = document.querySelector('.hoja-capa'), velo = document.querySelector('.hoja-velo');
  return {
    cuerpoScroll: getComputedStyle(c).overflowY,
    contain: getComputedStyle(c).overscrollBehaviorY,
    hojaScroll: getComputedStyle(h).overflowY,
    capaScroll: getComputedStyle(capa).overflowY,
    veloScroll: getComputedStyle(velo).overflowY,
    tiradorTouch: getComputedStyle(document.querySelector('.hoja-tirador')).touchAction,
    desborda: c.scrollHeight > c.clientHeight,
  };
});
if (arq.cuerpoScroll !== 'auto' || arq.contain !== 'contain' || [arq.hojaScroll, arq.capaScroll, arq.veloScroll].some(v => v === 'auto' || v === 'scroll'))
  mal(`arquitectura incorrecta: ${JSON.stringify(arq)}`);
else console.log(`ok    el cuerpo de la hoja desplaza (${arq.cuerpoScroll}, contención ${arq.contain}); ni la hoja ni el velo`);
if (arq.tiradorTouch !== 'none') mal(`el tirador no fija touch-action:none (${arq.tiradorTouch})`);
else console.log('ok    el tirador tiene touch-action:none (siempre se puede arrastrar)');

// 4. Desplazada, arrastrar el cuerpo no la cierra; desde el tirador sí
await p.evaluate(() => { document.querySelector('.hoja-cuerpo').scrollTop = 180; });
await p.waitForTimeout(150);
const st = await p.evaluate(() => document.querySelector('.hoja-cuerpo').scrollTop);
async function arrastra(sel, dy) {
  await p.evaluate(async ({ sel, dy }) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width/2, y0 = r.top + Math.min(10, r.height/2);
    const t = (y) => new Touch({ identifier: 1, target: el, clientX: x0, clientY: y });
    const ev = (n, y) => el.dispatchEvent(new TouchEvent(n, { bubbles:true, cancelable:true,
      touches: n==='touchend'?[]:[t(y)], changedTouches:[t(y)] }));
    ev('touchstart', y0);
    for (let i=1;i<=12;i++){ ev('touchmove', y0 + dy*i/12); await new Promise(r=>requestAnimationFrame(r)); }
    ev('touchend', y0+dy);
  }, { sel, dy });
  await p.waitForTimeout(800);
}
if (st > 0) {
  await arrastra('.hoja-cuerpo', 200);
  if ((await p.locator('.hoja').count()) === 0) mal('se cerró arrastrando desde el cuerpo estando desplazada');
  else console.log('ok    desplazada, arrastrar el cuerpo no la cierra');
  await arrastra('.hoja-tirador', 260);
  if ((await p.locator('.hoja').count()) !== 0) mal('el tirador no cierra la ficha');
  else console.log('ok    el tirador cierra aunque esté desplazada');
} else console.log('info  la ficha no desborda; caso no comprobable');

if (err.length) mal('JS: ' + err[0]);
await p.locator('.controles').screenshot({ path: `${OUT}/controles.png` });
await b.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
