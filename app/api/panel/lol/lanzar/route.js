// POST /api/panel/lol/lanzar { tarea } — lanza ya una tarea de GitHub Actions
// del visor de LoL (respaldo, cuerpo-tecnico o captura; lista cerrada en
// lib/panel/lol.js) en vez de esperar a su calendario.

import { json, leerJson, ruta } from '@/lib/panel/http.js';
import { lanzarTareaLol } from '@/lib/panel/lol.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export const POST = ruta(async (request) => {
  const { tarea } = await leerJson(request, 1024);
  await lanzarTareaLol(tarea);
  return json({ ok: true, tarea, aviso: 'Tarea lanzada; GitHub tarda unos segundos en ponerla en marcha.' }, 202);
});
