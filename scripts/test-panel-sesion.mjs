// Comprueba la puerta del panel de control (lib/panel/sesion.js, middleware.js
// y la segunda comprobación de las rutas, lib/panel/http.js):
//
//  · la cookie firmada vale, y deja de valer si se toca, caduca o cambia la clave
//  · la clave se compara en tiempo constante (mismo número de lecturas acierte
//    o falle, falle donde falle)
//  · sin sesión, todo lo del panel es "no existe" (404), también sin
//    PANEL_CLAVE, y solo /panel/entrar y su POST quedan abiertos
//  · CSRF: ninguna escritura desde otro origen
//  · (revisión de seguridad) L4: sesiones de 14 días y PANEL_SESIONES_DESDE
//    para cerrarlas todas; L5: el panel no se deja meter en un marco
//
//   node scripts/test-panel-sesion.mjs
import { registerHooks } from 'node:module';

// middleware.js importa 'next/server' (así lo resuelve Next); node a secas
// necesita la extensión. Y '@/…' es el alias del proyecto.
const RAIZ = new URL('../', import.meta.url);
registerHooks({
  resolve(esp, ctx, siguiente) {
    if (esp === 'next/server') return siguiente('next/server.js', ctx);
    if (esp.startsWith('@/')) return siguiente(new URL(esp.slice(2), RAIZ).href, ctx);
    return siguiente(esp, ctx);
  },
});

const S = await import('../lib/panel/sesion.js');
const { NextRequest } = await import('next/server.js');

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'FALLO'} ${m}`); if (!c) fallos++; };

const CLAVE = 'una-clave-larga-de-prueba-1234';
const ahora = Date.parse('2026-10-17T12:00:00Z');

// ── Cookie ────────────────────────────────────────────────────────────────
const v = await S.crearValorCookie(CLAVE, ahora);
ok(/^v1\.\d+\.[A-Za-z0-9_-]{43}$/.test(v), `forma de la cookie: ${v.slice(0, 20)}…`);
ok(await S.cookieValida(v, CLAVE, ahora), 'una cookie recién hecha vale');
ok(await S.cookieValida(v, CLAVE, ahora + 13 * 86400e3), 'vale a los 13 días');
ok(!(await S.cookieValida(v, CLAVE, ahora + 14 * 86400e3 + 1000)), 'L4: caduca a los 14 días');
ok(S.DURACION_S === 14 * 86400 && /Max-Age=1209600/.test(S.cabeceraCookie(v)), 'L4: la cookie dice 14 días');
// L4: cerrar todas las sesiones por fecha.
ok(!(await S.cookieValida(v, CLAVE, ahora + 1000, ahora + 500)), 'L4: una cookie emitida antes de PANEL_SESIONES_DESDE ya no vale');
ok(await S.cookieValida(v, CLAVE, ahora + 1000, ahora - 500), 'L4: una emitida después, sí');
ok(S.sesionesDesde({ PANEL_SESIONES_DESDE: '2026-10-20T18:00:00Z' }) === Date.parse('2026-10-20T18:00:00Z')
  && S.sesionesDesde({}) === null && S.sesionesDesde({ PANEL_SESIONES_DESDE: 'mañana' }) === null, 'L4: PANEL_SESIONES_DESDE se lee como fecha ISO (si no es fecha, no cuenta)');
const vieja30 = await S.crearValorCookie(CLAVE, ahora);
const exp30 = Number(vieja30.split('.')[1]) + 16 * 86400;
ok(!(await S.cookieValida(`v1.${exp30}.${vieja30.split('.')[2]}`, CLAVE, ahora)), 'una cookie de la versión de 30 días no vale');
ok(!(await S.cookieValida(v, 'otra-clave-larga-de-prueba-12', ahora)), 'cambiar PANEL_CLAVE invalida todas las cookies');
const [, exp, firma] = v.split('.');
const cambiaUno = (s, i) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
ok(!(await S.cookieValida(`v1.${exp}.${cambiaUno(firma, 5)}`, CLAVE, ahora)), 'una firma tocada no vale');
ok(!(await S.cookieValida(`v1.${Number(exp) + 3600}.${firma}`, CLAVE, ahora)), 'alargar la caducidad sin firmar no vale');
const otraFirma = (await S.crearValorCookie(CLAVE, ahora + 5000e3)).split('.')[2];
ok(!(await S.cookieValida(`v1.${exp}.${otraFirma}`, CLAVE, ahora)), 'ni con la firma de otra caducidad');
const lejana = await S.crearValorCookie(CLAVE, ahora + 400 * 86400e3);
ok(!(await S.cookieValida(lejana, CLAVE, ahora)), 'una caducidad imposible (más allá de 30 días) no vale');
for (const malo of ['', 'v1', 'v1..', 'v2.1792240000.' + firma, `v1.${exp}.${firma}=`, `v1.${exp}.${firma}.x`, 'x'.repeat(200), null, undefined, 42]) {
  if (await S.cookieValida(malo, CLAVE, ahora)) ok(false, `una cookie mal formada vale: ${String(malo).slice(0, 30)}`);
}
ok(true, 'las cookies mal formadas no valen');
ok(!(await S.cookieValida(v, null, ahora)), 'sin clave en el servidor no vale ninguna');

// ── Clave ─────────────────────────────────────────────────────────────────
ok(await S.claveCorrecta(CLAVE, CLAVE), 'la clave buena entra');
ok(!(await S.claveCorrecta(CLAVE + 'x', CLAVE)), 'una de más no');
ok(!(await S.claveCorrecta('', CLAVE)), 'vacía no');
ok(!(await S.claveCorrecta(undefined, CLAVE)), 'sin clave no');
ok(!(await S.claveCorrecta(CLAVE, null)), 'sin clave en el servidor, ninguna');
ok(S.claveDelServidor({ PANEL_CLAVE: 'corta' }) === null, 'una PANEL_CLAVE corta (< 16) es como no tenerla');
ok(S.claveDelServidor({ PANEL_CLAVE: CLAVE }) === CLAVE, 'una larga, sí');
ok(S.claveDelServidor({}) === null, 'sin PANEL_CLAVE, nada');

// Tiempo constante: igualesTiempoConstante lee TODOS los bytes siempre, sin
// salir antes, coincidan o no y difieran donde difieran.
const contador = (arr) => { const c = { n: 0 }; return [new Proxy(arr, { get(t, k) { if (/^\d+$/.test(String(k))) c.n++; return t[k]; } }), c]; };
const lecturas = (a, b) => { const [pa, ca] = contador(a); const [pb, cb] = contador(b); S.igualesTiempoConstante(pa, pb); return ca.n + cb.n; };
const base = new Uint8Array(32).fill(7);
const alPrincipio = base.slice(); alPrincipio[0] = 1;
const alFinal = base.slice(); alFinal[31] = 1;
const n0 = lecturas(base, base.slice()), n1 = lecturas(base, alPrincipio), n2 = lecturas(base, alFinal);
ok(n0 === 64 && n1 === 64 && n2 === 64, `comparación en tiempo constante (${n0}/${n1}/${n2} lecturas)`);
ok(S.igualesTiempoConstante(base, base.slice()) && !S.igualesTiempoConstante(base, alFinal), 'y compara bien');

// ── Cabeceras ─────────────────────────────────────────────────────────────
ok(S.leerCookie(`otra=1; panel=${v}; x=2`) === v && S.leerCookie('panelx=1') === null && S.leerCookie(null) === null, 'lee la cookie panel de la cabecera');
const sc = S.cabeceraCookie(v);
ok(/HttpOnly/.test(sc) && /SameSite=Strict/.test(sc) && /Secure/.test(sc) && /Path=\//.test(sc) && /Max-Age=1209600/.test(sc), `Set-Cookie: ${sc.replace(v, '…')}`);
ok(/Max-Age=0/.test(S.cabeceraCookie('', { borrar: true })), 'salir borra la cookie');
const H = (o) => new Headers(o);
const url = 'https://cine.example/api/panel/orden';
ok(S.mismoOrigen(H({ origin: 'https://cine.example', host: 'cine.example' }), url), 'mismo origen: sí');
ok(!S.mismoOrigen(H({ origin: 'https://malo.example', host: 'cine.example' }), url), 'otro origen: no');
ok(!S.mismoOrigen(H({ 'sec-fetch-site': 'cross-site', origin: 'https://cine.example', host: 'cine.example' }), url), 'Sec-Fetch-Site cross-site: no');
ok(!S.mismoOrigen(H({ origin: 'null', host: 'cine.example' }), url), 'Origin null: no');
ok(!S.mismoOrigen(H({ host: 'cine.example' }), url), 'sin Origin ni Sec-Fetch-Site: no');
ok(S.mismoOrigen(H({ 'sec-fetch-site': 'same-origin', host: 'cine.example' }), url), 'solo Sec-Fetch-Site same-origin: sí');

// ── Middleware: la puerta ─────────────────────────────────────────────────
const { middleware } = await import('../middleware.js');
const NO = '/_no-existe';
async function pedir(ruta, { metodo = 'GET', cookie = null, origen = 'https://cine.example', sfs = null } = {}) {
  const h = { host: 'cine.example' };
  if (cookie) h.cookie = `panel=${cookie}`;
  if (metodo !== 'GET' && origen) h.origin = origen;
  if (sfs) h['sec-fetch-site'] = sfs;
  const r = await middleware(new NextRequest(`https://cine.example${ruta}`, { method: metodo, headers: h }));
  const reescrita = r.headers.get('x-middleware-rewrite');
  if (reescrita) return { tipo: new URL(reescrita).pathname === NO ? '404' : 'otra', r };
  if (r.headers.get('x-middleware-next')) return { tipo: 'sigue', r };
  if (r.status >= 300 && r.status < 400) return { tipo: `redirige ${r.status} ${new URL(r.headers.get('location')).pathname}`, r };
  return { tipo: `?${r.status}`, r };
}

delete process.env.PANEL_CLAVE;
let todo404 = true;
for (const [ruta, metodo] of [['/panel', 'GET'], ['/panel/entrar', 'GET'], ['/api/panel/entrar', 'POST'], ['/api/panel/estado', 'GET']]) {
  if ((await pedir(ruta, { metodo })).tipo !== '404') todo404 = false;
}
ok(todo404, 'sin PANEL_CLAVE, todo el panel es 404 (también la entrada)');

process.env.PANEL_CLAVE = CLAVE;
const buena = await S.crearValorCookie(CLAVE);
const casos = [
  ['/panel', {}, '404', 'sin sesión, /panel no existe'],
  ['/panel/', {}, '404', 'ni /panel/'],
  ['/panel/movil', {}, '404', 'ni sus páginas'],
  ['/api/panel/estado', {}, '404', 'ni la API'],
  ['/api/panel/orden', { metodo: 'POST' }, '404', 'ni sus POST'],
  ['/panel/entrar', {}, 'sigue', 'la caja de la clave sí está'],
  ['/api/panel/entrar', { metodo: 'POST' }, 'sigue', 'y su POST'],
  ['/api/panel/entrar', {}, '404', 'pero no un GET a /api/panel/entrar'],
  ['/api/panel/entrar', { metodo: 'POST', origen: 'https://malo.example' }, '404', 'ni un POST de entrada desde otro sitio'],
  ['/panel', { cookie: buena }, 'sigue', 'con sesión, /panel sí'],
  ['/api/panel/estado', { cookie: buena }, 'sigue', 'y la API'],
  ['/api/panel/orden', { metodo: 'POST', cookie: buena }, 'sigue', 'y sus POST desde el propio panel'],
  ['/api/panel/orden', { metodo: 'POST', cookie: buena, origen: 'https://malo.example' }, '404', 'CSRF: con sesión, un POST desde otro origen no'],
  ['/api/panel/orden', { metodo: 'POST', cookie: buena, sfs: 'cross-site' }, '404', 'CSRF: ni con Sec-Fetch-Site cross-site'],
  ['/api/panel/enlaces', { metodo: 'PUT', cookie: buena, origen: null }, '404', 'CSRF: ni un PUT sin Origin'],
  ['/panel', { cookie: cambiaUno(buena, buena.length - 3) }, '404', 'una cookie tocada es como no tener'],
  ['/panel/entrar', { cookie: buena }, 'redirige 303 /panel', 'ya dentro, /panel/entrar lleva al panel'],
];
for (const [ruta, opc, esperado, texto] of casos) {
  const { tipo } = await pedir(ruta, opc);
  ok(tipo === esperado, `${texto} (${tipo})`);
}
const { r: conSesion } = await pedir('/panel', { cookie: buena });
ok(conSesion.headers.get('x-robots-tag') === 'noindex, nofollow', 'con sesión: X-Robots-Tag noindex, nofollow');
ok(conSesion.headers.get('x-frame-options') === 'DENY' && conSesion.headers.get('content-security-policy') === "frame-ancestors 'none'",
  "L5: X-Frame-Options DENY y frame-ancestors 'none'");
const { r: entrada } = await pedir('/panel/entrar');
ok(entrada.headers.get('x-frame-options') === 'DENY', 'L5: también en la caja de la clave');
const { r: sinSesion } = await pedir('/panel');
ok(!sinSesion.headers.get('x-robots-tag'), 'sin sesión, ni esa cabecera: igual que cualquier URL que no existe');
process.env.PANEL_SESIONES_DESDE = new Date(Date.now() + 60e3).toISOString();
ok((await pedir('/panel', { cookie: buena })).tipo === '404', 'L4: con PANEL_SESIONES_DESDE posterior, el middleware ya no deja pasar esa cookie');
delete process.env.PANEL_SESIONES_DESDE;

// ── Rutas: segunda comprobación (por si el middleware no corriera) ────────
const { ruta, ErrorPanel } = await import('../lib/panel/http.js');
let llamadas = 0;
const manejador = ruta(async () => { llamadas++; return new Response('{}', { status: 200 }); });
const peticion = (opc = {}) => new Request('https://cine.example/api/panel/estado', {
  method: opc.metodo || 'GET',
  headers: { host: 'cine.example', ...(opc.cookie ? { cookie: `panel=${opc.cookie}` } : {}), ...(opc.origen ? { origin: opc.origen } : {}) },
});
let r = await manejador(peticion());
ok(r.status === 404 && llamadas === 0 && !/json/.test(r.headers.get('content-type')), 'una ruta sin sesión responde 404 sin JSON y no ejecuta nada');
r = await manejador(peticion({ cookie: buena }));
ok(r.status === 200 && llamadas === 1, 'con sesión, sí');
r = await manejador(peticion({ cookie: buena, metodo: 'POST', origen: 'https://malo.example' }));
ok(r.status === 404 && llamadas === 1, 'y la ruta también frena un POST de otro origen');
const conError = ruta(async () => { throw new ErrorPanel(403, 'solo-lectura', 'Solo lectura.'); });
r = await conError(peticion({ cookie: buena }));
const cuerpo = await r.json();
ok(r.status === 403 && cuerpo.codigo === 'solo-lectura' && r.headers.get('cache-control') === 'no-store' && r.headers.get('x-robots-tag') === 'noindex, nofollow',
  'los errores salen como {error, codigo}, sin caché y con noindex');
ok(r.headers.get('x-frame-options') === 'DENY' && /frame-ancestors 'none'/.test(r.headers.get('content-security-policy')), 'L5: y las respuestas de la API tampoco se enmarcan');
process.env.PANEL_SESIONES_DESDE = new Date(Date.now() + 60e3).toISOString();
r = await manejador(peticion({ cookie: buena }));
ok(r.status === 404, 'L4: la ruta también rechaza una cookie anterior a PANEL_SESIONES_DESDE');
delete process.env.PANEL_SESIONES_DESDE;
const roto = ruta(async () => { throw new Error('detalle interno con https://api.github.com/token=ghp_x'); });
const errLog = console.error; console.error = () => {};
r = await roto(peticion({ cookie: buena }));
console.error = errLog;
ok(r.status === 500 && !(await r.text()).includes('ghp_'), 'un fallo interno no enseña su detalle');
delete process.env.PANEL_CLAVE;
r = await manejador(peticion({ cookie: buena }));
ok(r.status === 404, 'sin PANEL_CLAVE, la ruta tampoco existe aunque la cookie fuera buena');

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas pasan');
process.exit(fallos ? 1 : 0);
