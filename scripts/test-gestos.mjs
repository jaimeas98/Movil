// Comprueba que los gestos táctiles acompañan al dedo y deciden bien al
// soltar. La hoja de la ficha (components/Hoja.jsx):
//
//  1. sigue al dedo 1:1 mientras arrastras
//  2. un arrastre corto y lento vuelve a su sitio
//  3. un arrastre largo y lento la cierra (por distancia)
//  4. un lanzamiento corto y rápido la cierra (por velocidad)
//  5. hacia arriba cede con goma (menos que el dedo) y vuelve
//  6. con el contenido desplazado, arrastrar el cuerpo NO la cierra
//  7. relevo: subiendo el contenido hasta arriba, el mismo dedo se lleva la hoja
//  8. el gesto cancela touchmove (lo que impide que el navegador recargue)
//  9. se puede agarrar a mitad de animación: se queda donde está, sin saltos
// 10. la transición del cartel no deja la página sorda: un toque la salta,
//     y nunca hay dos elementos con el mismo view-transition-name
// 11. con movimiento reducido no hay vuelo y la hoja aparece igual
// 12. el contenido acompaña al dedo al cambiar de día, y el día cambia
//
// Requiere el servidor de desarrollo en el 3210 (o CARTELERA_URL) y
// playwright instalado sin guardar (npm i --no-save playwright), que se queda
// fuera de package.json a propósito para no ralentizar el build.
//
//   CARTELERA_SAMPLE=1 npx next dev -p 3210
//   node scripts/test-gestos.mjs /tmp/shots
//
// AVISO: esto comprueba la MECÁNICA, no la sensación. Los emuladores no
// reproducen el comportamiento táctil real de iOS ni su "tirar para recargar";
// el tacto de los umbrales hay que ajustarlo con el dedo puesto.

import { chromium } from 'playwright';
const OUT = process.argv[2] || '.';
const URL = process.env.CARTELERA_URL || 'http://127.0.0.1:3210/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const mal = (m) => { fallos++; console.log('FALLO ' + m); };
const bien = (m) => console.log('ok    ' + m);

// Gesto táctil con seguimiento paso a paso, dentro de la página.
//   desde: 'tirador' | 'cuerpo'   pasos de dy/pasos px, con `ms` entre pasos
//   quieto: ms con el dedo parado antes de soltar (velocidad ~0)
//   enMedio(i): se ejecuta tras cada paso (para simular el scroll nativo)
const AYUDA = () => {
  window.__gesto = async ({ desde = 'tirador', dy, pasos = 12, ms = 16, quieto = 0, soltar = true, relevoEn = -1 }) => {
    const hoja = document.querySelector('.hoja');
    const el = desde === 'tirador' ? hoja.querySelector('.hoja-tirador') : hoja.querySelector('.hoja-cuerpo');
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2;
    const y0 = desde === 'tirador' ? r.top + r.height / 2 : r.top + 60;
    const t = (y) => new Touch({ identifier: 7, target: el, clientX: x0, clientY: y });
    const ev = (tipo, y) => {
      const e = new TouchEvent(tipo, { bubbles: true, cancelable: true, touches: tipo === 'touchend' ? [] : [t(y)], changedTouches: [t(y)] });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const espera = (n) => new Promise((res) => setTimeout(res, n));
    ev('touchstart', y0);
    const muestras = [];
    for (let i = 1; i <= pasos; i++) {
      const d = (dy * i) / pasos;
      const cancelado = ev('touchmove', y0 + d);
      if (i === relevoEn) hoja.querySelector('.hoja-cuerpo').scrollTop = 0;   // el scroll nativo llega arriba
      await new Promise((res) => requestAnimationFrame(res));
      if (ms > 16) await espera(ms - 16);
      muestras.push({ dedo: Math.round(d), hoja: Math.round(new DOMMatrix(getComputedStyle(hoja).transform).m42), cancelado });
    }
    if (quieto) {
      // El dedo se para: sigue llegando touchmove en el mismo sitio
      const fin = performance.now() + quieto;
      while (performance.now() < fin) { ev('touchmove', y0 + dy); await espera(16); }
    }
    if (soltar) ev('touchend', y0 + dy);
    return muestras;
  };
  window.__posHoja = () => {
    const h = document.querySelector('.hoja');
    return h ? Math.round(new DOMMatrix(getComputedStyle(h).transform).m42) : null;
  };
};

async function pagina(opciones = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, ...opciones });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', (e) => p.errores.push(String(e)));
  await p.route('**/api/ratings', async (r) => {
    const body = JSON.parse(r.request().postData() || '{}');
    const ratings = Object.fromEntries((body.titles || []).map((t) => [t, { imdb: '7.4', rt: '85%', metacritic: '72', tmdb: '6.9', average: 78 }]));
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ratings }) });
  });
  await p.addInitScript(AYUDA);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForSelector('.cine-interruptor');
  await p.waitForTimeout(700);
  return { ctx, p };
}

const { ctx, p } = await pagina();
const abrir = async () => {
  if (await p.locator('.hoja').count()) return;
  await p.locator('.peli-cartel').first().click();
  await p.waitForSelector('.hoja');
  await p.waitForTimeout(650);
};
const abierta = async () => (await p.locator('.hoja').count()) > 0;
const alto = () => p.evaluate(() => document.querySelector('.hoja').offsetHeight);

// ── 1. Sigue al dedo 1:1 ──────────────────────────────────────────────────────
await abrir();
{
  const m = await p.evaluate(() => window.__gesto({ dy: 120, pasos: 10, ms: 30, quieto: 150 }));
  const desvio = Math.max(...m.slice(1).map((s) => Math.abs(s.hoja - s.dedo)));
  if (desvio > 2) mal(`la hoja no va pegada al dedo: ${JSON.stringify(m)}`);
  else bien(`la hoja sigue al dedo 1:1 (dedo ${m.at(-1).dedo}px → hoja ${m.at(-1).hoja}px, desvío máx. ${desvio}px)`);
  // ── 2. …y como era corto y lento, vuelve a su sitio
  await p.waitForTimeout(700);
  const pos = await p.evaluate(() => window.__posHoja());
  if (!(await abierta())) mal('un arrastre corto y lento la ha cerrado');
  else if (Math.abs(pos) > 1) mal(`no ha vuelto a su sitio (se ha quedado en ${pos}px)`);
  else bien('arrastre corto y lento: vuelve a su sitio con el muelle');
}

// ── 3. Largo y lento: cierra por distancia ────────────────────────────────────
{
  const h = await alto();
  await p.evaluate((dy) => window.__gesto({ dy, pasos: 16, ms: 40, quieto: 200 }), Math.round(h * 0.6));
  await p.waitForTimeout(700);
  if (await abierta()) mal('arrastrarla lento hasta el 60 % no la cierra');
  else bien('arrastre largo y lento (60 % del alto, parado al soltar): se cierra');
}

// ── 4. Corto y rápido: cierra por velocidad ───────────────────────────────────
await abrir();
{
  await p.evaluate(() => window.__gesto({ dy: 70, pasos: 5, ms: 16 }));
  await p.waitForTimeout(700);
  if (await abierta()) mal('un lanzamiento corto y rápido (70 px en ~80 ms) no la cierra');
  else bien('lanzamiento corto y rápido: se cierra (proyección de la inercia)');
}

// ── 5. Hacia arriba: goma ─────────────────────────────────────────────────────
await abrir();
{
  const m = await p.evaluate(() => window.__gesto({ dy: -220, pasos: 12, ms: 20 }));
  const ultimo = m.at(-1);
  if (!(ultimo.hoja < -8 && ultimo.hoja > ultimo.dedo * 0.6)) mal(`hacia arriba no cede con goma: ${JSON.stringify(ultimo)}`);
  else bien(`hacia arriba cede con goma (dedo ${ultimo.dedo}px → hoja ${ultimo.hoja}px)`);
  await p.waitForTimeout(800);
  const pos = await p.evaluate(() => window.__posHoja());
  if (!(await abierta()) || Math.abs(pos) > 1) mal(`tras la goma no vuelve a su sitio (${pos})`);
  else bien('y vuelve a su sitio al soltar');
}

// ── 6. Con el contenido desplazado, el cuerpo no la cierra ────────────────────
{
  await p.evaluate(() => { document.querySelector('.hoja-cuerpo').scrollTop = 200; });
  await p.waitForTimeout(100);
  const st = await p.evaluate(() => document.querySelector('.hoja-cuerpo').scrollTop);
  if (st > 0) {
    const m = await p.evaluate(() => window.__gesto({ desde: 'cuerpo', dy: 220, pasos: 12, ms: 16 }));
    await p.waitForTimeout(600);
    if (!(await abierta())) mal('se cerró arrastrando el cuerpo con el contenido desplazado (el fallo original)');
    else if (m.some((s) => s.hoja > 2)) mal('la hoja se movió mientras el contenido estaba desplazado');
    else bien('con el contenido desplazado, arrastrar el cuerpo no la mueve ni la cierra');
  } else console.log('info  la ficha no desborda a este tamaño; caso no comprobable aquí');
}

// ── 7. Relevo del scroll al arrastre ──────────────────────────────────────────
{
  await p.evaluate(() => { document.querySelector('.hoja-cuerpo').scrollTop = 40; });
  await p.waitForTimeout(100);
  const m = await p.evaluate(() => window.__gesto({ desde: 'cuerpo', dy: 200, pasos: 16, ms: 20, relevoEn: 4, quieto: 150 }));
  const antes = m.slice(0, 4).every((s) => s.hoja === 0);
  const despues = m.at(-1).hoja;
  if (!antes || despues < 60) mal(`no hay relevo del scroll al arrastre: ${JSON.stringify(m.map((s) => s.hoja))}`);
  else bien(`relevo: al llegar arriba, el mismo dedo se lleva la hoja (hoja ${despues}px)`);
  await p.waitForTimeout(800);
}

// ── 8. touchmove cancelado ────────────────────────────────────────────────────
await abrir();
{
  await p.evaluate(() => { document.querySelector('.hoja-cuerpo').scrollTop = 0; });
  const r = await p.evaluate(() => {
    const el = document.querySelector('.hoja-cuerpo');
    const rc = el.getBoundingClientRect();
    const x0 = rc.left + rc.width / 2, y0 = rc.top + 40;
    const t = (y) => new Touch({ identifier: 9, target: el, clientX: x0, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t(y0)], changedTouches: [t(y0)] }));
    const e1 = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(y0 + 1)], changedTouches: [t(y0 + 1)] });
    el.dispatchEvent(e1);
    const e2 = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(y0 + 40)], changedTouches: [t(y0 + 40)] });
    el.dispatchEvent(e2);
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t(y0 + 40)] }));
    return { primeros: e1.defaultPrevented, arrastre: e2.defaultPrevented };
  });
  if (!r.primeros || !r.arrastre) mal(`touchmove no cancelado: ${JSON.stringify(r)}`);
  else bien('el gesto cancela touchmove (es lo que impide la recarga del navegador)');
  await p.waitForTimeout(800);
}

// ── 9. Agarrarla a mitad de animación ─────────────────────────────────────────
await abrir();
{
  // Se suelta a 160 px despacio: empieza a volver. A los 70 ms se agarra otra vez.
  await p.evaluate(() => window.__gesto({ dy: 160, pasos: 10, ms: 30, quieto: 120 }));
  await p.waitForTimeout(70);
  const r = await p.evaluate(async () => {
    const hoja = document.querySelector('.hoja');
    const enVuelo = window.__posHoja();
    const el = hoja.querySelector('.hoja-cuerpo');
    const t = (y) => new Touch({ identifier: 3, target: el, clientX: 200, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t(500)], changedTouches: [t(500)] }));
    await new Promise((res) => requestAnimationFrame(res));
    const alAgarrar = window.__posHoja();
    await new Promise((res) => setTimeout(res, 120));
    const quieta = window.__posHoja();
    el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(530)], changedTouches: [t(530)] }));
    await new Promise((res) => requestAnimationFrame(res));
    const sigue = window.__posHoja();
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t(530)] }));
    return { enVuelo, alAgarrar, quieta, sigue };
  });
  const ok = r.enVuelo > 5 && r.enVuelo < 155 &&
    Math.abs(r.alAgarrar - r.enVuelo) < 25 && Math.abs(r.quieta - r.alAgarrar) <= 1 &&
    Math.abs(r.sigue - (r.alAgarrar + 30)) <= 2;
  if (!ok) mal(`agarrarla en marcha no la deja donde está: ${JSON.stringify(r)}`);
  else bien(`se agarra en marcha: estaba en ${r.enVuelo}px, se queda en ${r.quieta}px y sigue al dedo (${r.sigue}px)`);
  await p.waitForTimeout(800);
}
await p.keyboard.press('Escape');
await p.waitForTimeout(700);
if (await abierta()) mal('Escape no cierra la ficha');
else bien('Escape cierra la ficha');

// ── 10. La transición del cartel ──────────────────────────────────────────────
{
  const hayVT = await p.evaluate(() => typeof document.startViewTransition === 'function');
  if (!hayVT) console.log('info  este navegador no tiene View Transitions; se prueba solo la hoja');
  else {
    await p.locator('.peli-cartel').first().click();
    const durante = await p.evaluate(() => new Promise((res) => {
      const t0 = performance.now();
      const mirar = () => {
        if (document.documentElement.dataset.vt === 'abrir' && document.querySelector('.hoja')) {
          const nombres = [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).viewTransitionName === 'cartel').length;
          res({ vt: true, nombres });
        } else if (performance.now() - t0 > 400) res({ vt: false });
        else requestAnimationFrame(mirar);
      };
      mirar();
    }));
    if (!durante.vt) mal('al abrir desde el cartel no hay View Transition');
    else if (durante.nombres !== 1) mal(`hay ${durante.nombres} elementos con view-transition-name "cartel" a la vez`);
    else bien('el cartel vuela a la ficha con View Transition (un solo elemento con su nombre)');
    // Un toque durante el vuelo lo salta: la página no se queda sorda. (Sobre
    // el título, que no es un enlace: un toque en una entrada abriría la web
    // del cine en otra pestaña y dejaría esta en segundo plano.)
    if (durante.vt) {
      await p.touchscreen.tap(300, 190);
      await p.waitForTimeout(60);
      const sigue = await p.evaluate(() => document.documentElement.dataset.vt);
      if (sigue) mal('un toque durante la transición no la salta');
      else bien('un toque durante el vuelo lo salta al estado final (no bloquea)');
    }
    await p.waitForTimeout(500);
    if (await abierta()) {
      await p.locator('.hoja-cerrar').click();
      const cierre = await p.evaluate(() => new Promise((res) => {
        const t0 = performance.now();
        const mirar = () => {
          if (document.documentElement.dataset.vt === 'cerrar') res(true);
          else if (performance.now() - t0 > 300) res(false);
          else requestAnimationFrame(mirar);
        };
        mirar();
      }));
      await p.waitForTimeout(500);
      if (!cierre) mal('al cerrar con el botón el cartel no vuelve con View Transition');
      else if (await abierta()) mal('la ficha no se cerró');
      else bien('al cerrar, el cartel vuelve a la lista por el mismo camino');
    }
  }
}

// ── 11. Movimiento reducido ───────────────────────────────────────────────────
{
  const r = await pagina({ reducedMotion: 'reduce' });
  await r.p.locator('.peli-cartel').first().click();
  const vt = await r.p.evaluate(() => document.documentElement.dataset.vt ?? null);
  await r.p.waitForTimeout(400);
  const est = await r.p.evaluate(() => {
    const h = document.querySelector('.hoja');
    return h && { op: getComputedStyle(h).opacity, y: new DOMMatrix(getComputedStyle(h).transform).m42 };
  });
  if (vt) mal('con movimiento reducido el cartel sigue volando');
  else if (!est || Number(est.op) < 0.99 || Math.abs(est.y) > 0.5) mal(`con movimiento reducido la hoja no queda en su sitio: ${JSON.stringify(est)}`);
  else bien('movimiento reducido: sin vuelo ni desplazamiento, la hoja aparece con un fundido');
  if (r.p.errores.length) mal('errores JS (reducido): ' + r.p.errores[0]);
  await r.ctx.close();
}

// ── 12. El contenido acompaña al cambiar de día ───────────────────────────────
await p.waitForTimeout(300);
const diaAntes = await p.locator('.day-chip.active .dnum').textContent();
const acompana = await p.evaluate(async () => {
  const zona = document.querySelector('main');
  const titulo = document.querySelector('.selected-day');
  const r = zona.getBoundingClientRect();
  const x0 = r.left + r.width / 2, y0 = Math.min(r.top + 300, innerHeight - 100);
  const punto = (x) => new Touch({ identifier: 1, target: zona, clientX: x, clientY: y0 });
  const ev = (t, x) => zona.dispatchEvent(new TouchEvent(t, {
    bubbles: true, cancelable: true,
    touches: t === 'touchend' ? [] : [punto(x)], changedTouches: [punto(x)],
  }));
  ev('touchstart', x0);
  let maximo = 0;
  for (let i = 1; i <= 10; i++) {
    ev('touchmove', x0 - i * 16);
    await new Promise((r) => requestAnimationFrame(r));
    const m = new DOMMatrix(getComputedStyle(titulo).transform);
    maximo = Math.min(maximo, m.m41);
  }
  ev('touchend', x0 - 160);
  return Math.round(maximo);
});
if (acompana >= -20) mal(`el título no acompaña el arrastre (desplazamiento máximo ${acompana}px)`);
else bien(`el contenido acompaña al dedo al cambiar de día (${acompana}px de recorrido)`);
await p.waitForTimeout(900);
const diaDespues = await p.locator('.day-chip.active .dnum').textContent();
if (diaAntes === diaDespues) mal(`el día no cambió tras el gesto (sigue en ${diaDespues})`);
else bien(`el día cambió (${diaAntes} → ${diaDespues})`);

if (p.errores.length) mal('errores JS: ' + p.errores[0]);
await p.screenshot({ path: `${OUT}/gestos.png` });
await b.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\nGestos correctos');
process.exit(fallos ? 1 : 0);
