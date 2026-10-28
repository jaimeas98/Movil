// El visor de LoL Esports visto desde este panel: un solo panel para la
// cartelera y para el visor, que es otra web (otro proyecto de Vercel) con su
// propio repositorio privado.
//
// DE DÓNDE SALE CADA COSA
// · La web del visor (LOL_URL en Vercel, p. ej. https://<visor>.vercel.app):
//   su /api/estado (cómo responde lolesports.com, la edad de su respaldo) y
//   su /api/agenda de hoy y mañana (lo que hay en directo y lo próximo). Son
//   rutas públicas del visor: no hace falta ninguna clave.
// · Su repositorio (por defecto jaimeas98/Trabajo-IA): las últimas
//   ejecuciones de sus tareas de GitHub Actions (respaldo, cuerpo técnico,
//   captura) y sus últimos cambios. Es privado, así que hace falta un token
//   con acceso: LOL_GITHUB_TOKEN o, si no está, el mismo PANEL_GITHUB_TOKEN
//   con ese repositorio añadido. Desde aquí se pueden lanzar esas tareas,
//   solo esas (lista cerrada, como las órdenes al móvil).
//
// Nada de esto toca el móvil ni la cartelera: si el visor o su repositorio
// fallan, solo se apaga la parte de LoL del panel. Sin LOL_URL ni token, el
// panel lo dice y explica qué poner; no es un fallo.
//
// Lo que llega de la web del visor se resume aquí (campos conocidos, textos
// recortados) en vez de pasarse tal cual: el panel no tiene por qué fiarse de
// la forma de una respuesta de otro proyecto. Los enlaces solo se montan
// sobre LOL_URL o github.com, nunca con una URL que venga en una respuesta.

import { ErrorPanel } from './http.js';

export const LOL_REPO = 'jaimeas98/Trabajo-IA';
export const LOL_RAMA = 'claude/esports-matches-visualizer-dzwrhe';
const API = 'https://api.github.com';
const TIEMPO_WEB_MS = 12000;     // el agregador del visor corta a los 8 s
const TIEMPO_GH_MS = 10000;
const CACHE_MS = 60000;          // el panel pregunta cada 30 s; esto va con un minuto
const MIN = 60 * 1000;

// LISTA CERRADA de tareas del visor que se pueden lanzar desde el panel. La
// espera es la mínima entre dos lanzamientos a mano (con la clave del panel
// en malas manos, lo peor es lanzarlas, y no sin parar): el cuerpo técnico
// pide a Liquipedia, que limita, y la captura sube un commit cada vez.
export const TAREAS_LOL = {
  respaldo: { fichero: 'respaldo.yml', esperaMs: 10 * MIN },
  'cuerpo-tecnico': { fichero: 'cuerpo-tecnico.yml', esperaMs: 6 * 60 * MIN },
  captura: { fichero: 'captura.yml', esperaMs: 30 * MIN },
};

// Para las pruebas: sustituir fetch y el entorno sin tocar el global.
let _fetch = (...a) => globalThis.fetch(...a);
let _env = null;
export function usarFetchLol(f, env = null) {
  _fetch = f ?? ((...a) => globalThis.fetch(...a));
  _env = env;
  _cache.clear();
}
const entorno = () => _env ?? process.env;

// ── Configuración ─────────────────────────────────────────────────────────
// Solo https y solo el origen: una ruta o una barra final en la variable no
// deben acabar en "https://x//api/estado".
export function urlVisor() {
  const v = entorno().LOL_URL;
  if (typeof v !== 'string' || !v.trim()) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' && !u.username && !u.password ? u.origin : null;
  } catch {
    return null;
  }
}

function tokenLol() {
  for (const k of ['LOL_GITHUB_TOKEN', 'PANEL_GITHUB_TOKEN']) {
    const t = entorno()[k];
    if (typeof t === 'string' && t.trim()) return { valor: t.trim(), propio: k === 'LOL_GITHUB_TOKEN' };
  }
  return null;
}

export function repoLol() {
  const r = entorno().LOL_REPO;
  return typeof r === 'string' && /^[\w.-]+\/[\w.-]+$/.test(r.trim()) ? r.trim() : LOL_REPO;
}

// ── Caché en memoria ──────────────────────────────────────────────────────
const _cache = new Map(); // clave -> { at, valor }
async function conCache(clave, fn, ttl = CACHE_MS) {
  const previo = _cache.get(clave);
  if (previo && Date.now() - previo.at < ttl) return previo.valor;
  const valor = await fn();
  _cache.set(clave, { at: Date.now(), valor });
  return valor;
}

// ── Ayudas ────────────────────────────────────────────────────────────────
const txt = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fecha = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const enGitHub = (u) => (typeof u === 'string' && u.startsWith('https://github.com/') ? u : null);

async function pedirJson(url, { tiempo, cabeceras = {}, metodo = 'GET', cuerpo } = {}) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), tiempo);
  try {
    const r = await _fetch(url, {
      method: metodo,
      headers: { ...cabeceras, ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'manual',
    });
    const texto = r.status === 204 ? '' : await r.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch { /* no es JSON: se queda en null */ }
    return { estado: r.status, datos, texto };
  } catch {
    return { estado: 0, datos: null, texto: '', cortado: ctrl.signal.aborted };
  } finally {
    clearTimeout(reloj);
  }
}

// ── La web del visor ──────────────────────────────────────────────────────
// Hoy y mañana en Madrid (AAAA-MM-DD): la jornada del visor llega hasta las
// 05:59 del día siguiente, y lo próximo de esta noche también interesa.
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
export function diasAgenda(ahora = Date.now()) {
  const hoy = fmtDia.format(new Date(ahora));
  const [y, m, d] = hoy.split('-').map(Number);
  return { desde: hoy, hasta: new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10) };
}

function fallaWeb(r, que) {
  if (r.estado === 0) return r.cortado ? `La web del visor no ha contestado a ${que} en ${TIEMPO_WEB_MS / 1000} s.` : `No se puede conectar con la web del visor (${que}).`;
  if (r.estado === 401 || r.estado === 403) return `La web del visor pide permiso para ${que} (${r.estado}): ¿LOL_URL es la dirección de producción y no la de un despliegue protegido?`;
  if (r.estado >= 300 && r.estado < 400) return `La web del visor redirige ${que} (${r.estado}): pon en LOL_URL la dirección final.`;
  const msg = txt(r.datos?.error, 160);
  return `La web del visor ha respondido ${r.estado} a ${que}${msg ? `: ${msg}` : ''}.`;
}

// Fuentes fijas del visor (agenda, directo, ligas…): última buena, último
// error y de dónde salió lo último que sirvió.
function resumirFuentes(fuentes) {
  const out = {};
  for (const [k, f] of Object.entries(objeto(fuentes) ?? {}).slice(0, 30)) {
    if (!/^[\w:/-]{1,60}$/.test(k) || !objeto(f)) continue;
    out[k] = {
      ultimaOk: fecha(f.ultimaOk),
      ultimoError: txt(f.ultimoError),
      ultimoErrorEn: fecha(f.ultimoErrorEn),
      ultimaFuente: txt(f.ultimaFuente, 20),
    };
  }
  return out;
}

function resumirCopia(c) {
  const o = objeto(c);
  return o ? { generado: fecha(o.generado), antiguedadSeg: num(o.antiguedadSeg), torneo: txt(o.torneo, 80) } : null;
}

export function resumirEstadoVisor(d) {
  const r = objeto(d?.respaldo) ?? {};
  const rec = objeto(r.ultimaRecogida);
  const man = objeto(d?.consultas?.manifiesto);
  return {
    generado: fecha(d?.generado),
    fuentes: resumirFuentes(d?.fuentes),
    respaldo: {
      agenda: resumirCopia(r.agenda),
      ligas: resumirCopia(r.ligas),
      torneos: Object.fromEntries(Object.entries(objeto(r.torneos) ?? {}).slice(0, 20)
        .filter(([k]) => /^[\w-]{1,30}$/.test(k)).map(([k, v]) => [k, resumirCopia(v)])),
      ultimaRecogida: rec ? { generado: fecha(rec.generado), origen: txt(rec.origen, 20) } : null,
    },
    consultas: man ? { origen: txt(man.origen, 20), redescubiertoEn: fecha(man.redescubiertoEn), error: txt(man.error) } : null,
  };
}

const ESTADOS_PARTIDO = new Set(['programado', 'directo', 'terminado']);
function resumirPartido(p) {
  if (!objeto(p) || !ESTADOS_PARTIDO.has(p.estado) || !fecha(p.inicio)) return null;
  const id = txt(String(p.id ?? ''), 40);
  return {
    id: id && /^\d+$/.test(id) ? id : null,
    inicio: fecha(p.inicio),
    estado: p.estado,
    liga: txt(p.liga?.nombre, 60) ?? txt(p.liga?.slug, 30),
    bloque: txt(p.bloque, 60),
    mejorDe: num(p.mejorDe),
    equipos: (Array.isArray(p.equipos) ? p.equipos : []).slice(0, 2).map((e) => ({
      codigo: txt(e?.codigo, 10) ?? (e?.porDefinir ? 'TBD' : '?'),
      nombre: txt(e?.nombre, 60),
      victorias: num(e?.victorias),
      resultado: e?.resultado === 'gana' || e?.resultado === 'pierde' ? e.resultado : null,
    })),
  };
}

// De la agenda: lo que está en directo, lo próximo (24 h) y lo terminado en
// las últimas 18 h. Pocos de cada: el panel es para echar un vistazo; para
// verlo entero está la web del visor.
export function resumirAgenda(d, ahora = Date.now()) {
  const todos = (Array.isArray(d?.partidos) ? d.partidos : []).map(resumirPartido).filter(Boolean)
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const t = (p) => Date.parse(p.inicio);
  return {
    generado: fecha(d?.generado),
    fuente: txt(d?.fuente, 20),
    antiguedadSeg: num(d?.antiguedadSeg),
    directo: todos.filter((p) => p.estado === 'directo').slice(0, 6),
    proximos: todos.filter((p) => p.estado === 'programado' && t(p) >= ahora - 2 * 3600e3 && t(p) <= ahora + 24 * 3600e3).slice(0, 6),
    terminados: todos.filter((p) => p.estado === 'terminado' && t(p) >= ahora - 18 * 3600e3).slice(-6).reverse(),
  };
}

async function leerWeb(url) {
  const { desde, hasta } = diasAgenda();
  const cab = { Accept: 'application/json', 'User-Agent': 'cartelera-panel' };
  const [e, a] = await Promise.all([
    pedirJson(`${url}/api/estado`, { tiempo: TIEMPO_WEB_MS, cabeceras: cab }),
    pedirJson(`${url}/api/agenda?desde=${desde}&hasta=${hasta}`, { tiempo: TIEMPO_WEB_MS, cabeceras: cab }),
  ]);
  const okE = e.estado === 200 && objeto(e.datos);
  const okA = a.estado === 200 && objeto(a.datos);
  return {
    url,
    responde: Boolean(okE || okA),
    estado: okE ? resumirEstadoVisor(e.datos) : null,
    agenda: okA ? resumirAgenda(a.datos) : null,
    error: !okE ? fallaWeb(e, 'su estado') : !okA ? fallaWeb(a, 'la agenda') : null,
  };
}

// ── Su repositorio en GitHub ──────────────────────────────────────────────
function cabecerasGH(t) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cartelera-panel',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${t.valor}`,
  };
}

// Texto de error SIN nada de la petición (ni cabeceras ni token).
function motivoGH(r, repo, t) {
  const msg = txt(r.datos?.message, 160);
  const deQuien = t.propio ? 'LOL_GITHUB_TOKEN' : 'PANEL_GITHUB_TOKEN';
  if (r.estado === 0) return r.cortado ? 'GitHub no responde (10 s).' : 'No se puede conectar con GitHub.';
  if (r.estado === 401) return `GitHub no acepta ${deQuien} (¿caducado o revocado?).`;
  if (r.estado === 403 && /rate limit/i.test(msg ?? '')) return 'GitHub ha cortado por límite de peticiones; prueba en unos minutos.';
  if (r.estado === 403 || r.estado === 404) {
    return t.propio
      ? `LOL_GITHUB_TOKEN no tiene acceso a ${repo}: dale ese repositorio con «Contents: Read» y «Actions: Read and write».`
      : `PANEL_GITHUB_TOKEN no tiene acceso a ${repo}: añade ese repositorio al token en GitHub (o crea LOL_GITHUB_TOKEN solo para él).`;
  }
  return `GitHub ha respondido ${r.estado}${msg ? `: ${msg}` : ''}.`;
}

const ESTADOS_VIVOS = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);
function resumirEjecucion(x) {
  return {
    id: num(x?.id),
    estado: txt(x?.status, 20),              // queued | in_progress | completed…
    conclusion: txt(x?.conclusion, 20),      // success | failure | cancelled | skipped… | null
    evento: txt(x?.event, 30),               // schedule | push | workflow_dispatch
    creada: fecha(x?.created_at),
    actualizada: fecha(x?.updated_at),
    url: enGitHub(x?.html_url),
  };
}

async function ejecuciones(repo, t, fichero) {
  const r = await pedirJson(`${API}/repos/${repo}/actions/workflows/${fichero}/runs?per_page=5&branch=${encodeURIComponent(LOL_RAMA)}`,
    { tiempo: TIEMPO_GH_MS, cabeceras: cabecerasGH(t) });
  if (r.estado !== 200) throw new ErrorPanel(502, 'github', motivoGH(r, repo, t));
  return (Array.isArray(r.datos?.workflow_runs) ? r.datos.workflow_runs : []).map(resumirEjecucion);
}

async function leerRepo(repo, t) {
  const tareas = {};
  const errores = [];
  await Promise.all(Object.entries(TAREAS_LOL).map(async ([id, x]) => {
    try { tareas[id] = await ejecuciones(repo, t, x.fichero); }
    catch (e) { tareas[id] = null; errores.push(e.message); }
  }));
  let cambios = null;
  const c = await pedirJson(`${API}/repos/${repo}/commits?sha=${encodeURIComponent(LOL_RAMA)}&per_page=6`, { tiempo: TIEMPO_GH_MS, cabeceras: cabecerasGH(t) });
  if (c.estado === 200 && Array.isArray(c.datos)) {
    // Solo la primera línea del mensaje y la fecha: ni autores ni correos.
    cambios = c.datos.map((x) => ({
      sha: txt(x?.sha, 40)?.slice(0, 7) ?? null,
      mensaje: txt(String(x?.commit?.message ?? '').split('\n')[0], 120),
      fecha: fecha(x?.commit?.committer?.date ?? x?.commit?.author?.date),
      url: enGitHub(x?.html_url),
    }));
  } else {
    errores.push(motivoGH(c, repo, t));
  }
  // El mismo error en las cuatro peticiones (sin acceso, sin red) se dice una vez.
  const error = [...new Set(errores)].join(' ') || null;
  return { tareas, cambios, error };
}

// ── Para /api/panel/estado ────────────────────────────────────────────────
export async function estadoLol() {
  const url = urlVisor();
  const repo = repoLol();
  const t = tokenLol();
  const hayLolUrl = Boolean(entorno().LOL_URL && String(entorno().LOL_URL).trim());
  const [web, gh] = await Promise.all([
    url ? conCache(`web:${url}`, () => leerWeb(url)).catch((e) => ({ url, responde: false, estado: null, agenda: null, error: String(e?.message ?? e).slice(0, 200) })) : null,
    t ? conCache(`gh:${repo}`, () => leerRepo(repo, t)).catch((e) => ({ tareas: {}, cambios: null, error: String(e?.message ?? e).slice(0, 200) })) : null,
  ]);
  return {
    configurado: { web: Boolean(url), github: Boolean(t), tokenPropio: Boolean(t?.propio) },
    web: web ?? { url: null, responde: false, estado: null, agenda: null, error: hayLolUrl ? 'LOL_URL no es una dirección https válida.' : null },
    repo: {
      nombre: repo,
      url: `https://github.com/${repo}`,
      rama: LOL_RAMA,
      tareas: gh?.tareas ?? {},
      cambios: gh?.cambios ?? null,
      error: gh?.error ?? null,
    },
    error: null,
  };
}

// ── Lanzar una tarea del visor ────────────────────────────────────────────
// Dos comprobaciones antes de lanzar, las dos con lo que dice GitHub (así
// valen aunque Vercel tenga varias instancias del servidor): que no haya
// una ejecución en marcha y que la última lanzada a mano no sea de hace
// menos de su espera.
export async function lanzarTareaLol(tarea, ahora = Date.now()) {
  if (typeof tarea !== 'string' || !Object.hasOwn(TAREAS_LOL, tarea)) {
    throw new ErrorPanel(400, 'datos', 'Esa tarea del visor no está en la lista.');
  }
  const t = tokenLol();
  if (!t) throw new ErrorPanel(403, 'solo-lectura', 'Sin token no se pueden lanzar tareas del visor: falta LOL_GITHUB_TOKEN (o PANEL_GITHUB_TOKEN con acceso al repositorio del visor).');
  const repo = repoLol();
  const { fichero, esperaMs } = TAREAS_LOL[tarea];
  const runs = await ejecuciones(repo, t, fichero);
  const viva = runs.find((x) => ESTADOS_VIVOS.has(x.estado));
  if (viva) throw new ErrorPanel(409, 'ya-pedida', 'Ya hay una ejecución de esa tarea en marcha; espera a que acabe.');
  const aMano = runs.find((x) => x.evento === 'workflow_dispatch');
  const desde = aMano?.creada ? ahora - Date.parse(aMano.creada) : Infinity;
  if (desde < esperaMs) {
    const min = Math.ceil((esperaMs - desde) / MIN);
    throw new ErrorPanel(429, 'limite', `Se lanzó a mano hace poco; se puede volver a lanzar dentro de ${min >= 90 ? `${Math.round(min / 60)} h` : `${min} min`}.`);
  }
  const r = await pedirJson(`${API}/repos/${repo}/actions/workflows/${fichero}/dispatches`, {
    tiempo: TIEMPO_GH_MS, metodo: 'POST', cabeceras: cabecerasGH(t), cuerpo: { ref: LOL_RAMA },
  });
  if (r.estado === 403 || r.estado === 404) {
    throw new ErrorPanel(403, 'solo-lectura', `El token no puede lanzar tareas en ${repo}: necesita «Actions: Read and write» en ese repositorio.`);
  }
  if (r.estado !== 204) throw new ErrorPanel(502, 'github', motivoGH(r, repo, t));
  _cache.delete(`gh:${repo}`);
}
