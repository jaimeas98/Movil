// Prueba: ¿puede un NAVEGADOR DE VERDAD, dentro del móvil, leer la cartelera
// de Yelmo?
//
// Contexto (13-10-2026): Yelmo bloquea con Cloudflare a los programas
// automáticos —curl y Node reciben 403 incluso desde la conexión de casa—,
// pero el navegador del mismo móvil, en la misma red, entra sin problema.
//
// Primer intento (13-10-2026), con Chromium tal cual: 403 en la portada. Sin
// pantalla, Chromium se anuncia como "HeadlessChrome" en su identificación y
// en las cabeceras Sec-CH-UA, y Yelmo lo rechaza por eso.
//
// Decisión del usuario, tras plantearle el reparo: es un proyecto personal,
// datos públicos, desde su propio móvil y conexión, a ritmo de persona. Así
// que Chromium se identifica ahora como el Chrome normal de ese mismo móvil.
// Abre la portada y, desde dentro de la página, pide la cartelera al mismo
// endpoint que usa su web: los datos llegan con la forma de siempre.
//
//   CHROME=$(command -v chromium-browser) node scripts/movil/navegador-prueba.mjs

import puppeteer from 'puppeteer-core';

// El informe es público: cualquier IP que apareciera se tapa.
const limpio = (s) => String(s).replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[IP omitida]');
const log = (...a) => console.log(limpio(a.join(' ')));

const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME,
  headless: true,
  // Opciones que Chromium necesita para arrancar dentro de Termux, sin las que
  // ni siquiera abre. Ninguna cambia cómo se identifica ante la web.
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  const pagina = await navegador.newPage();
  log('navegador:', await navegador.version());

  // La misma identidad que el Chrome del propio móvil: misma versión, mismo
  // modelo, misma plataforma. Incluye las "client hints" (Sec-CH-UA), que es
  // donde Chromium sin pantalla mete la marca HeadlessChrome.
  const version = (await navegador.version()).match(/\/(\d+)/)?.[1] ?? '155';
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
  // Un Chrome manejado por un programa lo declara en navigator.webdriver.
  await pagina.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const r = await pagina.goto('https://www.yelmocines.es/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('portada:', r?.status(), '·', await pagina.title());

  // Si Cloudflare presenta una comprobación de JavaScript, un navegador real
  // la resuelve solo; se le dan unos segundos.
  await new Promise((ok) => setTimeout(ok, 10000));
  log('tras esperar:', await pagina.title());

  // La petición NO se ejecuta en el JavaScript de la página: Yelmo carga
  // MicrosoftAjax, que reescribe funciones nativas como String.prototype
  // .startsWith con versiones que solo aceptan un parámetro y lanzan
  // "Sys.ParameterCountException" con dos. Un mundo aislado comparte el
  // origen, la sesión y las cookies de la página, pero tiene sus propias
  // funciones nativas intactas, y no toca nada de la web.
  const cdp = await pagina.createCDPSession();
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const { executionContextId } = await cdp.send('Page.createIsolatedWorld', {
    frameId: frameTree.frame.id,
    worldName: 'recolector',
  });
  const peticion = `(async () => {
    const res = await fetch('/now-playing.aspx/GetNowPlaying', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ cityKey: 'cadiz' }),
    });
    return { status: res.status, texto: await res.text() };
  })()`;
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression: peticion,
    contextId: executionContextId,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);

  const { status, texto } = result.value;
  let resumen = null;
  try {
    const d = JSON.parse(texto);
    resumen = (d?.d?.Cinemas ?? []).map((c) => ({
      cine: c.Key,
      dias: c.Dates?.length ?? 0,
      peliculas: (c.Dates ?? []).reduce((n, x) => n + (x.Movies?.length ?? 0), 0),
    }));
  } catch {}
  const api = { status, bytes: texto.length, resumen, inicio: resumen ? null : texto.slice(0, 160) };
  log('API de cartelera:', JSON.stringify(api));
  log(api.resumen?.length ? 'VEREDICTO: FUNCIONA' : 'VEREDICTO: BLOQUEADO');
} catch (e) {
  log('ERROR:', e.message);
} finally {
  await navegador.close();
}
