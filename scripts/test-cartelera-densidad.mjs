// Densidad y repeticiones de la cartelera (revisión de diseño del rediseño v2):
//
//  1. Primera pantalla del móvil (390 × 844): el título de la primera película
//     Y las entradas de su primer cine se ven sin bajar, con los avisos puestos.
//     El día sigue siendo el h1 con aria-live.
//  2. Lo que comparten todas las sesiones de un cine ("Sala Premium") se
//     escribe una vez junto al cine, no en cada entrada.
//  3. Las sesiones ya empezadas de hoy van en una línea discreta, no como
//     entradas de tamaño completo; siguen siendo enlaces con su frase entera.
//  4. Los cuatro interruptores de cine caben a 390 px (sin desplazarse de
//     lado) y miden al menos 44 px.
//  5. Cambiar de día estando a media lista vuelve al principio del día nuevo.
//  6. Horario: dentro de cada minuto, una fila por película (con sus cines),
//     nunca el mismo título dos veces; cada cine es su propio enlace de 44 px.
//  7. Las entradas de un mismo cine miden lo mismo (rejilla), también la
//     ámbar de "en N min" (768 px).
//  8. La duración y la edad de una película no cambian al filtrar por cine.
//  9. A 1024 px la cartelera va en dos columnas.
// 10–13. Ronda de pulido (ver más abajo): filas del Horario dentro de la
//     pantalla, controles sin montarse, horas niveladas, títulos sin partir.
//
// Requiere el servidor en el 3210 (o CARTELERA_URL) con datos de ejemplo y
// playwright instalado sin guardar (npm i --no-save playwright):
//
//   CARTELERA_SAMPLE=1 npx next dev -p 3210
//   node scripts/test-cartelera-densidad.mjs /tmp/shots

import { chromium } from 'playwright';
const OUT = process.argv[2] || '.';
const URL = process.env.CARTELERA_URL || 'http://127.0.0.1:3210/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const mal = (m) => { fallos++; console.log('FALLO ' + m); };
const bien = (m) => console.log('ok    ' + m);

// Hoy a las 18:40 en Madrid, sea cual sea el día en que se pase la prueba: a
// esa hora hay sesiones ya empezadas, otras "en N min" y otras por delante.
function hoyALas(h, m) {
  const ahora = new Date();
  const [hh, mm] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(ahora).split(':').map(Number);
  return new Date(ahora.getTime() + ((h * 60 + m) - (hh * 60 + mm)) * 60000);
}

async function pagina({ w = 390, h = 844, movil = true } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: movil, isMobile: movil, deviceScaleFactor: 1, timezoneId: 'Europe/Madrid', locale: 'es-ES' });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', (e) => p.errores.push(String(e)));
  await p.route('**/api/ratings', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ratings: {} }) }));
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.clock.setFixedTime(hoyALas(18, 40));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForSelector('.peli');
  await p.waitForTimeout(600);
  return { ctx, p };
}

// ── Móvil 390 ───────────────────────────────────────────────────────────────
{
  const { ctx, p } = await pagina();

  // 1. Primera pantalla
  const pp = await p.evaluate(() => {
    const peli = document.querySelector('.pelis .peli');
    const titulo = peli.querySelector('.peli-titulo').getBoundingClientRect();
    const entrada = peli.querySelector('.peli-cine .entrada');
    const h1 = document.querySelector('h1.selected-day');
    return {
      titulo: Math.round(titulo.bottom),
      entrada: entrada ? Math.round(entrada.getBoundingClientRect().bottom) : null,
      avisos: !!document.querySelector('.avisos'),
      h1: !!h1 && h1.getAttribute('aria-live') === 'polite',
      alto: innerHeight,
    };
  });
  if (!pp.h1) mal('el día ya no es el h1 con aria-live');
  else if (pp.entrada == null || pp.titulo > pp.alto || pp.entrada > pp.alto) mal(`primera pantalla: título hasta ${pp.titulo}px y primera entrada hasta ${pp.entrada}px en ${pp.alto}px`);
  else bien(`primera pantalla: título (${pp.titulo}px) y entradas del primer cine (${pp.entrada}px) a la vista${pp.avisos ? ', con los avisos' : ''}`);

  // 2. Lo común, una vez
  const rep = await p.evaluate(() => {
    let repetidos = 0;
    for (const g of document.querySelectorAll('.pelis .peli-cine')) {
      const t = [...g.querySelectorAll('.entrada-datos')].map((d) => d.textContent.replace(/en \d+ min|empieza ya/, '').trim());
      if (t.length >= 2 && t[0] && t.every((x) => x === t[0])) repetidos++;
    }
    return { repetidos, comunes: document.querySelectorAll('.pelis .peli-cine-comun').length };
  });
  if (rep.repetidos) mal(`${rep.repetidos} cines repiten la misma etiqueta en todas sus entradas`);
  else bien(`ningún cine repite la misma etiqueta en cada entrada (${rep.comunes} la llevan una vez junto al nombre)`);

  // 3. Empezadas en su línea
  const emp = await p.evaluate(() => ({
    grandes: document.querySelectorAll('.pelis .entrada[data-estado="pasada"]').length,
    linea: document.querySelectorAll('.pelis .empezada').length,
    frase: document.querySelector('.pelis a.empezada')?.getAttribute('aria-label') ?? '',
  }));
  if (emp.grandes) mal(`${emp.grandes} sesiones ya empezadas siguen como entradas de tamaño completo`);
  else if (!emp.linea) console.log('info  a esta hora no hay sesiones empezadas en los datos de ejemplo; 3 no comprobable');
  else if (!/ya ha empezado/.test(emp.frase)) mal(`la sesión empezada no dice que ha empezado: "${emp.frase}"`);
  else bien(`las ${emp.linea} sesiones ya empezadas van en su línea discreta, como enlaces con su frase entera`);

  // 4. Interruptores de cine
  const cines = await p.evaluate(() => {
    const fila = document.querySelector('.cines');
    return {
      cajas: [...fila.querySelectorAll('.cine-interruptor')].map((c) => { const r = c.getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height }; }),
      desborda: fila.scrollWidth > fila.clientWidth + 1,
      ancho: document.documentElement.clientWidth,
    };
  });
  const fuera = cines.cajas.filter((c) => c.l < 0 || c.r > cines.ancho);
  if (cines.desborda || fuera.length) mal(`los interruptores de cine no caben a 390 px (${fuera.length} cortados)`);
  else if (cines.cajas.some((c) => c.h < 44)) mal(`un interruptor de cine mide menos de 44 px: ${JSON.stringify(cines.cajas)}`);
  else bien('los cuatro interruptores de cine caben a 390 px y miden ≥ 44 px');

  // 5. Cambiar de día a media lista vuelve al principio del día nuevo
  await p.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }));
  await p.waitForTimeout(300);
  await p.locator('.day-chip').nth(1).tap();
  await p.waitForTimeout(800);
  const tras = await p.evaluate(() => {
    const tira = document.querySelector('.days').getBoundingClientRect().bottom;
    const cab = document.querySelector('.dia-cabeza').getBoundingClientRect().top;
    const titulo = [...document.querySelectorAll('.peli-titulo')].some((t) => { const r = t.getBoundingClientRect(); return r.top >= tira && r.bottom <= innerHeight; });
    return { tira: Math.round(tira), cab: Math.round(cab), titulo };
  });
  if (tras.cab < tras.tira || tras.cab > tras.tira + 40 || !tras.titulo) mal(`al cambiar de día a media lista: el día queda en ${tras.cab}px (tira hasta ${tras.tira}px), título a la vista: ${tras.titulo}`);
  else bien(`al cambiar de día a media lista, el día nuevo empieza justo bajo la tira (${tras.cab}px) con su primera película a la vista`);

  // 6. Horario
  await p.locator('.day-chip').nth(0).tap();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Horario', exact: true }).click();
  await p.waitForTimeout(500);
  const hor = await p.evaluate(() => {
    const huecos = [...document.querySelectorAll('.hueco')];
    const repetidos = huecos.filter((h) => { const t = [...h.querySelectorAll('.fila-titulo')].map((x) => x.textContent); return new Set(t).size < t.length; }).length;
    const filas = [...document.querySelectorAll('.fila')];
    const multi = filas.filter((f) => f.querySelectorAll('.fila-pase').length > 1).length;
    const bajos = [...document.querySelectorAll('.fila-pase')].filter((a) => a.getBoundingClientRect().height < 44).length;
    const sinFrase = [...document.querySelectorAll('.fila-pase')].filter((a) => !/,\s*\d{1,2}:\d{2}/.test(a.getAttribute('aria-label') || '')).length;
    return { huecos: huecos.length, repetidos, multi, bajos, sinFrase };
  });
  if (!hor.huecos) mal('la vista Horario no tiene huecos');
  else if (hor.repetidos) mal(`Horario: ${hor.repetidos} minutos repiten el mismo título`);
  else if (hor.bajos) mal(`Horario: ${hor.bajos} enlaces de cine miden menos de 44 px`);
  else if (hor.sinFrase) mal(`Horario: ${hor.sinFrase} enlaces sin su frase (título y hora)`);
  else bien(`Horario: ningún minuto repite título (${hor.multi} filas juntan varios cines), cada cine su enlace de 44 px`);

  if (p.errores.length) mal('errores JS: ' + p.errores[0]);
  await p.screenshot({ path: `${OUT}/densidad-horario.png` });
  await ctx.close();
}

// ── 768: entradas del mismo ancho ───────────────────────────────────────────
{
  const { ctx, p } = await pagina({ w: 768, h: 1024 });
  const r = await p.evaluate(() => [...document.querySelectorAll('.pelis .entradas')].map((ul) =>
    [...ul.querySelectorAll('.entrada')].map((e) => Math.round(e.getBoundingClientRect().width))));
  const desiguales = r.filter((w) => new Set(w).size > 1);
  if (desiguales.length) mal(`a 768 px hay cines con entradas de anchos distintos: ${JSON.stringify(desiguales.slice(0, 3))}`);
  else bien(`a 768 px todas las entradas de cada cine miden lo mismo (${[...new Set(r.flat())].join(', ')} px)`);

  // 8. Metadatos estables con el filtro de cine
  const datos = () => Object.fromEntries([...document.querySelectorAll('.peli')].map((x) => [
    x.querySelector('.peli-titulo').textContent,
    [...x.querySelectorAll('.peli-datos > span')].slice(0, 2).map((s) => s.textContent).join(' '),
  ]));
  const todos = await p.evaluate(datos);
  const cambios = [];
  const n = await p.locator('.cine-interruptor').count();
  for (let i = 0; i < n; i++) {
    await p.locator('.cine-interruptor').nth(i).click();
    await p.waitForTimeout(250);
    for (const [t, d] of Object.entries(await p.evaluate(datos))) if (todos[t] != null && todos[t] !== d) cambios.push(`${t}: "${todos[t]}" → "${d}"`);
    await p.locator('.cine-interruptor').nth(i).click();
    await p.waitForTimeout(150);
  }
  if (cambios.length) mal(`la duración o la edad cambian al filtrar por cine: ${cambios.slice(0, 2).join('; ')}`);
  else bien('la duración y la edad de cada película no cambian al filtrar por cine');
  await ctx.close();
}

// ── 1024: dos columnas ──────────────────────────────────────────────────────
{
  const { ctx, p } = await pagina({ w: 1024, h: 768, movil: false });
  const col = await p.evaluate(() => new Set([...document.querySelectorAll('.pelis > li')].slice(0, 4).map((l) => Math.round(l.getBoundingClientRect().left))).size);
  if (col < 2) mal('a 1024 px la cartelera sigue en una sola columna');
  else bien('a 1024 px la cartelera va en dos columnas');
  await ctx.close();
}

// ── Ronda de pulido: lo que se mide para que no vuelva ──────────────────────
// 10. Horario a 320 px: ninguna fila más ancha que la pantalla.
// 11. Controles a 320 y 360 px, también con el género más largo elegido: la
//     vista, el género y la lupa no se montan unos sobre otros.
// 12. Las horas de una misma fila de entradas, a la misma altura.
// 13. La ficha a 320, 900 y 1024 px: ningún título parte una palabra, y los
//     h4 de sus cines no traen margen del navegador.

// Saltos de línea entre dos letras (o cifras) seguidas: palabra partida.
const cortesDePalabra = (sel) => {
  const el = document.querySelector(sel);
  const nodo = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.trim());
  if (!nodo) return [];
  const t = nodo.data; const r = document.createRange(); const cortes = [];
  let top = null;
  for (let i = 0; i < t.length; i++) {
    r.setStart(nodo, i); r.setEnd(nodo, i + 1);
    const c = r.getClientRects()[0]; if (!c) continue;
    if (top != null && c.top > top + 2 && /[\p{L}\p{N}]/u.test(t[i - 1] ?? '') && /[\p{L}\p{N}]/u.test(t[i])) cortes.push(`${t.slice(0, i)}|${t.slice(i)}`);
    top = c.top;
  }
  return cortes;
};

for (const w of [320, 360]) {
  const { ctx, p } = await pagina({ w, h: 740 });
  const solape = () => p.evaluate(() => {
    const v = document.querySelector('.control-vista').getBoundingClientRect();
    const g = document.querySelector('.control-pastilla').getBoundingClientRect();
    const l = document.querySelector('.busqueda').getBoundingClientRect();
    return Math.max(v.right - g.left, g.right - l.left, 0);
  });
  const sin = await solape();
  await p.locator('.control-pastilla').click();
  await p.waitForTimeout(300);
  const nombres = await p.locator('.genero-opcion .genero-nombre').allInnerTexts();
  const largo = nombres.slice(1).sort((a, b2) => b2.length - a.length)[0];
  if (largo) { await p.locator('.genero-opcion', { hasText: largo }).first().click(); await p.waitForTimeout(300); }
  const con = await solape();
  if (sin > 0.5 || con > 0.5) mal(`controles a ${w} px: se montan ${sin.toFixed(1)} px (sin género) y ${con.toFixed(1)} px (con «${largo}»)`);
  else bien(`controles a ${w} px: vista, género y lupa no se montan, tampoco con «${largo}»`);

  if (w === 320) {
    await p.locator('.control-pastilla').click(); await p.waitForTimeout(250);
    await p.locator('.genero-opcion').first().click(); await p.waitForTimeout(250);
    await p.getByRole('button', { name: 'Horario', exact: true }).click();
    await p.waitForTimeout(500);
    const anchas = await p.evaluate(() => {
      const ancho = document.documentElement.clientWidth;
      return [...document.querySelectorAll('.fila')].filter((f) => f.getBoundingClientRect().right > ancho + 0.5).length;
    });
    if (anchas) mal(`Horario a 320 px: ${anchas} filas más anchas que la pantalla`);
    else bien('Horario a 320 px: ninguna fila se sale de la pantalla');
  }
  await ctx.close();
}

{
  const { ctx, p } = await pagina({ w: 390, h: 844 });
  const desnivel = await p.evaluate(() => {
    let peor = 0;
    for (const ul of document.querySelectorAll('.pelis .entradas')) {
      const filas = new Map();
      for (const e of ul.querySelectorAll('.entrada')) {
        const top = Math.round(e.getBoundingClientRect().top);
        const hora = e.querySelector('.entrada-hora').getBoundingClientRect().top;
        filas.set(top, [...(filas.get(top) ?? []), hora]);
      }
      for (const h of filas.values()) peor = Math.max(peor, Math.max(...h) - Math.min(...h));
    }
    return peor;
  });
  if (desnivel > 0.5) mal(`las horas de una fila de entradas no están a la misma altura (hasta ${desnivel.toFixed(1)} px)`);
  else bien('las horas de cada fila de entradas, a la misma altura');
  await ctx.close();
}

for (const [w, h, movil] of [[320, 568, true], [900, 1000, false], [1024, 768, false]]) {
  const { ctx, p } = await pagina({ w, h, movil });
  // Los títulos más largos del día (son los que pueden partirse)
  const titulos = (await p.locator('.pelis .peli-titulo-boton').evaluateAll((bs) => bs.map((x) => x.firstChild.data)))
    .sort((a, b2) => Math.max(...b2.split(' ').map((x) => x.length)) - Math.max(...a.split(' ').map((x) => x.length))).slice(0, 6);
  const cortes = []; let margenH4 = null;
  for (const t of titulos) {
    await p.locator('.pelis .peli-titulo-boton').filter({ hasText: t }).first().click();
    await p.waitForSelector('.hoja[data-variante="ficha"]');
    await p.waitForTimeout(700);
    cortes.push(...(await p.evaluate(cortesDePalabra, '.ficha-titulo')));
    margenH4 ??= await p.evaluate(() => { const h4 = document.querySelector('.hoja h4'); return h4 ? getComputedStyle(h4).marginTop : null; });
    await p.keyboard.press('Escape');
    await p.waitForSelector('.hoja', { state: 'detached' });
    await p.waitForTimeout(300);
  }
  if (cortes.length) mal(`ficha a ${w} px: títulos con palabras partidas: ${cortes.join(' · ')}`);
  else bien(`ficha a ${w} px: ningún título parte una palabra (${titulos.length} títulos largos)`);
  if (margenH4 != null && margenH4 !== '0px') mal(`ficha a ${w} px: los h4 de los cines traen margen (${margenH4})`);
  else if (w === 320) bien('ficha: los h4 de los cines sin margen del navegador');
  await ctx.close();
}

await b.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\nDensidad correcta');
process.exit(fallos ? 1 : 0);
