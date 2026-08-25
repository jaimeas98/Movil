import { chromium } from 'playwright';
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 560 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const err = []; p.on('pageerror', e => err.push(String(e)));
await p.route('**/api/ratings', async (r) => {
  const body = JSON.parse(r.request().postData() || '{}');
  const ratings = Object.fromEntries((body.titles||[]).map(t => [t, { imdb:'7.4', rt:'85%', metacritic:'72', average:78 }]));
  await r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ratings }) });
});
await p.goto('http://127.0.0.1:3210/', { waitUntil: 'networkidle' });
await p.waitForSelector('.f-chip');
await p.waitForTimeout(800);
let fallos = 0; const mal = m => { fallos++; console.log('FALLO ' + m); };

// 1. Todos los chips de día deben medir lo mismo (el bug de "Mañana")
// offsetWidth = ancho de MAQUETACIÓN, sin el escalado del seleccionado.
const anchos = await p.locator('.day-chip').evaluateAll(els => els.map(e => ({
  t: e.textContent.replace(/\s+/g,' ').trim(), w: e.offsetWidth,
  activo: e.classList.contains('active'),
  visual: Math.round(e.getBoundingClientRect().width) })));
const unicos = [...new Set(anchos.map(a => a.w))];
if (unicos.length > 1) mal(`los días tienen anchos distintos: ${JSON.stringify(anchos.slice(0,4))}`);
else console.log(`ok    todos los días miden ${unicos[0]}px de maquetación, "Mañana" incluido`);
const act = anchos.find(a => a.activo), otro = anchos.find(a => !a.activo);
if (act && otro && act.visual <= otro.visual) mal('el día seleccionado no se ve mayor que el resto');
else if (act) console.log(`ok    el SELECCIONADO destaca (${act.visual}px frente a ${otro.visual}px)`);
const manana = anchos.find(a => /mañana/i.test(a.t));
if (manana && !manana.activo && manana.visual > otro.visual + 1) mal('"Mañana" sigue siendo más grande sin estar seleccionado');
else if (manana) console.log('ok    "Mañana" ya no sobresale por su etiqueta');

// 2. La ficha debe tener scroll propio y el velo no
await p.locator('.movie-card, .movies-grid > *').first().click();
await p.waitForSelector('.modal');
await p.waitForTimeout(600);
const arq = await p.evaluate(() => {
  const m = document.querySelector('.modal'), o = document.querySelector('.modal-overlay');
  return {
    fichaScroll: getComputedStyle(m).overflowY,
    veloScroll: getComputedStyle(o).overflowY,
    fichaDesborda: m.scrollHeight > m.clientHeight,
    contain: getComputedStyle(m).overscrollBehaviorY,
  };
});
if (arq.fichaScroll !== 'auto' || arq.veloScroll !== 'hidden') mal(`arquitectura incorrecta: ${JSON.stringify(arq)}`);
else console.log(`ok    la ficha desplaza (${arq.fichaScroll}, contención ${arq.contain}) y el velo no`);

// 3. Arrastrar desde el cuerpo con la ficha DESPLAZADA no debe cerrarla; desde el tirador sí
await p.evaluate(() => { document.querySelector('.modal').scrollTop = 180; });
await p.waitForTimeout(150);
const st = await p.evaluate(() => document.querySelector('.modal').scrollTop);
async function arrastra(sel, dy) {
  await p.evaluate(async ({ sel, dy }) => {
    const el = document.querySelector(sel);
    const hoja = document.querySelector('.modal');
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
  await arrastra('.modal', 200);
  if ((await p.locator('.modal').count()) === 0) mal('se cerró arrastrando desde el cuerpo estando desplazada');
  else console.log('ok    desplazada, arrastrar el cuerpo no la cierra');
  await arrastra('.modal-tirador', 220);
  if ((await p.locator('.modal').count()) !== 0) mal('el tirador no cierra la ficha');
  else console.log('ok    el tirador cierra aunque esté desplazada');
} else console.log('info  la ficha no desborda; caso no comprobable');

// 4. Ruleta: el chip aplicado debe quedar centrado
await p.waitForTimeout(400);
const fila = p.locator('.chip-row').first();
await fila.evaluate(el => el.scrollBy({ left: 300, behavior: 'smooth' }));
await p.waitForTimeout(1400);
const centrado = await p.evaluate(() => {
  const f = document.querySelector('.chip-row');
  const a = f.querySelector('.f-chip[aria-pressed="true"]');
  if (!a) return null;
  const cf = f.getBoundingClientRect(), ca = a.getBoundingClientRect();
  return { texto: a.textContent.trim(), desvio: Math.round(Math.abs((ca.left+ca.width/2) - (cf.left+cf.width/2))) };
});
if (!centrado) mal('no hay chip activo tras la ruleta');
else if (centrado.desvio > 24) mal(`el chip aplicado no queda centrado (desvío ${centrado.desvio}px)`);
else console.log(`ok    la ruleta centra el chip aplicado ("${centrado.texto}", desvío ${centrado.desvio}px)`);

// 5. Escalado progresivo
const escalas = await p.locator('.chip-row').first().locator('.f-chip').evaluateAll(
  els => els.map(e => Number(e.style.getPropertyValue('--esc') || 1)));
if (new Set(escalas.map(v => v.toFixed(2))).size < 2) mal(`sin degradado de escala: ${escalas}`);
else console.log(`ok    escalado progresivo activo (${Math.min(...escalas).toFixed(2)} … ${Math.max(...escalas).toFixed(2)})`);

if (err.length) mal('JS: ' + err[0]);
await p.locator('.filters').screenshot({ path: `${OUT}/ruleta2.png` });
await b.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
