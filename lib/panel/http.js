// Piezas comunes de las rutas de /api/panel: comprobar la sesión (otra vez,
// además del middleware), respuestas JSON sin caché y errores con la forma
// del contrato ({ error, codigo }, ver docs/panel/API.md).

import { claveDelServidor, mismoOrigen, peticionConSesion } from './sesion.js';

const CABECERAS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
};

// Error que una ruta puede lanzar para responder con un código concreto.
export class ErrorPanel extends Error {
  constructor(estado, codigo, mensaje, extra = null) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.extra = extra;
  }
}

export function json(cuerpo, estado = 200, extra = {}) {
  return new Response(cuerpo === null ? null : JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CABECERAS, ...extra },
  });
}

export function sinCuerpo(estado = 204, extra = {}) {
  const h = { ...CABECERAS, ...extra };
  delete h['Content-Type'];
  return new Response(null, { status: estado, headers: h });
}

export function error(estado, codigo, mensaje, extra = null) {
  return json({ error: mensaje, codigo, ...(extra || {}) }, estado);
}

// Lo mismo que una URL que no existe. El middleware ya devuelve la página 404
// de Next; esto solo se ve si el middleware dejara de ejecutarse.
export function noExiste() {
  return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// Envuelve el manejador de una ruta. publica: solo para POST /entrar (no pide
// sesión, pero sí PANEL_CLAVE y mismo origen).
export function ruta(manejador, { publica = false } = {}) {
  return async (request, contexto) => {
    if (!claveDelServidor()) return noExiste();
    const metodo = request.method.toUpperCase();
    if (metodo !== 'GET' && metodo !== 'HEAD' && !mismoOrigen(request.headers, request.url)) return noExiste();
    if (!publica && !(await peticionConSesion(request))) return noExiste();
    try {
      return await manejador(request, contexto);
    } catch (e) {
      if (e instanceof ErrorPanel) return error(e.estado, e.codigo, e.message, e.extra);
      // Nunca el detalle interno entero: puede llevar URLs o cabeceras.
      console.error('[panel] fallo en', new URL(request.url).pathname, '—', String(e?.message ?? e).slice(0, 200));
      return error(500, 'servidor', 'Ha fallado el servidor del panel. Prueba otra vez en un momento.');
    }
  };
}

// Cuerpo JSON de como mucho `max` bytes. Siempre devuelve un objeto.
export async function leerJson(request, max = 16 * 1024) {
  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > max) throw new ErrorPanel(400, 'datos', 'La petición es demasiado grande.');
  const texto = await request.text();
  if (texto.length > max) throw new ErrorPanel(400, 'datos', 'La petición es demasiado grande.');
  if (!texto.trim()) return {};
  let datos;
  try { datos = JSON.parse(texto); } catch { throw new ErrorPanel(400, 'datos', 'La petición no es JSON válido.'); }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new ErrorPanel(400, 'datos', 'La petición tiene que ser un objeto JSON.');
  return datos;
}
