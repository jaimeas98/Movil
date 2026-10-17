// POST /api/panel/salir — borra la cookie de sesión de este navegador.
// (Para cerrar TODAS las sesiones, se cambia PANEL_CLAVE en Vercel.)

import { cabeceraCookie } from '@/lib/panel/sesion.js';
import { ruta, sinCuerpo } from '@/lib/panel/http.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export const POST = ruta(async (request) => {
  const segura = new URL(request.url).protocol === 'https:' || process.env.NODE_ENV === 'production';
  return sinCuerpo(204, { 'Set-Cookie': cabeceraCookie('', { segura, borrar: true }) });
});
