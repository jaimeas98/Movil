// POST /api/panel/entrar — la clave del panel a cambio de la cookie de sesión.
// Contrato: docs/panel/API.md. Por qué así: lib/panel/sesion.js.
//
// Fuerza bruta: cada fallo espera ~800 ms antes de contestar, y más de 5
// fallos en 10 minutos desde la misma IP se cortan con 429. El límite vive en
// la memoria de la instancia (en Vercel puede haber varias y se reinician),
// así que es solo un freno; la protección de verdad es que la clave sea larga
// (PANEL_CLAVE pide al menos 12 caracteres).

import { cabeceraCookie, claveCorrecta, claveDelServidor, crearValorCookie } from '@/lib/panel/sesion.js';
import { error, ruta, sinCuerpo } from '@/lib/panel/http.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

const RETRASO_MS = 800;
const VENTANA_MS = 10 * 60 * 1000;
const MAX_FALLOS = 5;
const fallos = new Map(); // ip -> [instantes de fallo]

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function ipDe(request) {
  const xff = request.headers.get('x-forwarded-for');
  return (xff ? xff.split(',')[0] : request.headers.get('x-real-ip') || 'desconocida').trim().slice(0, 64);
}

function fallosRecientes(ip, ahora) {
  const lista = (fallos.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (lista.length) fallos.set(ip, lista); else fallos.delete(ip);
  return lista;
}

async function leerClave(request) {
  const tipo = request.headers.get('content-type') || '';
  const texto = (await request.text()).slice(0, 4096);
  if (tipo.includes('application/x-www-form-urlencoded')) {
    return { clave: new URLSearchParams(texto).get('clave'), formulario: true };
  }
  try { return { clave: JSON.parse(texto)?.clave, formulario: false }; } catch { return { clave: null, formulario: false }; }
}

const irA = (request, ruta) => new Response(null, {
  status: 303,
  headers: { Location: new URL(ruta, request.url).toString(), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
});

export const POST = ruta(async (request) => {
  const ahora = Date.now();
  const ip = ipDe(request);
  // Que el mapa no crezca sin límite si alguien prueba desde mil IPs.
  if (fallos.size > 5000) fallos.clear();

  const { clave, formulario } = await leerClave(request);
  if (fallosRecientes(ip, ahora).length >= MAX_FALLOS) {
    await esperar(RETRASO_MS);
    return formulario ? irA(request, '/panel/entrar?mal=2')
      : error(429, 'limite', 'Demasiados intentos seguidos. Espera un minuto.');
  }

  const servidor = claveDelServidor();
  if (!(await claveCorrecta(typeof clave === 'string' ? clave : '', servidor))) {
    fallos.set(ip, [...fallosRecientes(ip, ahora), ahora]);
    await esperar(RETRASO_MS);
    return formulario ? irA(request, '/panel/entrar?mal=1') : error(401, 'clave', 'Esa clave no vale.');
  }

  fallos.delete(ip);
  const segura = new URL(request.url).protocol === 'https:' || process.env.NODE_ENV === 'production';
  const cookie = cabeceraCookie(await crearValorCookie(servidor), { segura });
  if (formulario) {
    const r = irA(request, '/panel');
    r.headers.set('Set-Cookie', cookie);
    return r;
  }
  return sinCuerpo(204, { 'Set-Cookie': cookie });
}, { publica: true });
