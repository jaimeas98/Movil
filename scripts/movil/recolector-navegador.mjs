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
// LO NUEVO NO BORRA LO QUE YA HABÍA
// Cada recogida se FUSIONA con la anterior en vez de sustituirla: un día que
// viene en la nueva manda (los horarios pueden cambiar), pero un día que ya
// no aparece —porque la recogida ha venido corta por lo que sea— se conserva
// de la anterior, y un cine que no aparece, también. Mejor ver la cartelera
// de ayer de un día que perder el día. Lo conservado caduca a los 7 días y
// los días ya pasados se van solos.
//
//   DESTINO=~/Movil/data/yelmo.js CHROME=$(command -v chromium-browser) node recolector.mjs
//   … --solo-probar      no escribe nada, solo dice si funciona
//
// Necesita puppeteer-core instalado junto a él (lo prepara instalar.sh en
// ~/navegador, que es desde donde lo ejecuta tarea.sh).

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SOLO_PROBAR = process.argv.includes('--solo-probar');
const DESTINO = process.env.DESTINO;
// Claves de recinto de Yelmo → id del cine en la web
const CINES = { 'yelmo-bahia-sur': 'premium-bahia-sur', 'yelmo-jerez': 'area-sur' };

// El informe es público: cualquier IP que apareciera se tapa.
const log = (...a) => console.log(a.join(' ').replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[IP omitida]'));

// ── Fusión con la recogida anterior ───────────────────────────────────────
const CONSERVAR_MS = 7 * 24 * 3600 * 1000;

const hoyMadrid = (ms) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(ms));

// El día de un bloque de Yelmo, con la misma regla que lib/cinemas/yelmo.js:
// sale del TimeFilter de su primera sesión. Si no se puede saber, null: ese
// día no se conserva, porque no habría forma de saber si está repetido.
export function diaDe(bloque) {
  const tf = bloque?.Movies?.[0]?.Formats?.[0]?.Showtimes?.[0]?.TimeFilter ?? '';
  const dm = tf.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
  const ms = Number((tf.match(/\/Date\((\d+)\)\//) || [])[1]);
  if (ms > 0) return new Date(ms - 6 * 3600 * 1000).toISOString().slice(0, 10);
  return null;
}

// Devuelve { cines, conservados } donde conservados cuenta, por cine, cuántos
// días vienen de la recogida anterior porque esta no los traía.
export function fusionar(previa, nueva, ahora = Date.now()) {
  const hoy = hoyMadrid(ahora);
  const marca = new Date(ahora).toISOString();
  const cines = {};
  const conservados = {};
  const ids = new Set([...Object.keys(previa?.cines ?? {}), ...Object.keys(nueva.cines)]);

  for (const id of ids) {
    const antes = previa?.cines?.[id];
    const ahoraCine = nueva.cines[id];
    // Cada día lleva la fecha en que se recogió, para poder caducarlo.
    const nuevos = (ahoraCine?.Dates ?? []).map((d) => ({ ...d, _recogido: marca }));
    const yaEstan = new Set(nuevos.map(diaDe).filter(Boolean));
    // Lo conservado guarda SU fecha de recogida, no la de hoy: si no, cada
    // fusión lo "rejuvenecería" y no caducaría nunca.
    const viejos = (antes?.Dates ?? [])
      .map((d) => ({ ...d, _recogido: d._recogido ?? previa?.generatedAt }))
      .filter((d) => {
        const dia = diaDe(d);
        const recogido = Date.parse(d._recogido ?? '') || 0;
        return dia && dia >= hoy && !yaEstan.has(dia) && ahora - recogido <= CONSERVAR_MS;
      });
    const dias = [...nuevos, ...viejos].sort((a, b) => (diaDe(a) ?? '').localeCompare(diaDe(b) ?? ''));
    if (!dias.length) continue;
    cines[id] = { ...(antes ?? {}), ...(ahoraCine ?? {}), Dates: dias };
    if (viejos.length) conservados[id] = viejos.length;
  }
  return { cines, conservados };
}

// ── Recogida ──────────────────────────────────────────────────────────────
async function recoger() {
  const { default: puppeteer } = await import('puppeteer-core');
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

async function principal() {
  const recogida = await recoger();
  for (const [id, c] of Object.entries(recogida.cines)) {
    const pelis = (c.Dates ?? []).reduce((n, d) => n + (d.Movies?.length ?? 0), 0);
    log(`✅ ${id}: ${c.Dates?.length ?? 0} días, ${pelis} películas`);
  }

  if (SOLO_PROBAR) {
    log('VEREDICTO: FUNCIONA (no se ha escrito nada)');
    return;
  }
  if (!DESTINO) throw new Error('Falta DESTINO: dónde escribir data/yelmo.js');

  let previa = null;
  try {
    const t = readFileSync(DESTINO, 'utf8');
    previa = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch { /* no había instantánea previa (o era el marcador vacío) */ }

  const { cines, conservados } = fusionar(previa, recogida);
  for (const [id, n] of Object.entries(conservados)) {
    log(`🛟 ${id}: ${n} día(s) que esta recogida no traía se conservan de la anterior`);
  }
  for (const id of Object.keys(cines)) {
    if (!recogida.cines[id]) log(`🛟 ${id}: no ha venido; se conserva el de la recogida anterior`);
  }

  writeFileSync(
    DESTINO,
    '// Instantánea de la cartelera de Yelmo, recogida con un navegador desde el móvil.\n' +
    '// La genera scripts/movil/recolector-navegador.mjs — NO se edita a mano.\n' +
    'export default ' + JSON.stringify({ ...recogida, cines }, null, 2) + ';\n'
  );
  log(`guardado en ${DESTINO}`);
}

// Solo se recoge al ejecutarlo; importarlo (las pruebas) no abre nada.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await principal();
  } catch (e) {
    log(`❌ ${e.message}`);
    process.exit(1);
  }
}
