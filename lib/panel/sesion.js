// Sesión del panel de control: una clave y una cookie firmada.
//
// POR QUÉ ASÍ (ver docs/panel/PLAN.md)
// El panel es de una sola persona, así que no hay cuentas: una clave larga en
// la variable de entorno PANEL_CLAVE. Al acertarla se deja la cookie `panel`
// con su caducidad y una firma HMAC-SHA256; el servidor no guarda nada (en
// Vercel cada petición puede caer en una instancia distinta, sin memoria
// compartida). La clave de la firma se DERIVA de PANEL_CLAVE: cambiar la clave
// invalida todas las cookies a la vez, sin tener que mantener otra variable.
//
// Este módulo lo usan el middleware (runtime Edge) y las rutas (Node), así que
// solo usa Web Crypto (crypto.subtle), que existe en los dos. Nada de
// node:crypto.
//
// CERRAR TODAS LAS SESIONES: la cookie no se puede revocar una a una (no hay
// nada guardado en el servidor), así que se hace por fecha: con
// PANEL_SESIONES_DESDE=<fecha ISO> en Vercel (y redesplegando), toda cookie
// emitida antes deja de valer. Cambiar PANEL_CLAVE también las cierra todas.
// La sesión dura 14 días: lo que dura una cookie robada si nadie hace nada.
//
// Las comparaciones son en tiempo constante: la de la firma la hace
// crypto.subtle.verify, y la de la clave compara los SHA-256 de las dos (misma
// longitud siempre) byte a byte sin salir antes.

export const COOKIE = 'panel';
export const DURACION_S = 14 * 24 * 3600;      // 14 días
export const CLAVE_MINIMA = 12;                 // más corta no protege nada (decisión de Jaime: 12, con el límite de intentos)
const ETIQUETA_DERIVACION = 'cartelera-panel/firma-cookie/v1';
const FORMATO = /^v1\.(\d{9,12})\.([A-Za-z0-9_-]{43})$/;

const texto = new TextEncoder();

// PANEL_SESIONES_DESDE en milisegundos, o null si no está (o no es una fecha).
export function sesionesDesde(env = process.env) {
  const t = Date.parse(env.PANEL_SESIONES_DESDE ?? '');
  return Number.isFinite(t) ? t : null;
}

// La clave del servidor, o null si no está configurada (o es demasiado corta:
// entonces el panel no existe, igual que sin clave).
export function claveDelServidor(env = process.env) {
  const c = env.PANEL_CLAVE;
  return typeof c === 'string' && c.length >= CLAVE_MINIMA ? c : null;
}

function aBase64Url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

// Clave HMAC derivada de PANEL_CLAVE. Se cachea la última (derivarla cuesta
// dos operaciones de crypto por petición si no).
let _cache = { de: null, clave: null };
async function claveDeFirma(clavePanel) {
  if (_cache.de === clavePanel && _cache.clave) return _cache.clave;
  const base = await crypto.subtle.importKey('raw', texto.encode(clavePanel), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const derivada = await crypto.subtle.sign('HMAC', base, texto.encode(ETIQUETA_DERIVACION));
  const clave = await crypto.subtle.importKey('raw', derivada, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  _cache = { de: clavePanel, clave };
  return clave;
}

// Valor de la cookie: v1.<caducidad en segundos>.<firma base64url>
export async function crearValorCookie(clavePanel, ahoraMs = Date.now()) {
  const caduca = Math.floor(ahoraMs / 1000) + DURACION_S;
  const datos = `v1.${caduca}`;
  const firma = await crypto.subtle.sign('HMAC', await claveDeFirma(clavePanel), texto.encode(datos));
  return `${datos}.${aBase64Url(firma)}`;
}

// ¿Es buena esta cookie? Firma correcta, no caducada, con una caducidad que
// esta versión pudo emitir (no más de 14 días en el futuro) y emitida después
// de PANEL_SESIONES_DESDE (desdeMs), si está puesta.
export async function cookieValida(valor, clavePanel, ahoraMs = Date.now(), desdeMs = null) {
  if (!clavePanel || typeof valor !== 'string' || valor.length > 100) return false;
  const m = valor.match(FORMATO);
  if (!m) return false;
  const caduca = Number(m[1]);
  const ahora = Math.floor(ahoraMs / 1000);
  if (!(caduca > ahora) || caduca > ahora + DURACION_S + 60) return false;
  // Se emitió justo DURACION_S antes de caducar.
  if (Number.isFinite(desdeMs) && (caduca - DURACION_S) * 1000 < desdeMs) return false;
  let firma;
  try { firma = deBase64Url(m[2]); } catch { return false; }
  if (firma.length !== 32) return false;
  return crypto.subtle.verify('HMAC', await claveDeFirma(clavePanel), firma, texto.encode(`v1.${m[1]}`));
}

// Compara la clave escrita con la del servidor en tiempo constante.
export async function claveCorrecta(escrita, clavePanel) {
  if (!clavePanel || typeof escrita !== 'string' || escrita.length > 1000) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', texto.encode(escrita)),
    crypto.subtle.digest('SHA-256', texto.encode(clavePanel)),
  ]);
  return igualesTiempoConstante(new Uint8Array(a), new Uint8Array(b));
}

export function igualesTiempoConstante(a, b) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

// Lee la cookie `panel` de una cabecera Cookie cruda.
export function leerCookie(cabecera) {
  if (!cabecera) return null;
  for (const trozo of String(cabecera).split(';')) {
    const i = trozo.indexOf('=');
    if (i < 0) continue;
    if (trozo.slice(0, i).trim() === COOKIE) return trozo.slice(i + 1).trim();
  }
  return null;
}

// Cabecera Set-Cookie. Secure siempre salvo en http://localhost (desarrollo y
// pruebas); los navegadores la aceptan igual en localhost, pero así también
// funciona con curl.
export function cabeceraCookie(valor, { segura = true, borrar = false } = {}) {
  const partes = [
    `${COOKIE}=${borrar ? '' : valor}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${borrar ? 0 : DURACION_S}`,
  ];
  if (segura) partes.push('Secure');
  return partes.join('; ');
}

// ¿Viene esta petición de una página del mismo sitio? (CSRF, además de
// SameSite=Strict.) Sin Origin ni Sec-Fetch-Site no se fía: los navegadores
// siempre mandan al menos uno en un POST.
export function mismoOrigen(headers, urlPeticion) {
  const sfs = headers.get('sec-fetch-site');
  if (sfs && sfs !== 'same-origin') return false;
  const origin = headers.get('origin');
  if (!origin) return Boolean(sfs);
  if (origin === 'null') return false;
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  const esperado = headers.get('x-forwarded-host') || headers.get('host') || new URL(urlPeticion).host;
  return host === esperado;
}

// ¿Tiene sesión esta petición? (Request de Next o de la plataforma.)
export async function peticionConSesion(request, env = process.env) {
  const clave = claveDelServidor(env);
  if (!clave) return false;
  const valor = request.cookies?.get?.(COOKIE)?.value ?? leerCookie(request.headers.get('cookie'));
  return cookieValida(valor, clave, Date.now(), sesionesDesde(env));
}

// Para los componentes de servidor del panel (app/panel/**): sin sesión,
// notFound(). La puerta de verdad es middleware.js; esto es la segunda.
// Los imports de Next van dentro para que este módulo se pueda probar con
// node a secas.
export async function exigirSesion() {
  const { cookies } = await import('next/headers');
  const { notFound } = await import('next/navigation');
  const clave = claveDelServidor();
  const valor = cookies().get(COOKIE)?.value;
  if (!clave || !(await cookieValida(valor, clave, Date.now(), sesionesDesde()))) notFound();
  return true;
}
