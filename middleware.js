// Puerta del panel de control (/panel y /api/panel). Corre en el runtime Edge
// de Vercel antes que cualquier página o ruta.
//
// Sin sesión, todo lo del panel responde EXACTAMENTE lo mismo que una URL que
// no existe: se reescribe a una ruta inexistente y Next sirve su página 404 de
// siempre, con su código 404. Ni un "acceso denegado" ni un formulario que
// delate que ahí hay algo. Las únicas excepciones son la caja de la clave
// (/panel/entrar) y su POST (/api/panel/entrar), y solo si PANEL_CLAVE está
// configurada: sin clave, el panel no existe en absoluto.
//
// Las rutas de /api/panel vuelven a comprobar la sesión por su cuenta
// (lib/panel/http.js): si esto se desconfigurara, seguirían cerradas.

import { NextResponse } from 'next/server';
import { claveDelServidor, cookieValida, COOKIE, mismoOrigen, sesionesDesde } from './lib/panel/sesion.js';

const NO_INDEXAR = 'noindex, nofollow';

function noExiste(request) {
  return NextResponse.rewrite(new URL('/_no-existe', request.url));
}

function seguir() {
  const res = NextResponse.next();
  res.headers.set('X-Robots-Tag', NO_INDEXAR);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  // Que ninguna otra web pueda meter el panel en un marco (clickjacking:
  // hacerle pulsar "recoger" o "actualizar paquetes" sin que lo vea).
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  return res;
}

export async function middleware(request) {
  // process.env.PANEL_CLAVE escrito así, literal: Next mira qué variables usa
  // el middleware para dárselas en el runtime Edge.
  const clave = claveDelServidor({ PANEL_CLAVE: process.env.PANEL_CLAVE });
  if (!clave) return noExiste(request);

  const ruta = request.nextUrl.pathname.replace(/\/+$/, '') || '/';
  const metodo = request.method.toUpperCase();
  const escritura = metodo !== 'GET' && metodo !== 'HEAD';

  // CSRF: además de SameSite=Strict, ninguna escritura desde otro sitio.
  if (escritura && !mismoOrigen(request.headers, request.url)) return noExiste(request);

  const conSesion = await cookieValida(request.cookies.get(COOKIE)?.value, clave, Date.now(),
    sesionesDesde({ PANEL_SESIONES_DESDE: process.env.PANEL_SESIONES_DESDE }));

  if (ruta === '/api/panel/entrar') return metodo === 'POST' ? seguir() : noExiste(request);
  if (ruta === '/panel/entrar') {
    // Ya dentro: la caja de la clave no pinta nada.
    if (conSesion && !escritura) return NextResponse.redirect(new URL('/panel', request.url), 303);
    return seguir();
  }

  return conSesion ? seguir() : noExiste(request);
}

export const config = {
  matcher: ['/panel', '/panel/:path*', '/api/panel', '/api/panel/:path*'],
};
