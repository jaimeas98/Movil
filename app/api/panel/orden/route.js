// POST /api/panel/orden {accion} — pide al móvil una acción de la lista
// cerrada (lib/panel/ordenes.js). El móvil la recoge en ~1 min.

import { json, leerJson, ruta } from '@/lib/panel/http.js';
import { pedirOrden, validarPeticion } from '@/lib/panel/ordenes.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export const POST = ruta(async (request) => {
  const accion = validarPeticion(await leerJson(request));
  return json(await pedirOrden(accion), 201);
});
