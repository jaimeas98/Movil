// Cliente de GitHub del panel: lee lo que publica el móvil y escribe las
// órdenes y las plantillas de enlaces.
//
// POR QUÉ GITHUB Y NO OTRA COSA
// El móvil no tiene ningún puerto abierto: solo SALE hacia GitHub. Así que
// todo lo que el panel le dice al móvil pasa por el repositorio (rama
// `ordenes-movil`) y todo lo que el móvil cuenta llega por la rama
// `estado-movil`. Sin servidores ni bases de datos que mantener.
//
// TOKEN
// Escribir necesita PANEL_GITHUB_TOKEN (fine-grained, solo este repositorio).
// Sin él el panel funciona en SOLO LECTURA: lee de raw.githubusercontent.com
// sin autenticar (GitHub lo sirve con hasta 5 min de caché) y cada escritura
// responde 403 'solo-lectura'. El token nunca sale en una respuesta ni en un
// log: los mensajes de error se montan aquí, no se copian de GitHub enteros.

import { ErrorPanel } from './http.js';

export const REPO = 'jaimeas98/Movil';
export const RAMA_APP = 'claude/puerto-santa-maria-restaurants-NxChu';
export const RAMA_ESTADO = 'estado-movil';
export const RAMA_ORDENES = 'ordenes-movil';
export const WORKFLOW_VIGILANTE = 'vigilante-movil.yml';
const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const TIEMPO_MS = 10000;

// Para las pruebas: sustituir fetch y el entorno sin tocar el global.
let _fetch = (...a) => globalThis.fetch(...a);
let _env = null;
export function usarFetch(f, env = null) { _fetch = f ?? ((...a) => globalThis.fetch(...a)); _env = env; _cache.clear(); }
const entorno = () => _env ?? process.env;

export function token() {
  const t = entorno().PANEL_GITHUB_TOKEN;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}
export const hayEscritura = () => Boolean(token());

function exigirEscritura() {
  if (!hayEscritura()) {
    throw new ErrorPanel(403, 'solo-lectura',
      'El panel está en solo lectura: falta PANEL_GITHUB_TOKEN en Vercel para poder escribir en GitHub.');
  }
}

// ── Caché en memoria ─────────────────────────────────────────────────────
// Por instancia del servidor. Evita gastar el límite de GitHub cuando el
// panel sondea cada pocos segundos, y guarda el ETag para que la siguiente
// lectura sea condicional (un 304 no cuenta para el límite).
const _cache = new Map(); // clave -> { at, valor, etag }
export function vaciarCache(prefijo = '') {
  for (const k of [..._cache.keys()]) if (k.startsWith(prefijo)) _cache.delete(k);
}

// Texto de error SIN nada de la petición (ni cabeceras ni token).
function motivoGitHub(estado, cuerpo) {
  const msg = typeof cuerpo?.message === 'string' ? cuerpo.message.slice(0, 160) : '';
  if (estado === 401) return 'GitHub no acepta el token (¿caducado o revocado?).';
  if (estado === 403 && /rate limit/i.test(msg)) return 'GitHub ha cortado por límite de peticiones; prueba en unos minutos.';
  if (estado === 403 || estado === 404) return `El token no tiene permiso para esto en GitHub${msg ? ` (${msg})` : ''}.`;
  return `GitHub ha respondido ${estado}${msg ? `: ${msg}` : ''}.`;
}

async function pedir(url, { metodo = 'GET', cuerpo, aceptar = 'application/vnd.github+json', etag = null, autenticar = true } = {}) {
  const cabeceras = {
    'Accept': aceptar,
    'User-Agent': 'cartelera-panel',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const t = token();
  if (t && autenticar) cabeceras.Authorization = `Bearer ${t}`;
  if (etag) cabeceras['If-None-Match'] = etag;
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIEMPO_MS);
  try {
    const r = await _fetch(url, {
      method: metodo, headers: cabeceras, signal: ctrl.signal, cache: 'no-store',
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = r.status === 204 || r.status === 304 ? '' : await r.text();
    return { estado: r.status, texto, etag: r.headers.get('etag') };
  } catch (e) {
    throw new ErrorPanel(502, 'github', ctrl.signal.aborted ? 'GitHub no responde (10 s).' : 'No se puede conectar con GitHub.');
  } finally {
    clearTimeout(reloj);
  }
}

function parsear(texto) {
  try { return JSON.parse(texto); } catch { return null; }
}

async function api(ruta, opciones = {}) {
  const r = await pedir(`${API}${ruta}`, opciones);
  const datos = r.texto ? parsear(r.texto) : null;
  return { ...r, datos };
}

const rutaFichero = (ruta) => ruta.split('/').map(encodeURIComponent).join('/');

// ── Leer ─────────────────────────────────────────────────────────────────
// El contenido (texto) de un fichero de una rama, o null si no existe.
export async function leerFichero(rama, ruta, { ttlMs = 20000 } = {}) {
  const clave = `f:${rama}:${ruta}`;
  const previo = _cache.get(clave);
  if (previo && Date.now() - previo.at < ttlMs) return previo.valor;

  let r;
  if (hayEscritura()) {
    r = await pedir(`${API}/repos/${REPO}/contents/${rutaFichero(ruta)}?ref=${encodeURIComponent(rama)}`,
      { aceptar: 'application/vnd.github.raw', etag: previo?.etag });
    if (r.estado === 304 && previo) { _cache.set(clave, { ...previo, at: Date.now() }); return previo.valor; }
  } else {
    // Sin token: lo público. Las ramas con / van tal cual en la ruta.
    r = await pedir(`${RAW}/${REPO}/${rama}/${rutaFichero(ruta)}`, { aceptar: '*/*', autenticar: false });
  }
  if (r.estado === 404) { _cache.set(clave, { at: Date.now(), valor: null, etag: null }); return null; }
  if (r.estado !== 200) throw new ErrorPanel(502, 'github', motivoGitHub(r.estado, parsear(r.texto)));
  _cache.set(clave, { at: Date.now(), valor: r.texto, etag: r.etag });
  return r.texto;
}

// Varios ficheros de una rama a la vez. Un fallo en uno no tumba los demás.
// { contenidos: { ruta: texto|null }, errores: { ruta: mensaje } }
export async function leerFicheros(rama, rutas, ttl = {}) {
  const contenidos = {};
  const errores = {};
  await Promise.all(rutas.map(async (ruta) => {
    try { contenidos[ruta] = await leerFichero(rama, ruta, { ttlMs: ttl[ruta] ?? 20000 }); }
    catch (e) { contenidos[ruta] = null; errores[ruta] = e.message; }
  }));
  return { contenidos, errores };
}

// Avisos del vigilante (issues con la etiqueta alerta-movil).
export async function leerAvisos() {
  const clave = 'avisos';
  const ttl = hayEscritura() ? 20000 : 60000;   // sin token el límite es de 60 por hora
  const previo = _cache.get(clave);
  if (previo && Date.now() - previo.at < ttl) return previo.valor;
  const base = `/repos/${REPO}/issues?labels=alerta-movil&sort=updated&direction=desc`;
  const [abiertos, cerrados] = await Promise.all([
    api(`${base}&state=open&per_page=30`),
    api(`${base}&state=closed&per_page=10`),
  ]);
  for (const r of [abiertos, cerrados]) {
    if (r.estado !== 200) throw new ErrorPanel(502, 'github', motivoGitHub(r.estado, r.datos));
  }
  const limpiar = (i) => ({
    numero: i.number,
    titulo: String(i.title ?? '').slice(0, 200),
    // Se pinta como enlace en el panel: solo uno de GitHub.
    url: typeof i.html_url === 'string' && i.html_url.startsWith('https://github.com/') ? i.html_url : null,
    estado: i.state,
    nivel: (i.labels ?? []).some((l) => (l?.name ?? l) === 'critico') ? 'critico' : 'aviso',
    creado: i.created_at,
    actualizado: i.updated_at,
    cerrado: i.closed_at ?? null,
    comentarios: i.comments ?? 0,
  });
  const hace14 = Date.now() - 14 * 24 * 3600 * 1000;
  const valor = {
    abiertos: (abiertos.datos ?? []).filter((i) => !i.pull_request).map(limpiar),
    recientes: (cerrados.datos ?? []).filter((i) => !i.pull_request && Date.parse(i.closed_at) >= hace14).map(limpiar),
  };
  _cache.set(clave, { at: Date.now(), valor });
  return valor;
}

// ── Escribir ─────────────────────────────────────────────────────────────
// Fichero con su sha (para escribir encima sin pisar un cambio ajeno).
// null si no existe. Lanza { rama: 'no-existe' } si la rama no existe.
async function leerConSha(rama, ruta) {
  const r = await api(`/repos/${REPO}/contents/${rutaFichero(ruta)}?ref=${encodeURIComponent(rama)}`);
  if (r.estado === 404) {
    const ref = await api(`/repos/${REPO}/git/ref/heads/${rama.split('/').map(encodeURIComponent).join('/')}`);
    if (ref.estado === 404) return { ramaExiste: false };
    if (ref.estado !== 200) throw new ErrorPanel(502, 'github', motivoGitHub(ref.estado, ref.datos));
    return { ramaExiste: true, contenido: null, sha: null };
  }
  if (r.estado !== 200 || !r.datos || Array.isArray(r.datos)) throw new ErrorPanel(502, 'github', motivoGitHub(r.estado, r.datos));
  return { ramaExiste: true, contenido: Buffer.from(r.datos.content ?? '', 'base64').toString('utf8'), sha: r.datos.sha };
}

async function escribir(rama, ruta, contenido, mensaje, sha) {
  const r = await api(`/repos/${REPO}/contents/${rutaFichero(ruta)}`, {
    metodo: 'PUT',
    cuerpo: {
      message: mensaje,
      content: Buffer.from(contenido, 'utf8').toString('base64'),
      branch: rama,
      ...(sha ? { sha } : {}),
    },
  });
  if (r.estado === 409 || (r.estado === 422 && /sha/i.test(r.datos?.message ?? ''))) return { conflicto: true };
  if (r.estado !== 200 && r.estado !== 201) throw new ErrorPanel(502, 'github', motivoGitHub(r.estado, r.datos));
  return { commit: r.datos?.commit?.sha ?? null };
}

// Rama HUÉRFANA (sin historia común con la web) con estos ficheros. Va por
// la API de Git a bajo nivel porque la de contenidos solo sabe escribir en
// ramas que ya existen: blob → árbol → commit sin padres → referencia.
async function crearRamaHuerfana(rama, ficheros, mensaje) {
  const arbol = [];
  for (const [ruta, contenido] of Object.entries(ficheros)) {
    const b = await api(`/repos/${REPO}/git/blobs`, { metodo: 'POST', cuerpo: { content: contenido, encoding: 'utf-8' } });
    if (b.estado !== 201) throw new ErrorPanel(502, 'github', motivoGitHub(b.estado, b.datos));
    arbol.push({ path: ruta, mode: '100644', type: 'blob', sha: b.datos.sha });
  }
  const t = await api(`/repos/${REPO}/git/trees`, { metodo: 'POST', cuerpo: { tree: arbol } });
  if (t.estado !== 201) throw new ErrorPanel(502, 'github', motivoGitHub(t.estado, t.datos));
  const c = await api(`/repos/${REPO}/git/commits`, { metodo: 'POST', cuerpo: { message: mensaje, tree: t.datos.sha, parents: [] } });
  if (c.estado !== 201) throw new ErrorPanel(502, 'github', motivoGitHub(c.estado, c.datos));
  const ref = await api(`/repos/${REPO}/git/refs`, { metodo: 'POST', cuerpo: { ref: `refs/heads/${rama}`, sha: c.datos.sha } });
  if (ref.estado === 422) return { conflicto: true };   // la ha creado otro entre medias
  if (ref.estado !== 201) throw new ErrorPanel(502, 'github', motivoGitHub(ref.estado, ref.datos));
  return { commit: c.datos.sha };
}

// Lee, cambia y escribe un fichero con reintento optimista: si alguien lo ha
// cambiado entre la lectura y la escritura (409), se vuelve a leer y a
// aplicar el cambio, hasta 3 veces. `cambiar(textoActual|null)` devuelve el
// texto nuevo. `huerfana`: ficheros con los que crear la rama si no existe.
export async function actualizarFichero(rama, ruta, cambiar, mensaje, { huerfana = null } = {}) {
  exigirEscritura();
  for (let intento = 0; intento < 3; intento++) {
    const actual = await leerConSha(rama, ruta);
    if (!actual.ramaExiste) {
      if (!huerfana) throw new ErrorPanel(502, 'github', `La rama ${rama} no existe en GitHub.`);
      const nuevo = cambiar(null);
      const r = await crearRamaHuerfana(rama, { ...huerfana, [ruta]: nuevo }, mensaje);
      if (r.conflicto) continue;
      vaciarCache(`f:${rama}:`);
      return { commit: r.commit, contenido: nuevo };
    }
    const nuevo = cambiar(actual.contenido);
    const r = await escribir(rama, ruta, nuevo, mensaje, actual.sha);
    if (r.conflicto) continue;
    vaciarCache(`f:${rama}:`);
    return { commit: r.commit, contenido: nuevo };
  }
  throw new ErrorPanel(409, 'conflicto', 'GitHub ha cambiado el fichero tres veces mientras se guardaba. Prueba otra vez.');
}

// Lanza el vigilante ya (workflow_dispatch). prueba: abre un aviso de prueba.
export async function lanzarVigilante({ prueba = false } = {}) {
  exigirEscritura();
  const r = await api(`/repos/${REPO}/actions/workflows/${WORKFLOW_VIGILANTE}/dispatches`, {
    metodo: 'POST',
    cuerpo: { ref: RAMA_APP, inputs: { prueba: prueba ? 'true' : 'false' } },
  });
  if (r.estado === 403 || r.estado === 404) {
    throw new ErrorPanel(403, 'solo-lectura', 'El token no tiene permiso para lanzar el vigilante: necesita «Actions: Read and write».');
  }
  if (r.estado !== 204) throw new ErrorPanel(502, 'github', motivoGitHub(r.estado, r.datos));
  vaciarCache('avisos');
}
