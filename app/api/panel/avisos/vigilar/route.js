// POST /api/panel/avisos/vigilar — lanza ya el vigilante del móvil
// (.github/workflows/vigilante-movil.yml) en vez de esperar al siguiente informe.

import { json, ruta } from '@/lib/panel/http.js';
import { lanzarVigilante } from '@/lib/panel/github.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export const POST = ruta(async () => {
  await lanzarVigilante();
  return json({ ok: true, aviso: 'Vigilante lanzado; tarda ~1 min en revisar.' }, 202);
});
