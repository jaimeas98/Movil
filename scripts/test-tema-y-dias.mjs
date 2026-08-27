import { chromium } from 'playwright';
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0; const mal = m => { fallos++; console.log('FALLO ' + m); };

// Los dos escenarios de entrada: sistema en oscuro y sistema en claro, sin
// nada guardado en localStorage (que es la primera visita real).
for (const esquema of ['dark', 'light']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: esquema, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.route('**/api/ratings', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ratings: {} }) }));
  await p.addInitScript(() => { try { localStorage.removeItem('theme'); } catch {} });
  await p.goto('http://127.0.0.1:3210/', { waitUntil: 'networkidle' });
  await p.waitForSelector('.f-chip'); await p.waitForTimeout(500);

  const boton = p.locator('.header-actions .btn-icon').last();
  const antes = await p.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    fondo: getComputedStyle(document.body).backgroundColor,
  }));
  // PRIMERA pulsación: debe cambiar el tema de verdad, no solo el icono
  await boton.click(); await p.waitForTimeout(400);
  const despues = await p.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    fondo: getComputedStyle(document.body).backgroundColor,
  }));
  if (antes.attr === despues.attr) mal(`sistema ${esquema}: la 1ª pulsación no cambió el tema (${antes.attr})`);
  else if (antes.fondo === despues.fondo) mal(`sistema ${esquema}: cambió el atributo pero no el fondo`);
  else console.log(`ok    sistema ${esquema}: 1ª pulsación cambia de verdad (${antes.attr} → ${despues.attr})`);

  // El icono debe corresponder con el tema
  const icono = await p.evaluate(() => {
    const b = [...document.querySelectorAll('.header-actions .btn-icon')].pop();
    return { luna: !!b.querySelector('path[d^="M21"]'), etiqueta: b.getAttribute('aria-label') };
  });
  const esOscuro = despues.attr === 'dark';
  if (icono.luna === esOscuro) mal(`sistema ${esquema}: el icono no corresponde (luna=${icono.luna}, oscuro=${esOscuro})`);
  else console.log(`ok    sistema ${esquema}: icono correcto → "${icono.etiqueta}"`);

  // El atajo T debe mantener el icono sincronizado
  await p.locator('body').click({ position: { x: 5, y: 500 } });
  await p.keyboard.press('t'); await p.waitForTimeout(400);
  const trasT = await p.evaluate(() => {
    const b = [...document.querySelectorAll('.header-actions .btn-icon')].pop();
    return { attr: document.documentElement.getAttribute('data-theme'), luna: !!b.querySelector('path[d^="M21"]') };
  });
  if (trasT.luna === (trasT.attr === 'dark')) mal(`sistema ${esquema}: tras el atajo T el icono se quedó al revés`);
  else console.log(`ok    sistema ${esquema}: el atajo T mantiene el icono sincronizado`);
  await ctx.close();
}

// Día recortado
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const p = await ctx.newPage();
await p.route('**/api/ratings', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ ratings: {} }) }));
await p.goto('http://127.0.0.1:3210/', { waitUntil: 'networkidle' });
await p.waitForSelector('.day-chip'); await p.waitForTimeout(600);
const corte = await p.evaluate(() => {
  const pista = document.querySelector('.days-scroll');
  const activo = document.querySelector('.day-chip.active');
  const cp = pista.getBoundingClientRect(), ca = activo.getBoundingClientRect();
  return { sobresale: Math.round(cp.left - ca.left), pistaX: Math.round(cp.left), chipX: Math.round(ca.left) };
});
if (corte.sobresale > 0) mal(`el día activo se sale ${corte.sobresale}px por la izquierda y se corta`);
else console.log(`ok    el día activo no se corta (chip en x=${corte.chipX}, carrusel en x=${corte.pistaX})`);
await p.locator('.days').screenshot({ path: `${OUT}/dias.png` });
await b.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
