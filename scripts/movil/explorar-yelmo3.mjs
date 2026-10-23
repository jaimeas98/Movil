// Tercera exploración de cineyelmo.com (23-10-2026): encontrar la operación
// GraphQL que trae los HORARIOS de un cine.
//
// Recorrer la web pulsando botones es frágil, así que aquí se lee el propio
// código de la web (sus ficheros JavaScript, que son públicos) buscando todas
// las consultas GraphQL que sabe hacer, y las que hablan de sesiones u horarios
// se prueban en el acto, desde la página (mismo origen y mismas cookies que una
// persona), con nuestros dos cines. Se guarda todo en exploracion-yelmo3.json.

import { writeFileSync } from 'node:fs';
import { identidad } from './recolector.mjs';

const CINES = ['premium-bahia-sur-cadiz', 'area-sur-cadiz'];
const { modelo, android, androidCompleta } = identidad();
const { default: puppeteer } = await import('puppeteer-core');
const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const informe = { cuando: new Date().toISOString(), scripts: 0, operaciones: [], pruebas: [], pulsando: [] };
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

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

  // Registrar cualquier operación GraphQL que haga la propia web.
  pagina.on('response', async (res) => {
    try {
      const req = res.request();
      if (!/graphql/.test(res.url()) || req.method() !== 'POST') return;
      const op = JSON.parse(req.postData() ?? '{}');
      if (/Footer|NavBar|Banner|Alarm|Log|SharedConfig|countrySettings|Cities|^Movies$/i.test(op.operationName ?? '')) return;
      const t = await res.text().catch(() => '');
      informe.pulsando.push({ nombre: op.operationName, url: res.url(), variables: op.variables, consulta: (op.query ?? '').slice(0, 5000), respuesta: t.slice(0, 40000) });
    } catch {}
  });

  await pagina.goto('https://cineyelmo.com/es/horarios', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((ok) => setTimeout(ok, 4000));

  // 1) Leer el código de la web y sacar sus consultas GraphQL.
  const encontradas = await pagina.evaluate(async () => {
    const srcs = [...document.querySelectorAll('script[src]')].map((s) => s.src);
    // Next carga más trozos según la página: los del manifiesto de compilación también.
    const build = window.__NEXT_DATA__?.buildId;
    if (build) {
      try {
        const m = await (await fetch(`/_next/static/${build}/_buildManifest.js`)).text();
        for (const x of m.match(/static\/chunks\/[^"']+\.js/g) ?? []) srcs.push('/_next/' + x);
      } catch {}
    }
    const unicas = [...new Set(srcs)];
    const ops = {};
    for (const u of unicas) {
      let t = '';
      try { t = await (await fetch(u)).text(); } catch { continue; }
      // Las consultas van como texto: "query Nombre(" o "mutation Nombre(".
      const re = /(query|mutation)\s+([A-Za-z0-9_]+)\s*(\([^)]*\))?\s*\{/g;
      let r;
      while ((r = re.exec(t))) {
        const nombre = r[2];
        if (ops[nombre]) continue;
        // Desde el principio de la consulta, hasta cerrar sus llaves.
        let i = r.index + r[0].length, prof = 1;
        while (i < t.length && prof > 0) { if (t[i] === '{') prof++; else if (t[i] === '}') prof--; i++; }
        ops[nombre] = { tipo: r[1], variables: r[3] ?? '', texto: t.slice(r.index, Math.min(i, r.index + 6000)).replace(/\\n/g, '\n'), fichero: u.split('/').pop() };
      }
    }
    return { scripts: unicas.length, ops };
  });
  informe.scripts = encontradas.scripts;
  informe.operaciones = Object.entries(encontradas.ops).map(([nombre, o]) => ({ nombre, ...o }));
  console.log(`código leído: ${encontradas.scripts} ficheros, ${informe.operaciones.length} operaciones`);
  console.log('operaciones: ' + informe.operaciones.map((o) => o.nombre).join(', ').slice(0, 1500));

  // 2) Probar en el acto las que hablan de sesiones/horarios/cartelera de un cine.
  const interesantes = informe.operaciones.filter((o) => o.tipo === 'query' &&
    /show|session|sesion|schedul|horari|billboard|cinema|times|function|funcion|program/i.test(o.nombre + o.variables));
  const valor = (nombre, tipo) => {
    const n = nombre.toLowerCase();
    if (/country/.test(n)) return 'ES';
    if (/lang/.test(n)) return 'es';
    if (/cit/.test(n)) return 'cadiz';
    if (/cinemas/.test(n)) return /\[/.test(tipo) ? [CINES[0]] : CINES[0];
    if (/cinema|theater|site/.test(n)) return CINES[0];
    if (/date|day|fecha/.test(n)) return hoy;
    if (/absolute/.test(n)) return true;
    if (/limit|first/.test(n)) return 100;
    if (/movie|film/.test(n)) return null;
    return null;
  };
  for (const o of interesantes.slice(0, 25)) {
    const vars = {};
    for (const m of o.variables.matchAll(/\$([A-Za-z0-9_]+)\s*:\s*([\[\]A-Za-z0-9_!]+)/g)) vars[m[1]] = valor(m[1], m[2]);
    const url = /billboard|movie|show|session/i.test(o.nombre + o.texto) ? 'https://api-g.cinepolis.com/v2/billboards/graphql' : 'https://api-g.cinepolis.com/shared-services/locations/graphql';
    const r = await pagina.evaluate(async (url, cuerpo) => {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: cuerpo });
        return { estado: res.status, texto: (await res.text()).slice(0, 60000) };
      } catch (e) { return { error: e.message }; }
    }, url, JSON.stringify({ operationName: o.nombre, variables: vars, query: o.texto }));
    informe.pruebas.push({ nombre: o.nombre, url, variables: vars, ...r });
    console.log(`prueba ${o.nombre}: ${r.estado ?? r.error} · ${(r.texto ?? '').slice(0, 140).replace(/\s+/g, ' ')}`);
  }

  // 3) Y de paso, el recorrido a mano en /es/horarios por si la web pide otra cosa.
  for (const patron of ['Elige tu cine', '^C[áa]diz$', 'Premium Bah[íi]a Sur']) {
    const hecho = await pagina.evaluate((p) => {
      const re = new RegExp(p, 'i');
      const els = [...document.querySelectorAll('a,button,[role=button],[role=option],li,label,div,span')]
        .filter((e) => re.test((e.innerText || '').trim()) && (e.innerText || '').trim().length < 60);
      els.sort((a, b) => a.innerText.length - b.innerText.length);
      if (!els[0]) return null;
      els[0].click(); return els[0].tagName + ':' + els[0].innerText.trim();
    }, patron).catch(() => null);
    console.log(`pulsar /${patron}/: ${hecho ?? 'no encontrado'}`);
    await new Promise((ok) => setTimeout(ok, 3500));
  }
  console.log(`operaciones al pulsar: ${informe.pulsando.map((p) => p.nombre).join(', ') || 'ninguna'}`);
} catch (e) {
  informe.error = e.message; console.log(`❌ ${e.message}`);
} finally {
  await navegador.close();
  const texto = JSON.stringify(informe, null, 1);
  writeFileSync(process.env.DESTINO, texto.length > 1500000 ? texto.slice(0, 1500000) : texto);
  console.log(`guardado (${texto.length} bytes)`);
}
