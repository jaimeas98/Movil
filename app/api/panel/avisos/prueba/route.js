// POST /api/panel/avisos/prueba — el vigilante abre un aviso de prueba (que
// se cierra solo en la revisión siguiente), para comprobar que llegan.

import { json, ruta } from '@/lib/panel/http.js';
import { lanzarVigilante } from '@/lib/panel/github.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export const POST = ruta(async () => {
  await lanzarVigilante({ prueba: true });
  return json({ ok: true, aviso: 'Aviso de prueba pedido; debería llegarte en 1–2 min.' }, 202);
});
