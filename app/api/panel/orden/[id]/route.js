// GET /api/panel/orden/:id — en qué está una orden: pendiente (el móvil aún
// no la ha cogido), en curso, o su resultado. Para sondear cada 5 s.

import { error, json, ruta } from '@/lib/panel/http.js';
import { estadoDe, ID_VALIDO, leerOrdenesYResultados } from '@/lib/panel/ordenes.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export const GET = ruta(async (request, { params }) => {
  const id = String(params?.id ?? '');
  if (!ID_VALIDO.test(id)) return error(404, 'no-esta', 'Esa orden no existe.');
  const { ordenes, resultados } = await leerOrdenesYResultados();
  const orden = ordenes.find((o) => o.id === id);
  const resultado = resultados.find((r) => r.id === id) ?? null;
  if (!orden && !resultado) return error(404, 'no-esta', 'Esa orden ya no está (se guardan las últimas 20).');
  const base = orden ?? { id, accion: resultado.accion, pedida: null };
  return json({
    id,
    accion: base.accion,
    pedida: base.pedida ?? null,
    estado: estadoDe(base, resultados),
    resultado,
  });
});
