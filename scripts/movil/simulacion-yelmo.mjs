// puppeteer-core y cineyelmo.com SIMULADOS, para probar.sh y
// ensayo-recuperacion.sh. Se copia como node_modules/puppeteer-core/index.js:
// el recolector real (recolector-navegador.mjs) se ejecuta entero, pero lo
// que "responde Yelmo" lo decide MOCK_YELMO.
//
// Imita lo que se vio desde el móvil el 23-10-2026 (exploracion-yelmo*.json):
//  · al cargar la portada, la propia web hace sus peticiones al API (Cities,
//    Movies now-playing) con cabeceras suyas, entre ellas una clave;
//  · el API responde 401 "Unauthorized access." a quien no lleve esa clave;
//  · Movies trae `cinemas: []` en cada película; Billboard trae las sesiones
//    con la forma de la consulta real de su web.
// Lo que no se ha visto aún (los valores de una respuesta de Billboard) va
// con la forma de la consulta y valores razonables.
//
// MOCK_YELMO:
//   ok             todo bien; el API filtra Movies por cine
//   bloqueo        Cloudflare bloquea la portada (403)
//   api-403        la portada entra, pero Cloudflare bloquea el API
//   sin-cabeceras  la web no hace (o no deja ver) sus peticiones: sin clave → 401
//   uno            Billboard nunca trae Bahía Sur (la fusión debe conservarlo)
//   sin-filtro     Movies no filtra por cine: se piden los dos cines a la vez
//   sin-coma       además, Billboard no admite dos cines separados por coma
// En todos, «Peli rota» falla siempre en Billboard (se salta y se apunta).
//
// Y apunta, si se le pide: LLAMADAS (una "x" por cada carga de la portada) y
// ENSAYO_UA (con qué identidad se presenta Chromium).

import { appendFileSync } from 'node:fs';

const modo = () => process.env.MOCK_YELMO || 'ok';
// Valores inventados de las cabeceras de la web. probar.sh comprueba que no
// aparecen nunca en nada de lo que se publica.
const CLAVE = 'CLAVE-SECRETA-DE-PRUEBA-1234';
const TOKEN = 'Bearer TOKEN-SECRETO-DE-PRUEBA-5678';
const API = 'https://api-g.cinepolis.com';
const dia = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(Date.now() + n * 86400000));

const peli = (id, name, extra = {}) => ({
  id, type: '', countryId: 'ES', name, originalName: name, distributor: 'X', rating: 'M-12',
  ratingDescription: 'No recomendada para menores de 12 años.', position: String(extra.posicion ?? 9), genre: ['DRAMA'],
  synopsis: `Sinopsis de ${name}.`, length: '101 min', availableForSale: true, alerts: [], releaseDate: `${dia(-1)}T06:00`,
  languages: ['es', 'en', 'ca'], formats: ['2D'], tags: [],
  media: [{ resource: '', type: 'image', code: 'poster', sizes: { large: `https://pimcore-content.cinepolis.com/assets/España/${id}/720x1022.jpg`, medium: '', small: '' } }],
  cities: [], cinemas: [], categories: ['now-playing'], experiences: [],
});
// «Peli rota» va la primera a propósito: así también se prueba que una
// película rota al principio no confunde al recolector.
const PELIS = [peli('peli-rota', 'Peli rota', { posicion: 1 }), peli('peli-uno', 'Peli uno', { posicion: 2 }),
  peli('peli-dos', 'Peli dos', { posicion: 3 }), peli('peli-tres', 'Peli tres', { posicion: 4 }), peli('peli-de-madrid', 'Peli de Madrid', { posicion: 5 })];
const EN_CINE = {
  'premium-bahia-sur-cadiz': ['peli-rota', 'peli-uno', 'peli-dos', 'peli-tres'],
  'area-sur-cadiz': ['peli-rota', 'peli-uno', 'peli-tres'],
};
const VISTA = { 'premium-bahia-sur-cadiz': '1340', 'area-sur-cadiz': '803', 'otro-cine': '1' };

const respuestaMovies = (lista) => JSON.stringify({ data: { movies: {
  pageInfo: { startCursor: '0', endCursor: '', hasNextPage: false, hasPreviousPage: false }, totalCount: lista.length,
  edges: lista.map((node) => ({ cursor: '', node })) } } });

let sesion = 24000;
const programa = (cinemaId, movieId) => ({
  cinemaId, cityId: 'cadiz', movieId,
  dates: [0, 1].map((n) => ({
    date: dia(n),
    languages: [
      { language: 'es', displayLanguage: 'Español', showtimes: ['18:15', '20:30'].map((h) => ({
        format: { icon: '', name: '2D' }, sessionId: String(sesion++), datetime: `${dia(n)}T${h}:00`, screen: '7',
        experience: cinemaId === 'premium-bahia-sur-cadiz' ? { icon: '', name: 'PREM' } : null,
        movieVistaId: 'HO00001717', cinemaVistaId: VISTA[cinemaId], alerts: [], availability: 'Available', isAllocatedSeating: true })) },
      { language: 'en', displayLanguage: 'Inglés subtitulado', showtimes: [{
        format: { icon: '', name: '2D' }, sessionId: String(sesion++), datetime: `${dia(n)}T22:45:00`, screen: '3', experience: null,
        movieVistaId: 'HO00001717', cinemaVistaId: VISTA[cinemaId], alerts: [], availability: 'Available', isAllocatedSeating: true }] },
    ],
  })),
});

// El API. Comprueba lo mismo que el de verdad (la clave) y, además, que el
// recolector no le pasa cabeceras que pone el navegador (cookies, User-Agent…).
const responder = (status, cuerpo) => ({ status, text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) });
async function apiFalso(url, opciones = {}) {
  if (!String(url).startsWith(API)) return responder(404, 'no');
  if (modo() === 'api-403') return responder(403, '<!DOCTYPE html><title>Attention Required! | Cloudflare</title>');
  const h = Object.fromEntries(Object.entries(opciones.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (Object.keys(h).some((k) => /^(cookie|user-agent|content-length|host|referer|origin)$|^sec-/.test(k))) {
    return responder(400, { message: 'cabeceras del navegador puestas a mano' });
  }
  if (h['x-api-key'] !== CLAVE || h.authorization !== TOKEN) {
    return responder(401, '\n            {\n                "message":"Unauthorized access.",\n                "internal_status_code":1\n            }\n        ');
  }
  const { operationName, variables: v = {} } = JSON.parse(opciones.body ?? '{}');
  if (operationName === 'Movies') {
    if (!v.cinemas || /sin-filtro|sin-coma/.test(modo())) return responder(200, respuestaMovies(PELIS));
    return responder(200, respuestaMovies(PELIS.filter((p) => (EN_CINE[v.cinemas] ?? []).includes(p.id))));
  }
  if (operationName === 'Billboard') {
    if (v.movieId === 'peli-rota') return responder(500, { errors: [{ message: 'Internal server error' }] });
    const cines = String(v.cinemas ?? '').split(',').filter(Boolean);
    if (modo() === 'sin-coma' && cines.length > 1) return responder(200, { errors: [{ message: 'Cinema not found' }], data: { billboard: null } });
    let schedules = v.movieId === 'peli-de-madrid' ? [programa('otro-cine', v.movieId)]
      : cines.filter((c) => (EN_CINE[c] ?? []).includes(v.movieId)).map((c) => programa(c, v.movieId));
    if (modo() === 'uno') schedules = schedules.filter((s) => s.cinemaId !== 'premium-bahia-sur-cadiz');
    return responder(200, { data: { billboard: { dates: [dia(0), dia(1)], schedules } } });
  }
  return responder(200, { data: {} });
}

// Lo que la web hace al cargar: sus peticiones al API, con sus cabeceras (y
// las que pone el navegador, que el recolector no debe copiar).
const CABECERAS_WEB = {
  accept: '*/*', 'content-type': 'application/json', 'x-api-key': CLAVE, authorization: TOKEN,
  referer: 'https://cineyelmo.com/', 'user-agent': 'Mozilla/5.0 (simulado)', 'sec-ch-ua': '"Chromium";v="155"', 'accept-language': 'es-ES',
};
const PETICIONES_WEB = [
  { url: `${API}/shared-services/locations/graphql`, cuerpo: { operationName: 'Cities', variables: { countryId: 'ES' } } },
  { url: `${API}/v2/billboards/graphql`, cuerpo: { operationName: 'Movies', variables: { category: 'now-playing', cinemas: '', limit: 100, countryId: 'ES', isAbsoluteMediaPath: true } } },
];

let chrome = null;
const oyentes = { request: [], response: [] };
const pagina = {
  setUserAgent: async (ua, meta) => { if (process.env.ENSAYO_UA) appendFileSync(process.env.ENSAYO_UA, JSON.stringify({ ua, meta, chrome }) + '\n'); },
  setViewport: async () => {}, setExtraHTTPHeaders: async () => {}, evaluateOnNewDocument: async () => {},
  title: async () => 'Cine Yelmo',
  on: (evento, fn) => { (oyentes[evento] ??= []).push(fn); return pagina; },
  goto: async () => {
    if (process.env.LLAMADAS) appendFileSync(process.env.LLAMADAS, 'x');
    if (modo() === 'bloqueo') return { status: () => 403 };
    if (modo() !== 'sin-cabeceras') {
      for (const p of PETICIONES_WEB) {
        const peticion = { url: () => p.url, method: () => 'POST', headers: () => ({ ...CABECERAS_WEB }), postData: () => JSON.stringify(p.cuerpo) };
        for (const fn of oyentes.request) fn(peticion);
        const r = await apiFalso(p.url, { headers: { 'x-api-key': CLAVE, authorization: TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(p.cuerpo) });
        const texto = await r.text();
        const respuesta = { url: () => p.url, status: () => (modo() === 'api-403' ? 200 : r.status), request: () => peticion,
          text: async () => (modo() === 'api-403' ? respuestaMovies(PELIS) : texto) };
        for (const fn of oyentes.response) await fn(respuesta);
      }
    }
    return { status: () => 200 };
  },
  // El mundo aislado: la expresión que manda el recolector se ejecuta de
  // verdad, con este API simulado en lugar de fetch.
  createCDPSession: async () => ({ send: async (m, p = {}) => {
    if (m === 'Page.getFrameTree') return { frameTree: { frame: { id: 'f' } } };
    if (m === 'Page.createIsolatedWorld') return { executionContextId: 1 };
    if (m === 'Runtime.evaluate') {
      try { return { result: { value: await new Function('fetch', `return ${p.expression}`)(apiFalso) } }; }
      catch (e) { return { exceptionDetails: { text: e.message } }; }
    }
    return {};
  } }),
};
export default { launch: async (o) => { chrome = o.executablePath; return { newPage: async () => pagina, version: async () => 'Chrome/155.0.8059.39', close: async () => {} }; } };
