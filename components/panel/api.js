// Capa de datos del panel: una función por cada ruta de /api/panel/*.
//
// Todo pasa por pedir(), que hace tres cosas que ninguna pantalla debería
// repetir:
//  · manda la cookie (same-origin) y nunca cachea: el panel enseña el estado
//    de ahora, no el de hace un rato;
//  · convierte cualquier fallo en un ErrorPanel con un `tipo` que la interfaz
//    sabe explicar (red, servidor, solo lectura, datos que no valen…);
//  · trata el 404 del middleware como "la sesión ha caducado" y lleva a
//    /panel/entrar. El panel no existe sin sesión, así que sin cookie válida
//    TODO responde 404 (página HTML de Next). Un 404 que viene en JSON, en
//    cambio, es de la propia API con sesión (p. ej. una orden que ya no está)
//    y se queda como error normal: si no, una orden recortada del historial
//    echaría al usuario del panel.

const BASE = '/api/panel';
const TIEMPO_MAX_MS = 30000;

export class ErrorPanel extends Error {
  constructor(tipo, mensaje, { estado = null, detalle = null, id = null } = {}) {
    super(mensaje);
    this.name = 'ErrorPanel';
    // 'sesion' | 'red' | 'tiempo' y los `codigo` del servidor: 'datos' |
    // 'clave' | 'solo-lectura' | 'no-esta' | 'conflicto' | 'ya-pedida' |
    // 'limite' | 'github' | 'servidor'
    this.tipo = tipo;
    this.estado = estado;   // código HTTP, si lo hubo
    this.detalle = detalle; // lo que dijo el servidor, recortado
    this.id = id;           // en 'ya-pedida', la orden que ya estaba pendiente
  }
}

let yendoAEntrar = false;
function irAEntrar() {
  if (typeof window === 'undefined' || yendoAEntrar) return;
  yendoAEntrar = true;
  // replace y no assign: volver atrás desde la entrada no tiene que traer de
  // vuelta un panel que ya no tiene sesión.
  window.location.replace('/panel/entrar');
}

function recortar(texto, max = 400) {
  if (typeof texto !== 'string') return null;
  const t = texto.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t || null;
}

async function leerCuerpo(res) {
  if (res.status === 204) return null;
  const tipo = res.headers.get('content-type') || '';
  if (tipo.includes('application/json')) {
    try { return { json: await res.json() }; } catch { return { json: null }; }
  }
  try { return { texto: await res.text() }; } catch { return { texto: null }; }
}

// El mensaje que el servidor manda en sus errores, venga como venga.
function mensajeDe(cuerpo) {
  const j = cuerpo?.json;
  if (j && typeof j === 'object') return recortar(j.error || j.mensaje || j.message || j.motivo || null);
  return null;
}

export async function pedir(ruta, { metodo = 'GET', cuerpo, senal, sinRedirigir = false, espera = TIEMPO_MAX_MS } = {}) {
  const ctrl = new AbortController();
  const cortar = () => ctrl.abort();
  if (senal) {
    if (senal.aborted) ctrl.abort();
    else senal.addEventListener('abort', cortar, { once: true });
  }
  const reloj = setTimeout(() => ctrl.abort('tiempo'), espera);

  let res;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(reloj);
    senal?.removeEventListener('abort', cortar);
    if (senal?.aborted) throw e; // lo ha cancelado quien llamaba: no es un error que enseñar
    if (ctrl.signal.aborted) throw new ErrorPanel('tiempo', 'El servidor ha tardado demasiado en contestar.');
    throw new ErrorPanel('red', 'No hay conexión con el servidor.');
  }
  clearTimeout(reloj);
  senal?.removeEventListener('abort', cortar);

  const leido = await leerCuerpo(res);
  if (res.ok) return leido?.json ?? null;

  const estado = res.status;
  const detalle = mensajeDe(leido) ?? recortar(leido?.texto && !/<html/i.test(leido.texto) ? leido.texto : null);

  // El servidor manda siempre { error, codigo } (docs/panel/API.md): el
  // código dice qué tipo de fallo es y el texto ya viene para enseñar tal cual.
  const j = leido?.json && typeof leido.json === 'object' ? leido.json : null;
  const extra = { estado, detalle, id: j?.id ?? null };

  if (estado === 404 && !j) {
    if (!sinRedirigir) irAEntrar();
    throw new ErrorPanel('sesion', 'La sesión ha caducado.', extra);
  }
  const POR_ESTADO = { 400: 'datos', 401: 'clave', 403: 'solo-lectura', 404: 'no-esta', 409: 'conflicto', 422: 'datos', 429: 'limite', 502: 'github' };
  const tipo = (typeof j?.codigo === 'string' && j.codigo) || POR_ESTADO[estado] || 'servidor';
  const PORDEFECTO = {
    datos: 'El servidor no ha aceptado esos datos.',
    clave: 'Esa clave no vale.',
    'solo-lectura': 'El panel está en solo lectura: falta el permiso para escribir en GitHub.',
    'no-esta': 'Eso ya no está en el servidor.',
    conflicto: 'GitHub ha cambiado entre medias. Vuelve a intentarlo.',
    'ya-pedida': 'Esa acción ya está pedida.',
    limite: 'Demasiados intentos seguidos. Espera un minuto.',
    github: 'GitHub no responde ahora mismo.',
  };
  throw new ErrorPanel(tipo, detalle || PORDEFECTO[tipo] || `El servidor ha fallado (${estado}).`, extra);
}

// ── Entrada y salida ─────────────────────────────────────────────────────
// La entrada no redirige con el 404: si el panel no está configurado, la
// página de entrada se queda donde está y lo dice con calma.
export const entrar = (clave, senal) => pedir('/entrar', { metodo: 'POST', cuerpo: { clave }, senal, sinRedirigir: true });
export const salir = () => pedir('/salir', { metodo: 'POST', cuerpo: {}, sinRedirigir: true });

// ── Estado general ───────────────────────────────────────────────────────
export const leerEstado = (senal) => pedir('/estado', { senal });

// ── Órdenes al móvil ─────────────────────────────────────────────────────
// Ninguna acción v1 lleva parámetros (API.md): solo se manda la acción.
export const mandarOrden = (accion) => pedir('/orden', { metodo: 'POST', cuerpo: { accion } });
export const leerOrden = (id, senal) => pedir(`/orden/${encodeURIComponent(id)}`, { senal });

// ── Servidor (agregador) ─────────────────────────────────────────────────
// Vuelve a pedir los cuatro cines: 10–40 s según API.md.
export const refrescarServidor = () => pedir('/servidor/refrescar', { metodo: 'POST', cuerpo: {}, espera: 75000 });

// ── Enlaces de compra ────────────────────────────────────────────────────
// Prueba enlaces desde el servidor (6 s máximo cada uno): puede tardar.
export const comprobarEnlaces = (cine) => pedir('/enlaces/comprobar', { metodo: 'POST', cuerpo: cine ? { cine } : {}, espera: 75000 });
export const leerEnlaces = (senal) => pedir('/enlaces', { senal });
export const deducirPlantilla = ({ cine, sesion, enlaceBueno }) =>
  pedir('/enlaces/deducir', { metodo: 'POST', cuerpo: { cine, sesion, enlaceBueno }, espera: 60000 });
export const guardarPlantilla = (cine, plantilla) =>
  pedir('/enlaces', { metodo: 'PUT', cuerpo: { cine, plantilla } });

// ── Avisos ───────────────────────────────────────────────────────────────
export const vigilarAhora = () => pedir('/avisos/vigilar', { metodo: 'POST', cuerpo: {} });
export const avisoDePrueba = () => pedir('/avisos/prueba', { metodo: 'POST', cuerpo: {} });
