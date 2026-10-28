// Comprueba la parte del visor de LoL del panel (lib/panel/lol.js y su
// valoración en components/panel/datos.js) contra una web del visor y un
// GitHub simulados en memoria (sin red):
//
//  · sin LOL_URL ni token: no se pide nada y no cuenta como fallo
//  · LOL_URL que no es https: no se usa, y se dice por qué
//  · la web del visor: estado y agenda resumidos (directo, próximos,
//    terminados), textos recortados, ids raros fuera
//  · el repositorio: ejecuciones de las tres tareas y últimos cambios; sin
//    acceso, un error que dice qué hacer, y el token nunca en la respuesta
//  · lanzar: solo tareas de la lista, sin token 403, en marcha 409, lanzada a
//    mano hace poco 429, y si todo va bien un dispatch a la rama del visor
//  · valoración: web caída es fallo; lolesports.com caído con copia, aviso;
//    tres respaldos fallidos seguidos, fallo
//
//   node scripts/test-panel-lol.mjs
import { registerHooks } from 'node:module';

const RAIZ = new URL('../', import.meta.url);
registerHooks({
  resolve(esp, ctx, siguiente) {
    if (esp.startsWith('@/')) return siguiente(new URL(esp.slice(2), RAIZ).href, ctx);
    return siguiente(esp, ctx);
  },
});

const lol = await import('../lib/panel/lol.js');
const datos = await import('../components/panel/datos.js');

let fallos = 0;
const ok = (c, m) => { process.stdout.write(`${c ? 'ok   ' : 'FALLO'} ${m}\n`); if (!c) fallos++; };

const TOKEN = 'github_pat_LOLSECRETO0123456789abcdefghij';
const URL_VISOR = 'https://visor-prueba.vercel.app';
const ahora = Date.now();
const iso = (msAtras) => new Date(ahora - msAtras).toISOString();
const MIN = 60e3, H = 3600e3;

const resp = (status, cuerpo) => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

// ── La web del visor, de mentira ──────────────────────────────────────────
const estadoVisor = {
  generado: iso(0),
  fuentes: {
    agenda: { ultimaOk: iso(2 * MIN), ultimoError: null, ultimoErrorEn: null, ultimaFuente: 'directo', via: 'gql' },
    directo: { ultimaOk: iso(30 * MIN), ultimoError: 'HTTP 503 de lolesports.com', ultimoErrorEn: iso(MIN), ultimaFuente: 'memoria' },
    'raro con espacios': { ultimaOk: iso(0) },
  },
  respaldo: {
    agenda: { generado: iso(H), antiguedadSeg: 3600 },
    ligas: { generado: iso(2 * H), antiguedadSeg: 7200 },
    torneos: { worlds: { generado: iso(H), antiguedadSeg: 3600, torneo: 'Worlds 2026' }, lec: null },
    ultimaRecogida: { generado: iso(H), origen: 'api', agenda: 'ok' },
  },
  consultas: { manifiesto: { origen: 'codigo', error: null } },
};
const equipo = (codigo, victorias, resultado = null) => ({ id: '1', codigo, nombre: `Equipo ${codigo}`, victorias, resultado });
const agendaVisor = {
  generado: iso(0), fuente: 'directo', antiguedadSeg: 5,
  partidos: [
    { id: '111', inicio: iso(H), estado: 'directo', liga: { slug: 'worlds', nombre: 'Worlds' }, mejorDe: 5, equipos: [equipo('T1', 1), equipo('GEN', 0)] },
    { id: '222', inicio: iso(-2 * H), estado: 'programado', liga: { slug: 'worlds', nombre: 'Worlds' }, mejorDe: 5, equipos: [equipo('G2', 0), equipo('BLG', 0)] },
    { id: '333', inicio: iso(5 * H), estado: 'terminado', liga: { slug: 'worlds', nombre: 'Worlds' }, mejorDe: 5, equipos: [equipo('KC', 3, 'gana'), equipo('TL', 1, 'pierde')] },
    { id: '444', inicio: iso(3 * 24 * H), estado: 'terminado', liga: { slug: 'lec' }, equipos: [equipo('A', 2), equipo('B', 0)] },
    { id: 'javascript:alert(1)', inicio: iso(-H), estado: 'programado', liga: { nombre: 'X'.repeat(500) }, equipos: [equipo('C', 0), equipo('D', 0)] },
    { id: '555', inicio: 'no es fecha', estado: 'programado', equipos: [] },
    { id: '666', inicio: iso(0), estado: 'inventado', equipos: [] },
  ],
};

// ── GitHub, de mentira ────────────────────────────────────────────────────
const run = (id, conclusion, msAtras, evento = 'schedule', estado = 'completed') => ({
  id, status: estado, conclusion: estado === 'completed' ? conclusion : null, event: evento,
  created_at: iso(msAtras), updated_at: iso(msAtras - MIN), html_url: `https://github.com/jaimeas98/Trabajo-IA/actions/runs/${id}`,
});
let runs = {
  'respaldo.yml': [run(5, 'success', 30 * MIN), run(4, 'failure', 150 * MIN)],
  'cuerpo-tecnico.yml': [run(9, 'success', 10 * H)],
  'captura.yml': [run(12, 'success', 2 * 24 * H, 'workflow_dispatch')],
};
let peticiones = [];
let dispatches = [];
let accesoRepo = true;
let webCaida = false;

async function falso(url, opc = {}) {
  const u = new URL(url);
  peticiones.push({ host: u.host, ruta: u.pathname + u.search, metodo: opc.method || 'GET', auth: opc.headers?.Authorization ?? null });
  if (u.origin === URL_VISOR) {
    if (webCaida) throw new TypeError('fetch failed');
    if (u.pathname === '/api/estado') return resp(200, estadoVisor);
    if (u.pathname === '/api/agenda') return resp(200, agendaVisor);
    return resp(404, { error: 'no' });
  }
  if (u.host !== 'api.github.com') throw new Error('sin red en la prueba');
  if (opc.headers?.Authorization !== `Bearer ${TOKEN}`) return resp(401, { message: 'Bad credentials' });
  if (!accesoRepo) return resp(404, { message: 'Not Found' });
  let m;
  if ((m = u.pathname.match(/^\/repos\/jaimeas98\/Trabajo-IA\/actions\/workflows\/([\w.-]+)\/runs$/))) {
    return resp(200, { workflow_runs: runs[m[1]] ?? [] });
  }
  if ((m = u.pathname.match(/^\/repos\/jaimeas98\/Trabajo-IA\/actions\/workflows\/([\w.-]+)\/dispatches$/)) && opc.method === 'POST') {
    dispatches.push({ fichero: m[1], cuerpo: JSON.parse(opc.body) });
    return new Response(null, { status: 204 });
  }
  if (u.pathname === '/repos/jaimeas98/Trabajo-IA/commits') {
    return resp(200, [
      { sha: 'abcdef1234567890', html_url: 'https://github.com/jaimeas98/Trabajo-IA/commit/abcdef1', commit: { message: 'Respaldo de datos de LoL Esports\n\nCuerpo largo', committer: { date: iso(H) }, author: { name: 'Alguien', email: 'alguien@example.com' } } },
      { sha: 'fedcba', html_url: 'javascript:alert(1)', commit: { message: 'Otro', committer: { date: iso(2 * H) } } },
    ]);
  }
  return resp(404, { message: 'Not Found' });
}

// ── 1. Sin configurar ─────────────────────────────────────────────────────
lol.usarFetchLol(falso, {});
peticiones = [];
let e = await lol.estadoLol();
ok(peticiones.length === 0, 'sin LOL_URL ni token no se pide nada');
ok(e.configurado.web === false && e.configurado.github === false, 'sin configurar: configurado.web y .github a false');
ok(e.web.error === null, 'sin LOL_URL no hay error, solo falta conectarlo');
let n = datos.normalizar({ lol: e }, ahora);
let v = datos.valorar(n, ahora);
ok(v.lol.every((x) => x.nivel === 'nada'), 'sin configurar, todo lo del visor es "sin datos" (no cuenta en el veredicto)');
ok(v.lol[0].detalle.includes('LOL_URL'), 'y dice que falta LOL_URL');

lol.usarFetchLol(falso, { LOL_URL: 'http://visor-prueba.vercel.app' });
e = await lol.estadoLol();
ok(e.configurado.web === false && /https/.test(e.web.error ?? ''), 'LOL_URL sin https no se usa y se dice por qué');

lol.usarFetchLol(falso, { LOL_URL: `${URL_VISOR}/algo/` });
ok(lol.urlVisor() === URL_VISOR, 'de LOL_URL solo se queda el origen (sin ruta ni barra final)');

// ── 2. Web y repositorio ──────────────────────────────────────────────────
lol.usarFetchLol(falso, { LOL_URL: URL_VISOR, PANEL_GITHUB_TOKEN: TOKEN });
peticiones = [];
e = await lol.estadoLol();
ok(e.configurado.web && e.configurado.github && !e.configurado.tokenPropio, 'con LOL_URL y PANEL_GITHUB_TOKEN: conectado, con el token del panel');
ok(e.web.responde === true && e.web.error === null, 'la web del visor responde');
ok(Object.keys(e.web.estado.fuentes).join(',') === 'agenda,directo', 'fuentes: solo las de clave válida');
ok(!('via' in e.web.estado.fuentes.agenda), 'fuentes: solo los campos conocidos');
ok(e.web.estado.respaldo.torneos.worlds.torneo === 'Worlds 2026' && e.web.estado.respaldo.torneos.lec === null, 'respaldo por torneo resumido');
const ag = e.web.agenda;
ok(ag.directo.length === 1 && ag.directo[0].id === '111', 'agenda: el directo');
ok(ag.proximos.map((p) => p.id).join(',') === ',222', 'agenda: el próximo, y uno con id raro se queda sin id (no sale como enlace)');
ok(ag.proximos[0]?.id === null && ag.proximos[0].liga.length <= 60, 'agenda: textos recortados');
ok(ag.terminados.map((p) => p.id).join(',') === '333', 'agenda: terminados de las últimas 18 h, no el de hace 3 días');
ok(![...ag.directo, ...ag.proximos, ...ag.terminados].some((p) => p.id === '555' || p.id === '666'), 'agenda: sin fecha o con estado raro, fuera');
ok(/desde=\d{4}-\d{2}-\d{2}&hasta=\d{4}-\d{2}-\d{2}/.test(peticiones.find((p) => p.ruta.startsWith('/api/agenda'))?.ruta ?? ''), 'la agenda se pide de hoy a mañana');
ok(e.repo.tareas.respaldo.length === 2 && e.repo.tareas['cuerpo-tecnico'].length === 1, 'ejecuciones de las tareas');
ok(e.repo.cambios[0].mensaje === 'Respaldo de datos de LoL Esports' && e.repo.cambios[0].sha === 'abcdef1', 'cambios: primera línea y sha corto');
ok(e.repo.cambios[1].url === null, 'cambios: solo enlaces de github.com');
const textoE = JSON.stringify(e);
ok(!textoE.includes(TOKEN) && !textoE.includes('alguien@example.com') && !textoE.includes('Alguien'), 'ni el token ni autores ni correos en la respuesta');
ok(peticiones.filter((p) => p.host === 'visor-prueba.vercel.app').every((p) => p.auth === null), 'a la web del visor no se le manda el token');

peticiones = [];
await lol.estadoLol();
ok(peticiones.length === 0, 'la segunda lectura en menos de un minuto sale de la caché');

n = datos.normalizar({ lol: e }, ahora);
v = datos.valorar(n, ahora);
const [vWeb, vApi, vResp, vCuerpo] = v.lol;
ok(vWeb.nivel === 'bien', 'valoración: la web responde → bien');
ok(vApi.nivel === 'aviso' && vApi.valor.includes('1 de 2'), 'valoración: una fuente de lolesports.com falla → aviso');
ok(vResp.nivel === 'bien', 'valoración: respaldo bien hace 30 min → bien');
ok(vCuerpo.nivel === 'bien', 'valoración: cuerpo técnico bien');
ok(v.porSeccion.lol === 'aviso', 'la pestaña LoL lleva el peor nivel');
ok(datos.textoEstado(n, v, ahora).includes('Visor de LoL') && datos.textoEstado(n, v, ahora).includes('T1 1-0 GEN'), '"Copiar el estado" lleva el visor y lo que está en directo');

// ── 3. Sin acceso al repositorio y web caída ──────────────────────────────
accesoRepo = false;
webCaida = true;
lol.usarFetchLol(falso, { LOL_URL: URL_VISOR, PANEL_GITHUB_TOKEN: TOKEN });
e = await lol.estadoLol();
ok(e.web.responde === false && /conectar/.test(e.web.error), 'web caída: no responde, y se dice');
ok(/PANEL_GITHUB_TOKEN no tiene acceso a jaimeas98\/Trabajo-IA/.test(e.repo.error ?? ''), 'sin acceso: el error dice que se añada el repositorio al token');
ok((e.repo.error.match(/no tiene acceso/g) ?? []).length === 1, 'el mismo error de las cuatro peticiones se dice una vez');
ok(!JSON.stringify(e).includes(TOKEN), 'tampoco aquí sale el token');
n = datos.normalizar({ lol: e }, ahora);
v = datos.valorar(n, ahora);
ok(v.lol[0].nivel === 'fallo', 'valoración: web caída → fallo');
ok(v.lol[2].nivel === 'aviso', 'valoración: token sin acceso al repositorio → aviso (se arregla en un minuto)');

lol.usarFetchLol(falso, { LOL_URL: URL_VISOR, LOL_GITHUB_TOKEN: TOKEN, PANEL_GITHUB_TOKEN: 'otro' });
e = await lol.estadoLol();
ok(e.configurado.tokenPropio && /LOL_GITHUB_TOKEN no tiene acceso/.test(e.repo.error ?? ''), 'con LOL_GITHUB_TOKEN se usa ese, y el error lo nombra');
accesoRepo = true;
webCaida = false;

// ── 4. Respaldo fallando ──────────────────────────────────────────────────
const conRuns = (r) => datos.valorarTareaLol(datos.normalizarLol({ configurado: { web: true, github: true }, web: {}, repo: { tareas: { respaldo: r } } }), 'respaldo', ahora);
const resumen = (x) => ({ id: x.id, estado: x.status, conclusion: x.conclusion, evento: x.event, creada: x.created_at, actualizada: x.updated_at, url: x.html_url });
ok(conRuns([run(3, 'failure', 10 * MIN), run(2, 'success', 3 * H)].map(resumen)).nivel === 'aviso', 'respaldo: una fallida → aviso');
ok(conRuns([run(3, 'failure', 10 * MIN), run(2, 'failure', 2 * H), run(1, 'failure', 4 * H)].map(resumen)).nivel === 'fallo', 'respaldo: tres fallidas seguidas → fallo');
ok(conRuns([run(3, 'success', 10 * H)].map(resumen)).nivel === 'aviso', 'respaldo: la última buena de hace 10 h → aviso');
ok(conRuns([run(3, 'cancelled', 5 * MIN), run(2, 'success', 20 * MIN)].map(resumen)).nivel === 'bien', 'respaldo: una cancelada no cuenta');

// ── 5. Lanzar tareas ──────────────────────────────────────────────────────
async function error(p) { try { await p; return null; } catch (x) { return x; } }
lol.usarFetchLol(falso, { LOL_URL: URL_VISOR });
let x = await error(lol.lanzarTareaLol('respaldo'));
ok(x?.estado === 403 && x.codigo === 'solo-lectura', 'lanzar sin token → 403 solo-lectura');
lol.usarFetchLol(falso, { PANEL_GITHUB_TOKEN: TOKEN });
x = await error(lol.lanzarTareaLol('rm -rf'));
ok(x?.estado === 400, 'lanzar una tarea que no está en la lista → 400');
x = await error(lol.lanzarTareaLol('constructor'));
ok(x?.estado === 400, '"constructor" no es una tarea');
runs['respaldo.yml'] = [run(6, null, MIN, 'schedule', 'in_progress'), ...runs['respaldo.yml']];
x = await error(lol.lanzarTareaLol('respaldo'));
ok(x?.estado === 409 && x.codigo === 'ya-pedida', 'con una ejecución en marcha → 409');
runs['respaldo.yml'] = [run(7, 'success', 3 * MIN, 'workflow_dispatch'), run(5, 'success', 30 * MIN)];
x = await error(lol.lanzarTareaLol('respaldo'));
ok(x?.estado === 429 && /dentro de \d+ min/.test(x.message), 'lanzada a mano hace 3 min → 429 con cuánto falta');
runs['cuerpo-tecnico.yml'] = [run(10, 'success', 2 * H, 'workflow_dispatch')];
x = await error(lol.lanzarTareaLol('cuerpo-tecnico'));
ok(x?.estado === 429 && /dentro de 4 h/.test(x.message), 'el cuerpo técnico, como mucho cada 6 h');
dispatches = [];
x = await error(lol.lanzarTareaLol('captura'));
ok(x === null && dispatches.length === 1, 'captura lanzada');
ok(dispatches[0]?.fichero === 'captura.yml' && dispatches[0].cuerpo.ref === lol.LOL_RAMA, 'el dispatch va a captura.yml en la rama del visor');
accesoRepo = false;
x = await error(lol.lanzarTareaLol('captura'));
ok(x?.estado === 502 && /no tiene acceso/.test(x.message), 'sin acceso al repositorio, lanzar dice por qué');
accesoRepo = true;

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
