// Exploración de la web nueva de Yelmo (23-10-2026: ahora es "Cinépolis").
//
// POR QUÉ
// El 23-10-2026 la portada pasó a titularse "Cinépolis | Entra" y el endpoint
// de siempre (/now-playing.aspx/GetNowPlaying) devuelve una página HTML en vez
// de JSON. Desde la nube no se llega a su web (Cloudflare y el proxy), así que
// este script se ejecuta UNA vez en el móvil (vía data/orden.sh) para ver de
// dónde saca ahora la web sus datos: qué peticiones hace, cuáles devuelven
// JSON y con qué forma. Con eso se reescribe el recolector.
//
// No publica nada personal: solo URLs y respuestas de la web de Yelmo.
//   CHROME=... DESTINO=~/estado-movil/exploracion-yelmo.json node explorar-yelmo.mjs

import { writeFileSync } from 'node:fs';
import { identidad } from './recolector.mjs';

const { modelo, android, androidCompleta } = identidad();
const { default: puppeteer } = await import('puppeteer-core');
const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const informe = { cuando: new Date().toISOString(), paginas: [] };
const corto = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

async function explorar(pagina, url, etiqueta) {
  const peticiones = [];
  const alResponder = async (res) => {
    try {
      const req = res.request();
      const tipo = req.resourceType();
      if (!['xhr', 'fetch', 'document', 'other', 'eventsource'].includes(tipo)) return;
      const ct = res.headers()['content-type'] ?? '';
      const p = { tipo, metodo: req.method(), estado: res.status(), url: corto(res.url(), 300), ct: corto(ct, 60) };
      if (req.method() !== 'GET' && req.postData()) p.cuerpoPedido = corto(req.postData(), 400);
      if (/json|text\/x-component|javascript/.test(ct) || /\/api\/|graphql|_next\/data|\?_rsc=/.test(res.url())) {
        const t = await res.text().catch(() => '');
        p.tamano = t.length;
        p.inicio = corto(t, 600);
      }
      peticiones.push(p);
    } catch { /* respuestas que ya no se pueden leer */ }
  };
  pagina.on('response', alResponder);
  let estado = null;
  try {
    const r = await pagina.goto(url, { waitUntil: 'networkidle2', timeout: 70000 });
    estado = r?.status() ?? null;
  } catch (e) { estado = `error: ${e.message.slice(0, 120)}`; }
  await new Promise((ok) => setTimeout(ok, 4000));
  // Desplazar un poco por si la cartelera se carga al bajar.
  await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)).catch(() => {});
  await new Promise((ok) => setTimeout(ok, 3000));
  pagina.off('response', alResponder);

  const dentro = await pagina.evaluate(() => {
    const enlaces = [...document.querySelectorAll('a[href]')].map((a) => a.href)
      .filter((h) => /cine|cartelera|cadiz|bahia|jerez|area-sur|pelicula|sesion|compra/i.test(h));
    const scripts = [...document.querySelectorAll('script')];
    const nextData = document.getElementById('__NEXT_DATA__')?.textContent ?? '';
    const flight = scripts.filter((s) => s.textContent.includes('self.__next_f')).map((s) => s.textContent).join('\n');
    const ld = scripts.filter((s) => s.type === 'application/ld+json').map((s) => s.textContent);
    return {
      urlFinal: location.href,
      titulo: document.title,
      enlaces: [...new Set(enlaces)].slice(0, 60),
      nextData: nextData ? nextData.slice(0, 1500) : null,
      flightTamano: flight.length,
      flightMuestra: flight ? flight.slice(0, 1500) : null,
      ldJson: ld.map((x) => x.slice(0, 600)).slice(0, 5),
      textoVisible: document.body.innerText.slice(0, 1200),
    };
  }).catch((e) => ({ error: e.message }));
  informe.paginas.push({ etiqueta, url, estado, ...dentro, peticiones: peticiones.slice(0, 120) });
  console.log(`${etiqueta}: ${estado} · ${dentro.titulo ?? ''} · ${dentro.urlFinal ?? ''} · ${peticiones.length} peticiones`);
  return dentro;
}

try {
  const pagina = await navegador.newPage();
  const version = (await navegador.version()).match(/\/(\d+)/)?.[1] ?? '155';
  await pagina.setUserAgent(
    `Mozilla/5.0 (Linux; Android ${android}; ${modelo}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Mobile Safari/537.36`,
    {
      brands: [{ brand: 'Chromium', version }, { brand: 'Google Chrome', version }, { brand: 'Not.A/Brand', version: '99' }],
      fullVersion: `${version}.0.0.0`, platform: 'Android', platformVersion: androidCompleta, architecture: '', model: modelo, mobile: true,
    }
  );
  await pagina.setViewport({ width: 393, height: 851, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  await pagina.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9' });
  await pagina.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  const portada = await explorar(pagina, 'https://www.yelmocines.es/', 'portada');
  // La página de un cine: la que enlace la portada para Bahía Sur, o las de siempre.
  const candidatos = [
    ...(portada.enlaces ?? []).filter((h) => /bahia-sur|bahía-sur/i.test(h)),
    'https://www.yelmocines.es/cartelera/cadiz/premium-bahia-sur',
  ];
  await explorar(pagina, candidatos[0], 'cine-bahia-sur');
  const jerez = (portada.enlaces ?? []).find((h) => /area-sur|jerez/i.test(h)) ?? 'https://www.yelmocines.es/cartelera/cadiz/jerez';
  await explorar(pagina, jerez, 'cine-area-sur');
} catch (e) {
  console.log(`❌ ${e.message}`);
  informe.error = e.message;
} finally {
  await navegador.close();
  const texto = JSON.stringify(informe, null, 1);
  writeFileSync(process.env.DESTINO, texto.length > 400000 ? texto.slice(0, 400000) : texto);
  console.log(`guardado: ${process.env.DESTINO} (${texto.length} bytes)`);
}
