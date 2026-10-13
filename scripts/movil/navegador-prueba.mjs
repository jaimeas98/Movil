// Prueba: ¿puede un NAVEGADOR DE VERDAD, dentro del móvil, leer la cartelera
// de Yelmo?
//
// Contexto (13-10-2026): Yelmo bloquea con Cloudflare a los programas
// automáticos —curl y Node reciben 403 incluso desde la conexión de casa—,
// pero el navegador del mismo móvil, en la misma red, entra sin problema.
//
// Esto arranca Chromium tal cual, sin tocar su identificación ni ocultar nada,
// abre la portada de Yelmo como lo haría cualquiera y, desde dentro de la
// propia página, pide la cartelera al mismo endpoint que usa su web. Si
// funciona, los datos llegan exactamente con la forma de siempre.
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

  const r = await pagina.goto('https://www.yelmocines.es/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('portada:', r?.status(), '·', await pagina.title());

  // Si Cloudflare presenta una comprobación de JavaScript, un navegador real
  // la resuelve solo; se le dan unos segundos.
  await new Promise((ok) => setTimeout(ok, 10000));
  log('tras esperar:', await pagina.title());

  const api = await pagina.evaluate(async () => {
    const res = await fetch('/now-playing.aspx/GetNowPlaying', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ cityKey: 'cadiz' }),
    });
    const texto = await res.text();
    let resumen = null;
    try {
      const d = JSON.parse(texto);
      resumen = (d?.d?.Cinemas ?? []).map((c) => ({
        cine: c.Key,
        dias: c.Dates?.length ?? 0,
        peliculas: (c.Dates ?? []).reduce((n, x) => n + (x.Movies?.length ?? 0), 0),
      }));
    } catch {}
    return { status: res.status, bytes: texto.length, resumen, inicio: resumen ? null : texto.slice(0, 160) };
  });
  log('API de cartelera:', JSON.stringify(api));
  log(api.resumen?.length ? 'VEREDICTO: FUNCIONA' : 'VEREDICTO: BLOQUEADO');
} catch (e) {
  log('ERROR:', e.message);
} finally {
  await navegador.close();
}
