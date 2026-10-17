// POST /api/panel/enlaces/comprobar {cine?} — prueba unos cuantos enlaces de
// compra de hoy de cada cine (o de uno) y dice cuántos responden bien.

import { json, leerJson, ruta } from '@/lib/panel/http.js';
import { comprobar } from '@/lib/panel/enlaces.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
export const preferredRegion = 'cdg1';
export const maxDuration = 60;

export const POST = ruta(async (request) => json(await comprobar(await leerJson(request))));
