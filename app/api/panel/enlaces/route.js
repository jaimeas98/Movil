// GET /api/panel/enlaces — plantillas actuales y sesiones de ejemplo con sus
// campos. PUT {cine, plantilla|null} — guarda (commit de data/enlaces.js).

import { json, leerJson, ruta } from '@/lib/panel/http.js';
import { guardar, listarEnlaces } from '@/lib/panel/enlaces.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
export const preferredRegion = 'cdg1';
export const maxDuration = 60;

export const GET = ruta(async () => json(await listarEnlaces()));
export const PUT = ruta(async (request) => json(await guardar(await leerJson(request))));
