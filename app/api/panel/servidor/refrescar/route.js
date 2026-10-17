// POST /api/panel/servidor/refrescar — vuelve a pedir los 4 cines ahora,
// saltándose la caché de 5 min del agregador (también para la web pública).

import { json, ruta } from '@/lib/panel/http.js';
import { refrescarServidor } from '@/lib/panel/servidor.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
export const preferredRegion = 'cdg1';
export const maxDuration = 60;

export const POST = ruta(async () => json(await refrescarServidor()));
