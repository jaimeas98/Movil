// Comprueba las rutas del panel de control contra un GitHub simulado en
// memoria (sin red):
//
//  · entrar: la clave buena da la cookie; la mala espera ~800 ms y da 401; a
//    los 5 fallos, 429
//  · órdenes: la primera crea la rama HUÉRFANA ordenes-movil (blob → árbol →
//    commit sin padres → ref); las siguientes escriben con sha; dos iguales
//    seguidas no; solo acciones de la lista; se siguen por id
//  · plantillas: commit de data/enlaces.js en la rama de la web, con
//    reintento si GitHub dice 409
//  · sin PANEL_GITHUB_TOKEN: solo lectura (403) y lecturas anónimas
//  · el token no sale nunca en una respuesta
//  · estado: si una parte falla, las demás llegan
//  · revisión de seguridad: M2 límites de órdenes (en curso cuenta, espera
//    mínima por acción, 10 por hora) y un guardado de plantilla por minuto;
//    H1 plantillas y enlaces buenos solo de la web del cine; L2 "constructor"
//    no es un cine; L3 órdenes mal formadas fuera
//
//   node scripts/test-panel-api.mjs
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';

const RAIZ = new URL('../', import.meta.url);
registerHooks({
  resolve(esp, ctx, siguiente) {
    if (esp === 'next/server') return siguiente('next/server.js', ctx);
    if (esp.startsWith('@/')) return siguiente(new URL(esp.slice(2), RAIZ).href, ctx);
    return siguiente(esp, ctx);
  },
});

let fallos = 0;
const ok = (c, m) => { process.stdout.write(`${c ? 'ok   ' : 'FALLO'} ${m}\n`); if (!c) fallos++; };
// El agregador cuenta en la consola lo que hace con cada cine: aquí, ruido.
console.log = () => {}; console.warn = () => {};

const CLAVE = 'una-clave-larga-de-prueba-1234';
const TOKEN = 'github_pat_SECRETO0123456789abcdefghijklmnop';
process.env.PANEL_CLAVE = CLAVE;

// ── GitHub en memoria ─────────────────────────────────────────────────────
const sha = (t) => createHash('sha1').update(String(t)).digest('hex');
const repo = {
  ramas: {
    'claude/puerto-santa-maria-restaurants-NxChu': { 'data/enlaces.js': 'export default {"plantillas":{}};\n' },
    'estado-movil': {
      'estado.json': JSON.stringify({ vuelta: new Date(Date.now() - 120e3).toISOString(), resultado: 'sin recogida: no tocaba', bateria: { porcentaje: 80, cargando: true } }),
      'registro.txt': 'línea 1\nlínea 2\n',
      'historial.jsonl': '{"t":"2026-10-17T10:00:00Z","resultado":"a"}\nesto no es json\n{"t":"2026-10-17T10:15:00Z","resultado":"b"}\n',
    },
  },
  blobs: {}, arboles: {}, commits: {},
  dispatches: [],
  conflictosPendientes: 0,
};
const peticiones = [];
const resp = (status, cuerpo, h = {}) => new Response(cuerpo === undefined ? null : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)), { status, headers: h });

async function githubFalso(url, opc = {}) {
  const u = new URL(url);
  const metodo = opc.method || 'GET';
  const auth = opc.headers?.Authorization ?? null;
  peticiones.push({ host: u.host, ruta: u.pathname, metodo, auth });
  if (u.host === 'raw.githubusercontent.com') {
    const [, , , ...resto] = u.pathname.split('/');
    for (const [rama, ficheros] of Object.entries(repo.ramas)) {
      const pref = rama.split('/');
      if (pref.every((p, i) => resto[i] === p)) {
        const f = decodeURIComponent(resto.slice(pref.length).join('/'));
        return f in ficheros ? resp(200, ficheros[f]) : resp(404, '404: Not Found');
      }
    }
    return resp(404, '404: Not Found');
  }
  if (u.host !== 'api.github.com') throw new Error('sin red en la prueba');
  if (auth && auth !== `Bearer ${TOKEN}`) return resp(401, { message: 'Bad credentials' });
  const p = u.pathname.replace('/repos/jaimeas98/Movil', '');
  const cuerpo = opc.body ? JSON.parse(opc.body) : null;
  let m;
  if ((m = p.match(/^\/contents\/(.+)$/))) {
    const ruta = decodeURIComponent(m[1]);
    if (metodo === 'GET') {
      const rama = u.searchParams.get('ref');
      const ficheros = repo.ramas[rama];
      if (!ficheros || !(ruta in ficheros)) return resp(404, { message: 'Not Found' });
      if (opc.headers.Accept === 'application/vnd.github.raw') return resp(200, ficheros[ruta]);
      return resp(200, { content: Buffer.from(ficheros[ruta]).toString('base64'), sha: sha(ficheros[ruta]) });
    }
    if (metodo === 'PUT') {
      if (!auth) return resp(401, { message: 'Requires authentication' });
      const ficheros = repo.ramas[cuerpo.branch];
      if (!ficheros) return resp(404, { message: 'Branch not found' });
      if (repo.conflictosPendientes > 0) { repo.conflictosPendientes--; return resp(409, { message: 'is at x but expected y' }); }
      const actual = ficheros[ruta];
      if (actual !== undefined && cuerpo.sha !== sha(actual)) return resp(409, { message: 'sha does not match' });
      ficheros[ruta] = Buffer.from(cuerpo.content, 'base64').toString('utf8');
      return resp(200, { commit: { sha: sha('commit' + Date.now() + Math.random()) } });
    }
  }
  if ((m = p.match(/^\/git\/ref\/heads\/(.+)$/))) {
    const rama = decodeURIComponent(m[1]);
    return repo.ramas[rama] ? resp(200, { ref: `refs/heads/${rama}` }) : resp(404, { message: 'Not Found' });
  }
  if (p === '/git/blobs' && metodo === 'POST') { const s = sha(cuerpo.content); repo.blobs[s] = cuerpo.content; return resp(201, { sha: s }); }
  if (p === '/git/trees' && metodo === 'POST') { const s = sha(JSON.stringify(cuerpo)); repo.arboles[s] = cuerpo.tree; return resp(201, { sha: s }); }
  if (p === '/git/commits' && metodo === 'POST') { const s = sha(JSON.stringify(cuerpo)); repo.commits[s] = cuerpo; return resp(201, { sha: s }); }
  if (p === '/git/refs' && metodo === 'POST') {
    const rama = cuerpo.ref.replace('refs/heads/', '');
    if (repo.ramas[rama]) return resp(422, { message: 'Reference already exists' });
    const c = repo.commits[cuerpo.sha];
    repo.ramas[rama] = Object.fromEntries(repo.arboles[c.tree].map((e) => [e.path, repo.blobs[e.sha]]));
    repo.ramas[rama].__padres = c.parents;
    return resp(201, {});
  }
  if (p === '/issues') {
    const abierto = u.searchParams.get('state') === 'open';
    return resp(200, abierto
      ? [{ number: 12, title: 'El móvil no responde', html_url: 'https://github.com/jaimeas98/Movil/issues/12', state: 'open', labels: [{ name: 'alerta-movil' }, { name: 'critico' }], created_at: '2026-10-17T10:00:00Z', updated_at: '2026-10-17T10:30:00Z', closed_at: null, comments: 1 },
        { number: 13, title: 'un PR', pull_request: {}, labels: [] }]
      : [{ number: 9, title: 'Batería baja', html_url: 'x', state: 'closed', labels: [], created_at: '2026-10-16T10:00:00Z', updated_at: '2026-10-16T11:00:00Z', closed_at: new Date().toISOString(), comments: 0 }]);
  }
  if ((m = p.match(/^\/actions\/workflows\/(.+)\/dispatches$/)) && metodo === 'POST') {
    repo.dispatches.push({ workflow: m[1], ...cuerpo });
    return resp(204);
  }
  return resp(404, { message: `ruta no simulada ${p}` });
}

const gh = await import('../lib/panel/github.js');
const conToken = () => gh.usarFetch(githubFalso, { PANEL_GITHUB_TOKEN: TOKEN });
const sinToken = () => gh.usarFetch(githubFalso, {});
globalThis.fetch = githubFalso;   // el agregador (cines) tampoco tiene red
conToken();

const S = await import('../lib/panel/sesion.js');
const cookie = await S.crearValorCookie(CLAVE);
const H = (extra = {}) => ({ host: 'cine.example', origin: 'https://cine.example', cookie: `panel=${cookie}`, ...extra });
const pedir = (ruta, { metodo = 'GET', cuerpo, cabeceras } = {}) => new Request(`https://cine.example${ruta}`, {
  method: metodo, headers: { ...H(), ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(cabeceras || {}) },
  body: cuerpo === undefined ? undefined : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
});
const textos = [];
async function leer(r) { const t = await r.text(); textos.push(t); try { return JSON.parse(t); } catch { return t; } }

// ── Entrar ────────────────────────────────────────────────────────────────
const entrar = await import('../app/api/panel/entrar/route.js');
const sinCookie = (cuerpo, ip = '1.1.1.1', tipo = 'application/json') => new Request('https://cine.example/api/panel/entrar', {
  method: 'POST', headers: { host: 'cine.example', origin: 'https://cine.example', 'content-type': tipo, 'x-forwarded-for': ip }, body: cuerpo,
});
let t0 = Date.now();
let r = await entrar.POST(sinCookie(JSON.stringify({ clave: 'mala' })));
ok(r.status === 401 && Date.now() - t0 >= 750 && (await leer(r)).codigo === 'clave', `clave mala: 401 tras ${Date.now() - t0} ms`);
r = await entrar.POST(sinCookie(JSON.stringify({ clave: CLAVE })));
const sc = r.headers.get('set-cookie') || '';
ok(r.status === 204 && /^panel=v1\./.test(sc) && /HttpOnly/.test(sc) && /SameSite=Strict/.test(sc) && /Secure/.test(sc), 'clave buena: 204 y cookie HttpOnly, Secure, SameSite=Strict');
ok(await S.cookieValida(sc.split(';')[0].slice('panel='.length), CLAVE), 'y esa cookie vale');
r = await entrar.POST(sinCookie(`clave=${encodeURIComponent(CLAVE)}`, '1.1.1.1', 'application/x-www-form-urlencoded'));
ok(r.status === 303 && new URL(r.headers.get('location')).pathname === '/panel' && /panel=v1/.test(r.headers.get('set-cookie')), 'sin JavaScript (formulario): 303 al panel con la cookie');
for (let i = 0; i < 5; i++) await entrar.POST(sinCookie(JSON.stringify({ clave: 'mala' + i }), '2.2.2.2'));
r = await entrar.POST(sinCookie(JSON.stringify({ clave: CLAVE }), '2.2.2.2'));
ok(r.status === 429, 'a los 5 fallos desde la misma IP, 429 (ni con la buena)');
r = await entrar.POST(sinCookie(JSON.stringify({ clave: CLAVE }), '3.3.3.3'));
ok(r.status === 204, 'otra IP sigue pudiendo entrar');

// ── Órdenes ───────────────────────────────────────────────────────────────
const orden = await import('../app/api/panel/orden/route.js');
const ordenId = await import('../app/api/panel/orden/[id]/route.js');
r = await orden.POST(pedir('/api/panel/orden', { metodo: 'POST', cuerpo: { accion: 'recoger' } }));
const o1 = await leer(r);
ok(r.status === 201 && /^o-\d{8}-\d{4}-[a-z0-9]{4}$/.test(o1.id) && o1.estado === 'pendiente', `orden pedida: ${o1.id}`);
const rama = repo.ramas['ordenes-movil'];
ok(rama && Array.isArray(rama.__padres) && rama.__padres.length === 0, 'la rama ordenes-movil se crea HUÉRFANA (commit sin padres)');
ok(rama['vercel.json']?.includes('"deploymentEnabled": false') && rama['LEEME.txt'], 'con su LEEME y un vercel.json que no despliega');
ok(JSON.parse(rama['ordenes.json']).ordenes[0].accion === 'recoger', 'y ordenes.json con la orden');
r = await orden.POST(pedir('/api/panel/orden', { metodo: 'POST', cuerpo: { accion: 'recoger' } }));
const rep = await leer(r);
ok(r.status === 409 && rep.codigo === 'ya-pedida' && rep.id === o1.id, 'la misma acción pendiente no se pide dos veces');
r = await orden.POST(pedir('/api/panel/orden', { metodo: 'POST', cuerpo: { accion: 'diagnostico' } }));
const o2 = await leer(r);
ok(r.status === 201 && JSON.parse(repo.ramas['ordenes-movil']['ordenes.json']).ordenes.length === 2, 'la segunda se añade a la rama que ya existe');
for (const malo of [{ accion: 'rm -rf /' }, { accion: 'constructor' }, { accion: '__proto__' }, {}, { accion: 'informe', parametros: { cmd: 'x' } }, { accion: ['informe'] }]) {
  r = await orden.POST(pedir('/api/panel/orden', { metodo: 'POST', cuerpo: malo }));
  if (r.status !== 400) ok(false, `acepta ${JSON.stringify(malo)} (${r.status})`);
}
ok(true, 'acciones fuera de la lista, parámetros o cuerpos raros: 400');
r = await orden.POST(pedir('/api/panel/orden', { metodo: 'POST', cuerpo: 'esto no es json' }));
ok(r.status === 400, 'un cuerpo que no es JSON: 400');
r = await orden.POST(pedir('/api/panel/orden', { metodo: 'POST', cuerpo: { accion: 'informe', relleno: 'x'.repeat(20000) } }));
ok(r.status === 400, 'un cuerpo enorme: 400');
// Recorta a 20.
const lista = JSON.parse(repo.ramas['ordenes-movil']['ordenes.json']);
lista.ordenes = [...Array.from({ length: 25 }, (_, i) => ({ id: `o-20261017-0000-${String(i).padStart(4, '0')}`, accion: 'informe', pedida: '2026-10-17T00:00:00Z', parametros: {} })), ...lista.ordenes];
repo.ramas['ordenes-movil']['ordenes.json'] = JSON.stringify(lista);
gh.vaciarCache();
r = await orden.POST(pedir('/api/panel/orden', { metodo: 'POST', cuerpo: { accion: 'respaldo' } }));
ok(r.status === 201 && JSON.parse(repo.ramas['ordenes-movil']['ordenes.json']).ordenes.length === 20, 'ordenes.json se queda en las últimas 20');

const seguir = async (id) => leer(await ordenId.GET(pedir(`/api/panel/orden/${id}`), { params: { id } }));
let e = await seguir(o2.id);
ok(e.estado === 'pendiente' && e.resultado === null && e.accion === 'diagnostico', 'una orden recién pedida está pendiente');
repo.ramas['estado-movil']['ordenes-resultado.json'] = JSON.stringify({ resultados: [{ id: o2.id, accion: 'diagnostico', estado: 'hecha', inicio: '2026-10-17T16:16:02.000Z', fin: '2026-10-17T16:16:09.000Z', codigo: 0, salida: 'node: v22' }] });
gh.vaciarCache();
e = await seguir(o2.id);
ok(e.estado === 'hecha' && e.resultado?.salida === 'node: v22', 'y cuando el móvil publica el resultado, hecha con su salida');
r = await ordenId.GET(pedir('/api/panel/orden/o-20991231-0000-zzzz'), { params: { id: 'o-20991231-0000-zzzz' } });
ok(r.status === 404 && (await leer(r)).codigo === 'no-esta', 'una orden que no existe: 404 con JSON (no es la sesión)');
r = await ordenId.GET(pedir('/api/panel/orden/..%2F..'), { params: { id: '../..' } });
ok(r.status === 404, 'un id raro: 404');

// ── M2: límites de órdenes ───────────────────────────────────────────────
const ordenesLib = await import('../lib/panel/ordenes.js');
const pedirAccion = async (accion) => { gh.vaciarCache(); const r = await orden.POST(pedir('/api/panel/orden', { metodo: 'POST', cuerpo: { accion } })); return { r, c: await leer(r) }; };
const ponerResultados = (lista) => { repo.ramas['estado-movil']['ordenes-resultado.json'] = JSON.stringify({ resultados: lista }); gh.vaciarCache(); };
const resultadosAntes = repo.ramas['estado-movil']['ordenes-resultado.json'];
const ordenesAntes = repo.ramas['ordenes-movil']['ordenes.json'];
// El móvil coge «recoger» y la marca en curso: sigue contando como pendiente.
ponerResultados([{ id: o1.id, accion: 'recoger', estado: 'en-curso', inicio: new Date().toISOString(), fin: null, codigo: null, salida: 'en marcha…' }, ...JSON.parse(resultadosAntes).resultados]);
let x = await pedirAccion('recoger');
ok(x.r.status === 409 && x.c.codigo === 'ya-pedida' && x.c.id === o1.id, 'M2: una orden «en curso» sigue contando como pendiente (409)');
// Termina: aún no ha pasado su espera mínima (30 min).
ponerResultados([{ id: o1.id, accion: 'recoger', estado: 'hecha', inicio: new Date().toISOString(), fin: new Date().toISOString(), codigo: 0, salida: '' }, ...JSON.parse(resultadosAntes).resultados]);
x = await pedirAccion('recoger');
ok(x.r.status === 429 && x.c.codigo === 'espera' && x.c.reintentarEn > 1700 && x.c.reintentarEn <= 1800 && x.c.accion === 'recoger' && /otra vez en 30 min/.test(x.c.error),
  `M2: acabada, «recoger» no se puede repetir hasta pasados 30 min: 429 {codigo:'espera', reintentarEn:${x.c.reintentarEn}} «${x.c.error}»`);
x = await pedirAccion('actualizar-paquetes');
ok(x.r.status === 201, 'actualizar-paquetes una vez, sí');
const actu = x.c.id;
ponerResultados([{ id: actu, accion: 'actualizar-paquetes', estado: 'en-curso', inicio: new Date().toISOString() }]);
x = await pedirAccion('actualizar-paquetes');
ok(x.r.status === 409, 'M2: dos actualizaciones a la vez, no');
ponerResultados([{ id: actu, accion: 'actualizar-paquetes', estado: 'hecha', inicio: new Date().toISOString(), codigo: 0 }]);
x = await pedirAccion('actualizar-paquetes');
ok(x.r.status === 429 && x.c.reintentarEn > 23 * 3600 && /24 h/.test(x.c.error), `M2: una al día (${x.c.error})`);
ponerResultados([{ id: actu, accion: 'actualizar-paquetes', estado: 'en-curso' }]);
x = await pedirAccion('actualizar-paquetes');
ok(x.r.status === 409, 'M2: «en curso» sin hora de inicio también cuenta como pendiente');
// Lo que el móvil rechazó no cuenta.
ponerResultados([]);
repo.ramas['ordenes-movil']['ordenes.json'] = JSON.stringify({ ordenes: [] });
const rech = { id: 'o-20261017-0000-rrrr', accion: 'informe', pedida: new Date().toISOString(), parametros: {} };
repo.ramas['ordenes-movil']['ordenes.json'] = JSON.stringify({ ordenes: [rech] });
ponerResultados([{ id: rech.id, accion: 'informe', estado: 'rechazada', inicio: new Date().toISOString(), codigo: 2 }]);
x = await pedirAccion('informe');
ok(x.r.status === 201, 'M2: una rechazada por el móvil no cuenta para la espera');
// Tope de 10 por hora entre todas.
const hace = (min) => new Date(Date.now() - min * 60e3).toISOString();
repo.ramas['ordenes-movil']['ordenes.json'] = JSON.stringify({ ordenes: Array.from({ length: 10 }, (_, i) => ({ id: `o-20261017-0000-h${String(i).padStart(3, '0')}`, accion: 'diagnostico', pedida: hace(55 - i * 3), parametros: {} })) });
ponerResultados(Array.from({ length: 10 }, (_, i) => ({ id: `o-20261017-0000-h${String(i).padStart(3, '0')}`, accion: 'diagnostico', estado: 'hecha', inicio: hace(55 - i * 3), codigo: 0 })));
x = await pedirAccion('informe');
ok(x.r.status === 429 && x.c.codigo === 'espera' && /10 órdenes por hora/.test(x.c.error) && x.c.reintentarEn > 0 && x.c.reintentarEn <= 5 * 60,
  `M2: como mucho 10 órdenes por hora (${x.c.error})`);
// L3: lo mal formado no se lee como orden (ni se reescribe).
const raras = ordenesLib.parsearOrdenes(JSON.stringify({ ordenes: [
  { id: 'o-20261017-0000-ok01', accion: 'informe', pedida: '2026-10-17T10:00:00Z', parametros: {} },
  { id: 'o-20261017-0000-ko01', accion: 'informe', pedida: { toString: 1 } },
  { id: 'o-20261017-0000-ko02', accion: 'informe', pedida: '2026-10-17T10:00:00Z', parametros: 'x' },
  { id: 'o-20261017-0000-ko03', accion: ['informe'], pedida: '2026-10-17T10:00:00Z' },
  { id: 'o-20261017-0000-ko04', accion: 'constructor', pedida: '2026-10-17T10:00:00Z' },
  { id: ['o-20261017-0000-ko05'], accion: 'informe', pedida: '2026-10-17T10:00:00Z' },
  null, 'x', 7,
] }));
ok(raras.length === 1 && raras[0].id === 'o-20261017-0000-ok01', 'L3: las órdenes mal formadas se descartan (solo queda la buena)');
// Vuelta al estado de antes, para lo que sigue.
repo.ramas['ordenes-movil']['ordenes.json'] = ordenesAntes;
repo.ramas['estado-movil']['ordenes-resultado.json'] = resultadosAntes;
gh.vaciarCache();

// ── Plantillas de enlaces ─────────────────────────────────────────────────
const enlaces = await import('../app/api/panel/enlaces/route.js');
const deducirRuta = await import('../app/api/panel/enlaces/deducir/route.js');
// Un guardado por minuto: para seguir probando, se "atrasa" el último.
const RAMA_WEB = 'claude/puerto-santa-maria-restaurants-NxChu';
const atrasar = () => {
  const t = repo.ramas[RAMA_WEB]['data/enlaces.js'];
  repo.ramas[RAMA_WEB]['data/enlaces.js'] = t.replace(/"actualizado": "[^"]+"/, `"actualizado": "${new Date(Date.now() - 61e3).toISOString()}"`);
};
repo.conflictosPendientes = 1;
const plantilla = 'https://bahia.artesiete.es/compra/{pase}/{titulo|slug}';
r = await enlaces.PUT(pedir('/api/panel/enlaces', { metodo: 'PUT', cuerpo: { cine: 'arte-siete-puerto', plantilla } }));
const g = await leer(r);
const guardado = repo.ramas['claude/puerto-santa-maria-restaurants-NxChu']['data/enlaces.js'];
ok(r.status === 200 && g.ok && /^[0-9a-f]{7}$/.test(g.commit) && guardado.includes(plantilla) && guardado.startsWith('//'),
  'guardar una plantilla hace commit de data/enlaces.js (tras un 409, reintenta)');
const { leerDatosEnlaces } = await import('../lib/panel/enlaces.js');
ok(leerDatosEnlaces(guardado).plantillas['arte-siete-puerto'].plantilla === plantilla, 'y se puede volver a leer');
r = await enlaces.PUT(pedir('/api/panel/enlaces', { metodo: 'PUT', cuerpo: { cine: 'arte-siete-puerto', plantilla: null } }));
const pronto = await leer(r);
ok(r.status === 429 && pronto.codigo === 'espera' && pronto.reintentarEn > 0 && pronto.reintentarEn <= 60, `M2: un segundo guardado en menos de un minuto: 429 espera (${pronto.error})`);
atrasar();
r = await enlaces.PUT(pedir('/api/panel/enlaces', { metodo: 'PUT', cuerpo: { cine: 'arte-siete-puerto', plantilla: null } }));
ok(r.status === 200 && !leerDatosEnlaces(repo.ramas['claude/puerto-santa-maria-restaurants-NxChu']['data/enlaces.js']).plantillas['arte-siete-puerto'], 'null vuelve al formato original');
r = await enlaces.PUT(pedir('/api/panel/enlaces', { metodo: 'PUT', cuerpo: { cine: 'arte-siete-puerto', plantilla: 'javascript:{pase}' } }));
ok(r.status === 400, 'una plantilla que no vale: 400');
for (const [cine, p] of [['arte-siete-puerto', 'https://entradas-artesiete-pago.example/checkout?pase={pase}'], ['arte-siete-puerto', 'https://bahia.artesiete.es@evil.example/{pase}'],
  ['cinesur-bahia-cadiz', '{enlace}'], ['constructor', 'https://evil.example/'], ['__proto__', null], ['toString', null]]) {
  r = await enlaces.PUT(pedir('/api/panel/enlaces', { metodo: 'PUT', cuerpo: { cine, plantilla: p } }));
  if (r.status !== 400) ok(false, `H1/L2: guarda ${cine} → ${p} (${r.status})`);
}
ok(!/evil|constructor|__proto__|toString/.test(repo.ramas[RAMA_WEB]['data/enlaces.js']), 'H1/L2: ni otras webs ni cines inventados llegan a data/enlaces.js');
r = await deducirRuta.POST(pedir('/api/panel/enlaces/deducir', { metodo: 'POST', cuerpo: { cine: 'arte-siete-puerto', sesion: 'x', enlaceBueno: 'https://pago-falso.example/checkout?pase=1' } }));
ok(r.status === 400 && /web del cine/.test((await leer(r)).error), 'H1: deducir no acepta un enlace bueno de otra web');
r = await deducirRuta.POST(pedir('/api/panel/enlaces/deducir', { metodo: 'POST', cuerpo: { cine: 'constructor', enlaceBueno: 'https://bahia.artesiete.es/x' } }));
ok(r.status === 400, 'L2: ni un cine «constructor»');
atrasar();
repo.conflictosPendientes = 5;
r = await enlaces.PUT(pedir('/api/panel/enlaces', { metodo: 'PUT', cuerpo: { cine: 'arte-siete-puerto', plantilla } }));
ok(r.status === 409 && (await leer(r)).codigo === 'conflicto', 'si GitHub cambia tres veces seguidas, 409 conflicto');
repo.conflictosPendientes = 0;

// ── Avisos ────────────────────────────────────────────────────────────────
const vigilar = await import('../app/api/panel/avisos/vigilar/route.js');
const prueba = await import('../app/api/panel/avisos/prueba/route.js');
r = await vigilar.POST(pedir('/api/panel/avisos/vigilar', { metodo: 'POST', cuerpo: {} }));
ok(r.status === 202 && repo.dispatches.at(-1)?.workflow === 'vigilante-movil.yml' && repo.dispatches.at(-1).inputs.prueba === 'false', 'vigilar: lanza el workflow del vigilante');
r = await prueba.POST(pedir('/api/panel/avisos/prueba', { metodo: 'POST', cuerpo: {} }));
ok(r.status === 202 && repo.dispatches.at(-1).inputs.prueba === 'true' && repo.dispatches.at(-1).ref === 'claude/puerto-santa-maria-restaurants-NxChu', 'prueba: con prueba=true, en la rama de la web');

// ── Estado ────────────────────────────────────────────────────────────────
const estado = await import('../app/api/panel/estado/route.js');
gh.vaciarCache();
const errLog = console.error;
r = await estado.GET(pedir('/api/panel/estado'));
const est = await leer(r);
ok(r.status === 200 && est.github.escritura === true && est.github.lectura === 'api', 'estado: con token, escritura y lectura por la API');
ok(est.movil.vivo === true && est.movil.latidoHace >= 100 && est.movil.latidoHace < 200 && est.movil.informe.resultado === 'sin recogida: no tocaba', `estado.movil: vivo, latido hace ${est.movil.latidoHace} s`);
ok(est.movil.ultimasVueltas.length === 2 && est.movil.ultimasVueltas[0].resultado === 'b', 'vueltas de la más reciente a la más antigua, saltando líneas rotas');
ok(est.movil.ordenes.pendientes.some((o) => o.id === o1.id) && !est.movil.ordenes.pendientes.some((o) => o.id === o2.id) && est.movil.ordenes.resultados[0].id === o2.id,
  'órdenes pendientes y resultados separados');
ok(est.movil.ficheros['estado.json'] && !est.movil.ficheros['recogidas.jsonl'], 'dice qué ficheros del móvil hay');
ok(est.avisos.abiertos.length === 1 && est.avisos.abiertos[0].nivel === 'critico' && est.avisos.recientes.length === 1, 'avisos abiertos (sin PRs) y cerrados recientes');
ok(Array.isArray(est.servidor.cines) && est.servidor.cines.length === 4 && est.servidor.claves && typeof est.servidor.claves.tmdb === 'boolean',
  `servidor: los 4 cines (${est.servidor.cines.map((c) => `${c.id}:${c.fuente}/${c.origen}`).join(', ')})`);
ok(est.servidor.cines.every((c) => ['directo', 'movil', 'copia', 'memoria', 'ejemplo', null].includes(c.origen)), 'cada cine dice de dónde salen sus datos');
r = await estado.GET(pedir('/api/panel/estado?partes=avisos'));
const solo = await leer(r);
ok(solo.avisos && !solo.movil && !solo.servidor && solo.github, '?partes= pide solo lo que hace falta');

// Una parte que falla no tumba las demás.
gh.usarFetch(async (url, o) => (String(url).includes('/issues') ? resp(500, { message: 'boom' }) : githubFalso(url, o)), { PANEL_GITHUB_TOKEN: TOKEN });
r = await estado.GET(pedir('/api/panel/estado?partes=movil,avisos'));
const parcial = await leer(r);
ok(r.status === 200 && parcial.avisos.error && parcial.movil.informe, 'si GitHub falla en los avisos, el estado del móvil llega igual');

// ── Sin token: solo lectura ───────────────────────────────────────────────
sinToken();
peticiones.length = 0;
r = await estado.GET(pedir('/api/panel/estado?partes=movil'));
const lectura = await leer(r);
ok(lectura.github.escritura === false && lectura.github.lectura === 'publica' && lectura.github.aviso, 'sin token: estado en solo lectura, y lo explica');
ok(lectura.movil.informe?.resultado === 'sin recogida: no tocaba' && peticiones.some((p) => p.host === 'raw.githubusercontent.com'), 'y lee lo del móvil de lo público');
ok(peticiones.every((p) => !p.auth), 'sin mandar ningún token');
for (const [nombre, f] of [
  ['orden', () => orden.POST(pedir('/api/panel/orden', { metodo: 'POST', cuerpo: { accion: 'informe' } }))],
  ['enlaces', () => enlaces.PUT(pedir('/api/panel/enlaces', { metodo: 'PUT', cuerpo: { cine: 'arte-siete-puerto', plantilla } }))],
  ['vigilar', () => vigilar.POST(pedir('/api/panel/avisos/vigilar', { metodo: 'POST', cuerpo: {} }))],
]) {
  r = await f();
  const c = await leer(r);
  ok(r.status === 403 && c.codigo === 'solo-lectura' && /PANEL_GITHUB_TOKEN/.test(c.error), `sin token, ${nombre}: 403 solo lectura`);
}

// ── Token: nunca en una respuesta; sin sesión, nada ───────────────────────
conToken();
gh.usarFetch(async (url, o) => (String(url).includes('/contents/') && o.method === 'PUT' ? resp(401, { message: 'Bad credentials' }) : githubFalso(url, o)), { PANEL_GITHUB_TOKEN: TOKEN });
atrasar();
r = await enlaces.PUT(pedir('/api/panel/enlaces', { metodo: 'PUT', cuerpo: { cine: 'arte-siete-puerto', plantilla } }));
ok(r.status === 502 && /token/.test((await leer(r)).error), 'un token caducado se explica');
ok(textos.every((t) => !t.includes(TOKEN) && !t.includes('github_pat_')), `el token no aparece en ninguna de las ${textos.length} respuestas`);
r = await estado.GET(new Request('https://cine.example/api/panel/estado', { headers: { host: 'cine.example' } }));
ok(r.status === 404, 'sin cookie, estado: 404');
r = await orden.POST(new Request('https://cine.example/api/panel/orden', { method: 'POST', headers: { host: 'cine.example', origin: 'https://malo.example', cookie: `panel=${cookie}` }, body: '{"accion":"informe"}' }));
ok(r.status === 404, 'con cookie pero desde otro sitio, orden: 404');

console.error = errLog;
process.stdout.write(fallos ? `\n${fallos} FALLOS\n` : '\nTodas pasan\n');
process.exit(fallos ? 1 : 0);
