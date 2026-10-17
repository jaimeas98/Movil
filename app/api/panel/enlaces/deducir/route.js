// POST /api/panel/enlaces/deducir {cine, sesion, enlaceBueno} — deduce la
// plantilla a partir de un enlace bueno pegado y la prueba con hasta 5
// sesiones más (peticiones desde el servidor). No guarda nada.

import { json, leerJson, ruta } from '@/lib/panel/http.js';
import { deducir } from '@/lib/panel/enlaces.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
export const preferredRegion = 'cdg1';
export const maxDuration = 60;

export const POST = ruta(async (request) => json(await deducir(await leerJson(request))));
