// Recolector de Yelmo con un navegador de verdad, para el móvil.
//
// POR QUÉ ASÍ (13-10-2026)
// Yelmo bloquea con Cloudflare a los programas automáticos: curl y Node
// reciben 403 incluso desde la conexión de casa, y Chromium sin pantalla
// también, porque se anuncia como "HeadlessChrome". El navegador del mismo
// móvil, manejado a mano, entra sin problema.
//
// Se le planteó al usuario que esto es esquivar una regla antibots y decidió
// seguir: proyecto personal, datos públicos que se ven en cualquier navegador,
// desde su propio móvil y su conexión, a ritmo de persona —un par de veces al
// día—. Así que Chromium usa la identidad del Chrome de ese mismo móvil.
//
// QUÉ HACE
// Abre la portada como lo haría cualquiera y, desde un mundo aislado de la
// página, pide la cartelera al mismo endpoint que usa su web. Guarda los dos
// cines tal cual vienen, en el mismo formato que leía siempre el adaptador:
// para la web no cambia nada.
//
//   DESTINO=~/Movil/data/yelmo.js CHROME=$(command -v chromium-browser) node recolector.mjs
//   … --solo-probar      no escribe nada, solo dice si funciona
//
// Necesita puppeteer-core instalado junto a él (lo prepara instalar.sh en
// ~/navegador, que es desde donde lo ejecuta tarea.sh).

import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const SOLO_PROBAR = process.argv.includes('--solo-probar');
const DESTINO = process.env.DESTINO;
// Claves de recinto de Yelmo → id del cine en la web
const CINES = { 'yelmo-bahia-sur': 'premium-bahia-sur', 'yelmo-jerez': 'area-sur' };

// El informe es público: cualquier IP que apareciera se tapa.
const log = (...a) => console.log(a.join(' ').replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[IP omitida]'));

async function recoger() {
  const navegador = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: true,
    // Necesarias para que Chromium arranque dentro de Termux.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const pagina = await navegador.newPage();
    const version = (await navegador.version()).match(/\/(\d+)/)?.[1] ?? '155';

    // La identidad del Chrome del propio móvil, incluidas las client hints
    // (Sec-CH-UA), que es donde Chromium sin pantalla mete "HeadlessChrome".
    await pagina.setUserAgent(
      `Mozilla/5.0 (Linux; Android 12; Mi Note 10 Lite) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Mobile Safari/537.36`,
      {
        brands: [
          { brand: 'Chromium', version },
          { brand: 'Google Chrome', version },
          { brand: 'Not.A/Brand', version: '99' },
        ],
        fullVersion: `${version}.0.0.0`,
        platform: 'Android',
        platformVersion: '12.0.0',
        architecture: '',
        model: 'Mi Note 10 Lite',
        mobile: true,
      }
    );
    await pagina.setViewport({ width: 393, height: 851, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
    await pagina.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9' });
    await pagina.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const portada = await pagina.goto('https://www.yelmocines.es/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const estadoPortada = portada?.status();
    log(`portada: ${estadoPortada} · ${await pagina.title()}`);
    if (estadoPortada === 403) {
      throw new Error('Cloudflare ha bloqueado la portada (403): ha cambiado algo en su detección.');
    }
    // Margen para scripts y cookies de la portada, como una persona que entra.
    await new Promise((ok) => setTimeout(ok, 5000));

    // La petición va en un MUNDO AISLADO y no en el JavaScript de la página:
    // Yelmo carga MicrosoftAjax, que reescribe funciones nativas (por ejemplo
    // String.prototype.startsWith) y rompe cualquier código inyectado con
    // "Sys.ParameterCountException". El mundo aislado comparte origen, sesión
    // y cookies, pero tiene sus propias funciones intactas.
    const cdp = await pagina.createCDPSession();
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const { executionContextId } = await cdp.send('Page.createIsolatedWorld', {
      frameId: frameTree.frame.id,
      worldName: 'recolector',
    });
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        const res = await fetch('/now-playing.aspx/GetNowPlaying', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ cityKey: 'cadiz' }),
        });
        return { status: res.status, texto: await res.text() };
      })()`,
      contextId: executionContextId,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);

    const { status, texto } = result.value;
    if (status === 403) throw new Error('Cloudflare ha bloqueado el API de cartelera (403).');
    if (status !== 200) throw new Error(`El API de cartelera ha respondido ${status}.`);

    let datos;
    try { datos = JSON.parse(texto); }
    catch { throw new Error(`El API no ha devuelto JSON: ${texto.slice(0, 120)}`); }

    const todos = datos?.d?.Cinemas ?? [];
    const cines = {};
    for (const [id, clave] of Object.entries(CINES)) {
      const c = todos.find((x) => x.Key === clave) || todos.find((x) => x.Key?.includes(clave.replace(/^premium-/, '')));
      if (c) cines[id] = c;
      else log(`⚠️  no aparece '${clave}' (hay: ${todos.map((x) => x.Key).join(', ')})`);
    }
    if (!Object.keys(cines).length) throw new Error('No ha venido ninguno de nuestros dos cines.');
    return { generatedAt: new Date().toISOString(), origen: 'navegador-movil', cines };
  } finally {
    await navegador.close();
  }
}

try {
  const instantanea = await recoger();
  for (const [id, c] of Object.entries(instantanea.cines)) {
    const pelis = (c.Dates ?? []).reduce((n, d) => n + (d.Movies?.length ?? 0), 0);
    log(`✅ ${id}: ${c.Dates?.length ?? 0} días, ${pelis} películas`);
  }

  if (SOLO_PROBAR) {
    log('VEREDICTO: FUNCIONA (no se ha escrito nada)');
  } else {
    if (!DESTINO) throw new Error('Falta DESTINO: dónde escribir data/yelmo.js');
    // No pisar una instantánea buena con una peor: si hoy viniera un cine de
    // menos, mejor conservar la anterior que dejar la web sin él.
    try {
      const t = readFileSync(DESTINO, 'utf8');
      const previa = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
      const antes = Object.keys(previa.cines ?? {}).length;
      const ahora = Object.keys(instantanea.cines).length;
      if (antes > ahora) {
        log(`⚠️  la anterior tenía ${antes} cines y ésta ${ahora}: se conserva la anterior`);
        process.exit(1);
      }
    } catch { /* no había instantánea previa */ }

    writeFileSync(
      DESTINO,
      '// Instantánea de la cartelera de Yelmo, recogida con un navegador desde el móvil.\n' +
      '// La genera scripts/movil/recolector-navegador.mjs — NO se edita a mano.\n' +
      'export default ' + JSON.stringify(instantanea, null, 2) + ';\n'
    );
    log(`guardado en ${DESTINO}`);
  }
} catch (e) {
  log(`❌ ${e.message}`);
  process.exit(1);
}
