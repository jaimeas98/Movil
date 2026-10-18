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
// 11. con movimiento reducido no hay vuelo y la hoja aparece igual, y el
//     arrastre sigue al dedo (solo cambia lo que pasa al soltar)
// 12. el contenido acompaña al dedo al cambiar de día, y el día cambia
// 13. en el panel de escritorio el cartel de la lista no se va nunca: crece
//     una copia, la abierta queda marcada (sin atenuar), otra película se
//     abre a través del velo y al cerrar la copia vuelve sobre el original
//
// Regresiones de la revisión de movimiento:
//  · velocidad tras una pausa: arrastrar deprisa, PARARSE (el navegador no
//    manda touchmove con el dedo quieto) y soltar no es un lanzamiento: ni
//    cierra la hoja ni cambia de día
//  · un segundo dedo durante el deslizamiento de día no deja la lista
//    desplazada y apagada a medias
//  · al confirmar el día, el contenido sigue hacia donde iba el dedo (no da
//    media vuelta hacia el centro)
//  · al cerrar con la ficha desplazada, el cartel NO vuela desde fuera de la
//    pantalla: la hoja se cierra con su muelle
//  · un toque quieto durante la entrada de la hoja no la cierra
//  · mientras la hoja se va, el velo ya deja pasar los toques
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
//   quieto: ms con el dedo parado antes de soltar. Parado de verdad: SIN
//           touchmove, como hace el navegador (antes se mandaban touchmove en
//           el mismo sitio, y eso escondía el fallo de la velocidad).
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
    if (quieto) await espera(quieto);   // el dedo se para: no llega nada
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

// ── 2b. Deprisa, pausa y soltar: no es un lanzamiento ─────────────────────────
{
  // 150 px en ~80 ms (casi 2 px/ms) y 300 ms quieto sin un solo touchmove.
  await p.evaluate(() => window.__gesto({ dy: 150, pasos: 5, ms: 16, quieto: 300 }));
  await p.waitForTimeout(700);
  const pos = await p.evaluate(() => window.__posHoja());
  if (!(await abierta())) mal('arrastrar deprisa, pararse y soltar la ha cerrado como si fuera un lanzamiento');
  else if (Math.abs(pos) > 1) mal(`tras la pausa no ha vuelto a su sitio (${pos}px)`);
  else bien('deprisa, pausa de 300 ms sin eventos y soltar: vuelve a su sitio (la velocidad es 0)');
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

// ── 10b. Ficha desplazada: el cartel no vuela desde fuera ─────────────────────
{
  await abrir();
  const desborda = await p.evaluate(() => { const c = document.querySelector('.hoja-cuerpo'); c.scrollTop = c.scrollHeight; return c.scrollTop > 200; });
  if (!desborda) console.log('info  la ficha no desborda lo bastante a este tamaño; 10b no comprobable');
  else {
    await p.waitForTimeout(100);
    await p.locator('.hoja-cerrar').click();
    const vt = await p.evaluate(() => new Promise((res) => {
      const t0 = performance.now();
      const mirar = () => {
        if (document.documentElement.dataset.vt === 'cerrar') res('cerrar');
        else if (performance.now() - t0 > 250) res(null);
        else requestAnimationFrame(mirar);
      };
      mirar();
    }));
    await p.waitForTimeout(600);
    if (vt) mal('con la ficha desplazada, el cartel vuela desde fuera de la pantalla al cerrar');
    else if (await abierta()) mal('con la ficha desplazada, el botón no la cierra');
    else bien('ficha desplazada: se cierra con su muelle, sin vuelo desde fuera de la pantalla');
  }
}

// ── 10c. Un toque quieto durante la entrada no la cierra ──────────────────────
{
  // Próximas entra siempre con el muelle (no hay cartel que vuele).
  if (await p.locator('.prox-btn').count()) {
    await p.locator('.prox-btn').click();
    const r = await p.evaluate(async () => {
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const hoja = document.querySelector('.hoja');
      const enMarcha = window.__posHoja();
      const el = hoja.querySelector('.hoja-cuerpo');
      const rc = el.getBoundingClientRect();
      const t = new Touch({ identifier: 5, target: el, clientX: rc.left + 100, clientY: Math.min(rc.top + 40, innerHeight - 20) });
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t], changedTouches: [t] }));
      await new Promise((res) => setTimeout(res, 40));
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t] }));
      // Mientras se va, ¿el velo deja pasar los toques? (se comprueba al cerrar)
      return { enMarcha };
    });
    await p.waitForTimeout(700);
    const pos = await p.evaluate(() => window.__posHoja());
    if (!(r.enMarcha > 40)) console.log(`info  la entrada ya había acabado al tocar (${r.enMarcha}px); 10c no comprobable`);
    else if (!(await abierta())) mal(`un toque quieto durante la entrada (a ${r.enMarcha}px) la ha cerrado`);
    else if (Math.abs(pos) > 1) mal(`tras el toque durante la entrada no ha llegado a su sitio (${pos}px)`);
    else bien(`toque quieto durante la entrada (a ${r.enMarcha}px): sigue entrando y llega a su sitio`);

    // 10d. Al cerrar, el velo deja de recoger toques en cuanto empieza la salida
    await p.locator('.hoja-cerrar').click();
    const sordo = await p.evaluate(() => getComputedStyle(document.querySelector('.hoja-velo')).pointerEvents);
    await p.waitForTimeout(600);
    if (sordo !== 'none') mal(`mientras la hoja se va, el velo sigue tapando la página (pointer-events ${sordo})`);
    else bien('mientras la hoja se va, el velo ya deja pasar los toques');
  } else console.log('info  sin Próximas en estos datos; 10c y 10d no comprobables');
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
  // El arrastre sigue al dedo también con movimiento reducido (antes la hoja
  // se quedaba quieta y el gesto parecía roto); lo que cambia es soltar.
  await r.p.waitForTimeout(300);
  const m = await r.p.evaluate(() => window.__gesto({ dy: 80, pasos: 8, ms: 30, quieto: 120 }));
  const desvio = Math.max(...m.slice(1).map((s) => Math.abs(s.hoja - s.dedo)));
  if (desvio > 2) mal(`con movimiento reducido la hoja no sigue al dedo: ${JSON.stringify(m.slice(-2))}`);
  else bien(`movimiento reducido: la hoja sigue al dedo 1:1 (dedo ${m.at(-1).dedo}px → hoja ${m.at(-1).hoja}px)`);
  await r.p.waitForTimeout(500);
  const tras = await r.p.evaluate(() => { const h = document.querySelector('.hoja'); return h && { op: getComputedStyle(h).opacity, y: new DOMMatrix(getComputedStyle(h).transform).m42 }; });
  if (!tras || Number(tras.op) < 0.99 || Math.abs(tras.y) > 0.5) mal(`movimiento reducido: tras un arrastre corto no vuelve a su sitio: ${JSON.stringify(tras)}`);
  else bien('movimiento reducido: al soltar corto vuelve a su sitio con un fundido, sin viajar');
  // Y el deslizamiento de día: también sigue al dedo y el día cambia (con un
  // fundido en su sitio en vez de la salida y la entrada).
  await r.p.keyboard.press('Escape');
  await r.p.waitForTimeout(400);
  const diaR = await r.p.locator('.day-chip.active .dnum').textContent();
  const sigue = await r.p.evaluate(async () => {
    const zona = document.querySelector('main');
    const panel = document.querySelector('.dia-panel');
    const rc = zona.getBoundingClientRect();
    const x0 = rc.left + rc.width / 2 + 100, y0 = Math.min(rc.top + 320, innerHeight - 120);
    const t = (x) => new Touch({ identifier: 4, target: zona, clientX: x, clientY: y0 });
    const ev = (n, x) => zona.dispatchEvent(new TouchEvent(n, { bubbles: true, cancelable: true, touches: n === 'touchend' ? [] : [t(x)], changedTouches: [t(x)] }));
    ev('touchstart', x0);
    let max = 0;
    for (let i = 1; i <= 10; i++) { ev('touchmove', x0 - i * 16); await new Promise((res) => requestAnimationFrame(res)); max = Math.min(max, new DOMMatrix(getComputedStyle(panel).transform).m41); }
    ev('touchend', x0 - 160);
    return Math.round(max);
  });
  await r.p.waitForTimeout(500);
  const diaR2 = await r.p.locator('.day-chip.active .dnum').textContent();
  if (sigue > -100) mal(`movimiento reducido: el día no sigue al dedo (${sigue}px)`);
  else if (diaR === diaR2) mal('movimiento reducido: deslizar no cambia de día');
  else bien(`movimiento reducido: el día sigue al dedo (${sigue}px) y cambia (${diaR} → ${diaR2}) con un fundido`);
  if (r.p.errores.length) mal('errores JS (reducido): ' + r.p.errores[0]);
  await r.ctx.close();
}

// ── 12. El contenido acompaña al cambiar de día ───────────────────────────────
await p.waitForTimeout(300);
const diaAntes = await p.locator('.day-chip.active .dnum').textContent();
const acompana = await p.evaluate(async () => {
  const zona = document.querySelector('main');
  const titulo = document.querySelector('.dia-panel');
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

// ── Deslizamientos de día con más detalle ─────────────────────────────────────
// Un deslizamiento con el dedo `id` sobre la cartelera; devuelve lo que pasó.
await p.evaluate(() => {
  window.__dia = () => document.querySelector('.day-chip.active .dnum')?.textContent;
  window.__panel = () => {
    const el = document.querySelector('.dia-panel');
    const cs = getComputedStyle(el);
    return { x: Math.round(new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform).m41), o: +(+cs.opacity).toFixed(2), desl: document.querySelector('main').dataset.deslizando ?? null };
  };
  window.__toque = (tipo, puntos, cambiados) => {
    const zona = document.querySelector('main');
    const mk = ([x, y, id]) => new Touch({ identifier: id, target: zona, clientX: x, clientY: y });
    const e = new TouchEvent(tipo, { bubbles: true, cancelable: true, touches: puntos.map(mk), changedTouches: (cambiados ?? puntos).map(mk) });
    zona.dispatchEvent(e);
  };
  window.__fotograma = () => new Promise((r) => requestAnimationFrame(r));
});
const centro = await p.evaluate(() => { const r = document.querySelector('main').getBoundingClientRect(); return [r.left + r.width / 2 + 100, Math.min(r.top + 320, innerHeight - 120)]; });
await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await p.waitForTimeout(300);

// 12b. Deprisa, pausa sin eventos y soltar: no cambia de día
{
  const antes = await p.evaluate(() => window.__dia());
  await p.evaluate(async ([x0, y0]) => {
    window.__toque('touchstart', [[x0, y0, 1]]);
    for (let i = 1; i <= 4; i++) { await window.__fotograma(); window.__toque('touchmove', [[x0 - i * 15, y0, 1]]); }
    await new Promise((r) => setTimeout(r, 300));   // dedo quieto: no llega nada
    window.__toque('touchend', [], [[x0 - 60, y0, 1]]);
  }, centro);
  await p.waitForTimeout(600);
  const despues = await p.evaluate(() => window.__dia());
  if (antes !== despues) mal(`60 px deprisa, pausa de 300 ms y soltar ha cambiado de día (${antes} → ${despues})`);
  else bien('deslizar deprisa, pararse y soltar no cambia de día (la velocidad es 0)');
}

// 12c. Un segundo dedo durante el deslizamiento no deja nada a medias
{
  await p.evaluate(async ([x0, y0]) => {
    window.__toque('touchstart', [[x0, y0, 1]]);
    for (let i = 1; i <= 6; i++) { await window.__fotograma(); window.__toque('touchmove', [[x0 - i * 16, y0, 1]]); }
    // Llega otro dedo, se mueve y se va; el primero sigue y luego se levanta
    window.__toque('touchstart', [[x0 - 96, y0, 1], [x0, y0 + 100, 2]], [[x0, y0 + 100, 2]]);
    for (let i = 1; i <= 3; i++) { await window.__fotograma(); window.__toque('touchmove', [[x0 - 96 - i * 4, y0, 1], [x0 - i * 10, y0 + 100, 2]]); }
    window.__toque('touchend', [[x0 - 108, y0, 1]], [[x0 - 30, y0 + 100, 2]]);
    await window.__fotograma();
    window.__toque('touchend', [], [[x0 - 108, y0, 1]]);
  }, centro);
  await p.waitForTimeout(700);
  const est = await p.evaluate(() => window.__panel());
  if (est.x !== 0 || est.o !== 1 || est.desl) mal(`con un segundo dedo la lista se queda a medias: ${JSON.stringify(est)}`);
  else bien('un segundo dedo durante el deslizamiento no deja la lista desplazada ni apagada');
}

// 12d. Al confirmar, el contenido sigue hacia donde iba el dedo
{
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await p.waitForTimeout(300);
  const r = await p.evaluate(async ([x0, y0]) => {
    const dia0 = window.__dia();
    window.__toque('touchstart', [[x0, y0, 1]]);
    for (let i = 1; i <= 16; i++) { await window.__fotograma(); window.__toque('touchmove', [[x0 - i * 15, y0, 1]]); }
    await window.__fotograma();
    const alSoltar = window.__panel().x;
    window.__toque('touchend', [], [[x0 - 240, y0, 1]]);
    const xs = [];
    for (let i = 0; i < 4; i++) { await window.__fotograma(); if (window.__dia() !== dia0) break; xs.push(window.__panel().x); }
    return { alSoltar, xs };
  }, centro);
  await p.waitForTimeout(600);
  const atras = r.xs.some((x, i) => x > (i ? r.xs[i - 1] : r.alSoltar) + 1);
  if (!r.xs.length) console.log('info  el día cambió antes del primer fotograma; 12d no comprobable');
  else if (atras) mal(`al confirmar el día, el contenido da media vuelta: soltado en ${r.alSoltar}px → ${r.xs.join(', ')}`);
  else bien(`al confirmar el día, sigue hacia donde iba el dedo (${r.alSoltar}px → ${r.xs.join(' → ')}px)`);
}

// ── 13. Panel de escritorio: el cartel de la lista no se va ───────────────────
// En el panel la lista sigue a la vista: del cartel crece una COPIA y el
// original se queda en su tarjeta, sin atenuar, durante el vuelo y después
// (antes se vaciaba y reaparecía al acabar: se veía irse y volver otro). Con
// el panel abierto, tocar otra película a través del velo cambia la ficha; y
// al cerrar, la copia se posa encima del original, que tampoco se esconde.
{
  const ctxP = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const q = await ctxP.newPage();
  const errores = [];
  q.on('pageerror', (e) => errores.push(String(e)));
  await q.route('**/api/ratings', (r) => r.fulfill({ json: { ratings: {} } }));
  await q.goto(URL, { waitUntil: 'networkidle' });
  await q.waitForSelector('.peli-cartel[data-cartel]');
  await q.waitForTimeout(600);
  const hayVT = await q.evaluate(() => typeof document.startViewTransition === 'function');
  // Mira el cartel de la lista en cada fotograma mientras <html data-vt> sea `modo`.
  const vigilar = (clave, modo) => q.evaluate(([c, m]) => new Promise((res) => {
    const el = document.querySelector(`[data-cartel="${CSS.escape(c)}"]`);
    const malos = new Set(); let vistos = 0; let dobles = 0;
    const t0 = performance.now();
    const mirar = () => {
      if (document.documentElement.dataset.vt === m) {
        vistos++;
        if (el.hasAttribute('data-cartel-fuera') || getComputedStyle(el).opacity !== '1') malos.add('escondido');
        if (getComputedStyle(el).viewTransitionName !== 'none' && vistos > 1) malos.add('con nombre (fuera de la foto)');
        const n = [...document.querySelectorAll('*')].filter((x) => getComputedStyle(x).viewTransitionName === 'cartel').length;
        if (n > 1) dobles = n;
      } else if (vistos || performance.now() - t0 > 600) { res({ vistos, malos: [...malos], dobles }); return; }
      requestAnimationFrame(mirar);
    };
    mirar();
  }), [clave, modo]);
  const caja = (c) => q.evaluate((c) => { const r = document.querySelector(`[data-cartel="${CSS.escape(c)}"]`).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, c);
  const hueco = () => q.evaluate(() => { const v = document.querySelector('.hoja-velo'); return v?.hasAttribute('data-hueco') ? ['x', 'y', 'w', 'h'].map((k) => parseFloat(v.style.getPropertyValue(`--hueco-${k}`))) : null; });
  const casa = (a, b2) => !!a && !!b2 && a.every((v, i) => Math.abs(v - b2[i]) < 1.5);
  const visible = (c) => q.evaluate((c) => { const el = document.querySelector(`[data-cartel="${CSS.escape(c)}"]`); return !el.hasAttribute('data-cartel-fuera') && getComputedStyle(el).opacity === '1'; }, c);

  const A = await q.evaluate(() => document.querySelector('.peli-cartel[data-cartel]').dataset.cartel);
  if (!hayVT) console.log('info  sin View Transitions: 13 solo comprueba el hueco del velo');
  const vA = hayVT ? vigilar(A, 'abrir') : null;
  await q.click(`[data-cartel="${A}"]`);
  const durA = await vA;
  await q.waitForTimeout(500);
  if (durA && !durA.vistos) mal('panel: al abrir desde el cartel no hay View Transition');
  else if (durA?.malos.length) mal(`panel: durante el vuelo el cartel de la lista está ${durA.malos.join(', ')}`);
  else if (durA?.dobles) mal(`panel: ${durA.dobles} elementos con view-transition-name "cartel" a la vez`);
  else if (durA) bien(`panel: el cartel de la lista se queda a la vista durante el vuelo (${durA.vistos} fotogramas)`);
  if (!(await visible(A))) mal('panel: con la ficha abierta, el cartel de la lista no se ve');
  else if (!casa(await hueco(), await caja(A))) mal('panel: el velo no deja sin atenuar el cartel de la abierta');
  else bien('panel: con la ficha abierta, su cartel sigue en la lista y sin atenuar (hueco del velo)');

  // Otra película a través del velo
  const B = await q.evaluate((a) => {
    const panel = document.querySelector('.hoja').getBoundingClientRect().left;
    return [...document.querySelectorAll('.peli-cartel[data-cartel]')].find((p) => {
      const r = p.getBoundingClientRect();
      return p.dataset.cartel !== a && r.top > 90 && r.bottom < innerHeight && r.left + r.width / 2 < panel;
    })?.dataset.cartel ?? null;
  }, A);
  if (!B) console.log('info  no hay otra película a la vista con el panel abierto; 13b no comprobable');
  else {
    const [x, y, w, h] = await caja(B);
    await q.mouse.move(x + w / 2, y + h / 2);
    await q.waitForTimeout(100);
    const apunta = await q.evaluate(() => document.querySelector('.hoja-velo').hasAttribute('data-apunta'));
    const vB = hayVT ? vigilar(B, 'cambiar') : null;
    await q.mouse.click(x + w / 2, y + h / 2);
    const durB = await vB;
    await q.waitForTimeout(500);
    const titulo = await q.evaluate(() => document.getElementById('ficha-titulo')?.textContent ?? '');
    const esperado = await q.evaluate((c) => document.querySelector(`[data-cartel="${CSS.escape(c)}"]`).closest('.peli').querySelector('.peli-titulo-boton').firstChild.textContent, B);
    if (!apunta) mal('panel: encima de otra película el puntero no dice que se puede tocar');
    if (titulo !== esperado) mal(`panel: tocar otra película a través del velo no cambia la ficha ("${titulo}" en vez de "${esperado}")`);
    else if (durB && (!durB.vistos || durB.malos.length || durB.dobles)) mal(`panel: el cambio de película no vuela bien (${JSON.stringify(durB)})`);
    else if (!(await visible(A)) || !(await visible(B))) mal('panel: tras cambiar de película, un cartel de la lista ha desaparecido');
    else if (!casa(await hueco(), await caja(B))) mal('panel: tras cambiar, el hueco del velo no pasa a la nueva');
    else bien(`panel: tocar otra película a través del velo cambia la ficha${durB ? ' con su vuelo' : ''} y la marca en la lista`);
  }

  const abiertaAhora = B ?? A;
  const vC = hayVT ? vigilar(abiertaAhora, 'cerrar') : null;
  await q.keyboard.press('Escape');
  const durC = await vC;
  await q.waitForTimeout(500);
  if (await q.locator('.hoja').count()) mal('panel: Escape no cierra la ficha');
  else if (durC && !durC.vistos) mal('panel: al cerrar no vuelve con View Transition');
  else if (durC?.malos.length) mal(`panel: al cerrar, el cartel de la lista está ${durC.malos.join(', ')}`);
  else if (!(await visible(abiertaAhora))) mal('panel: tras cerrar, el cartel de la lista no se ve');
  else bien('panel: al cerrar, la copia vuelve a su tarjeta y el original no se esconde en ningún momento');
  if (errores.length) mal('panel: errores JS: ' + errores[0]);
  await ctxP.close();
}

if (p.errores.length) mal('errores JS: ' + p.errores[0]);
await p.screenshot({ path: `${OUT}/gestos.png` });
await b.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\nGestos correctos');
process.exit(fallos ? 1 : 0);
