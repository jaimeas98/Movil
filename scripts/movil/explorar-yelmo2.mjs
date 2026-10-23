// Segunda exploración de la web nueva de Yelmo (cineyelmo.com, 23-10-2026).
//
// La primera (explorar-yelmo.mjs) vio que la web es una app estática que pide
// todo a una API GraphQL (api-g.cinepolis.com) y que las páginas viejas de cada
// cine redirigen a la portada. Los HORARIOS solo se piden al elegir cine, así
// que aquí se recorre la web como una persona (Elige tu cine → Cádiz → Bahía
// Sur → Horarios) y se prueban rutas probables, guardando cada operación
// GraphQL entera (consulta, variables y respuesta). Además se prueba si la API
// responde a una petición normal, sin navegador: si responde, la web podría
// pedírsela directamente sin depender del móvil.

import { writeFileSync } from 'node:fs';
import { identidad } from './recolector.mjs';

const { modelo, android, androidCompleta } = identidad();
const { default: puppeteer } = await import('puppeteer-core');
const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const informe = { cuando: new Date().toISOString(), pasos: [], operaciones: [], apiSinNavegador: null };
const corto = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s);
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const vistas = new Set();

function escuchar(pagina) {
  pagina.on('response', async (res) => {
    try {
      const req = res.request();
      if (!/graphql/.test(res.url()) || req.method() !== 'POST') return;
      const cuerpo = req.postData() ?? '';
      let op = {}; try { op = JSON.parse(cuerpo); } catch {}
      const nombre = op.operationName ?? '?';
      const clave = nombre + JSON.stringify(op.variables ?? {});
      if (vistas.has(clave)) return; vistas.add(clave);
      if (/Footer|NavBar|Banner|Alarm|Log|SharedConfig|countrySettings/i.test(nombre)) return;
      const texto = await res.text().catch(() => '');
      const grande = /show|sesion|session|schedule|horario|billboard|cinema/i.test(nombre + (op.query ?? ''));
      informe.operaciones.push({
        url: res.url(), estado: res.status(), nombre, variables: op.variables,
        consulta: corto(op.query ?? '', 6000), tamano: texto.length,
        respuesta: corto(texto, grande ? 60000 : 6000),
      });
    } catch {}
  });
}

async function paso(etiqueta, fn, pagina) {
  let ok = true, error = null;
  try { await fn(); } catch (e) { ok = false; error = e.message.slice(0, 160); }
  await espera(3500);
  const url = pagina.url(), titulo = await pagina.title().catch(() => '');
  const texto = await pagina.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => '');
  informe.pasos.push({ etiqueta, ok, error, url, titulo, texto });
  console.log(`${etiqueta}: ${ok ? 'ok' : 'FALLO ' + error} · ${url}`);
}

// Pulsa el primer elemento visible cuyo texto encaje.
async function pulsar(pagina, patron) {
  const hecho = await pagina.evaluate((p) => {
    const re = new RegExp(p, 'i');
    const els = [...document.querySelectorAll('a,button,[role=button],li,div,span,p')]
      .filter((e) => re.test((e.innerText || '').trim()) && (e.innerText || '').trim().length < 60 && e.offsetParent !== null);
    els.sort((a, b) => (a.innerText.length - b.innerText.length));
    if (!els[0]) return false;
    els[0].scrollIntoView({ block: 'center' }); els[0].click(); return els[0].innerText.trim();
  }, patron);
  if (!hecho) throw new Error(`no encuentro /${patron}/`);
  return hecho;
}

try {
  const pagina = await navegador.newPage();
  const version = (await navegador.version()).match(/\/(\d+)/)?.[1] ?? '155';
  await pagina.setUserAgent(
    `Mozilla/5.0 (Linux; Android ${android}; ${modelo}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Mobile Safari/537.36`,
    { brands: [{ brand: 'Chromium', version }, { brand: 'Google Chrome', version }, { brand: 'Not.A/Brand', version: '99' }],
      fullVersion: `${version}.0.0.0`, platform: 'Android', platformVersion: androidCompleta, architecture: '', model: modelo, mobile: true });
  await pagina.setViewport({ width: 393, height: 851, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  await pagina.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9' });
  await pagina.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
  escuchar(pagina);

  await paso('portada', () => pagina.goto('https://cineyelmo.com/es', { waitUntil: 'networkidle2', timeout: 60000 }), pagina);
  await paso('cookies', () => pulsar(pagina, '^Denegar$'), pagina);
  await paso('elige-cine', () => pulsar(pagina, 'Elige tu cine'), pagina);
  await paso('cadiz', () => pulsar(pagina, '^C[áa]diz$'), pagina);
  await paso('bahia-sur', () => pulsar(pagina, 'Bah[íi]a Sur'), pagina);
  await paso('horarios', () => pulsar(pagina, '^Horarios$'), pagina);
  await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await espera(3000);
  await paso('primera-peli', () => pulsar(pagina, '^(Comprar|Ver horarios|Horarios|Ver sinopsis)$'), pagina);
  for (const ruta of ['/es/cartelera', '/es/horarios', '/es/cines', '/es/pelicula/clayface', '/es/peliculas/clayface', '/es/cine/premium-bahia-sur', '/es/cines/premium-bahia-sur']) {
    await paso(`ruta ${ruta}`, () => pagina.goto('https://cineyelmo.com' + ruta, { waitUntil: 'networkidle2', timeout: 40000 }), pagina);
  }
} catch (e) {
  informe.error = e.message; console.log(`❌ ${e.message}`);
} finally {
  await navegador.close();
}

// ¿Responde la API sin navegador? (si sí, la web podría pedirla directamente)
try {
  const r = await fetch('https://api-g.cinepolis.com/shared-services/locations/graphql', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://cineyelmo.com' },
    body: JSON.stringify({ operationName: 'Cities', variables: { countryId: 'ES' },
      query: 'query Cities($countryId: String!) { cities(country_id: $countryId) { edges { node { id name cinemas { id vistaId name } } } } }' }),
  });
  const t = await r.text();
  informe.apiSinNavegador = { estado: r.status, servidor: r.headers.get('server'), inicio: t.slice(0, 300),
    cadiz: (t.match(/\{"node":\{"id":"cadiz"[^]*?\]\}\}/) || [''])[0].slice(0, 2000) };
  console.log(`api sin navegador: ${r.status} ${r.headers.get('server') ?? ''}`);
} catch (e) { informe.apiSinNavegador = { error: e.message }; console.log(`api sin navegador: ${e.message}`); }

const texto = JSON.stringify(informe, null, 1);
writeFileSync(process.env.DESTINO, texto.length > 900000 ? texto.slice(0, 900000) : texto);
console.log(`guardado (${texto.length} bytes), ${informe.operaciones.length} operaciones`);
