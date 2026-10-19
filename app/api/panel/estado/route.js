// GET /api/panel/estado[?partes=movil,servidor,avisos] — todo el panel de un
// vistazo. Cada parte se pide a la vez y un fallo en una no tumba las demás:
// sale con su `error` y lo que se haya podido leer. Contrato: docs/panel/API.md.

import { json, ruta } from '@/lib/panel/http.js';
import { estadoMovil } from '@/lib/panel/movil.js';
import { estadoServidor } from '@/lib/panel/servidor.js';
import { caducidadToken, hayEscritura, leerAvisos, RAMA_APP, REPO, tokenRechazado } from '@/lib/panel/github.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
export const preferredRegion = 'cdg1';
export const maxDuration = 60;

const PARTES = ['movil', 'servidor', 'avisos'];

export const GET = ruta(async (request) => {
  const pedidas = new URL(request.url).searchParams.get('partes');
  const partes = pedidas ? PARTES.filter((p) => pedidas.split(',').includes(p)) : PARTES;
  const escritura = hayEscritura();

  const tareas = {
    movil: () => estadoMovil(),
    servidor: () => estadoServidor(),
    avisos: () => leerAvisos().then((a) => ({ ...a, error: null })),
  };
  const vacio = {
    movil: (e) => ({ informe: null, latidoHace: null, vivo: false, bateria: null, historialBateria: [], ultimasVueltas: [], ultimasRecogidas: [], registro: null, ordenes: { pendientes: [], resultados: [] }, ficheros: {}, error: e }),
    servidor: (e) => ({ generadoEn: null, cacheHace: null, cines: [], instantaneaYelmo: null, respaldo: null, claves: null, error: e }),
    avisos: (e) => ({ abiertos: [], recientes: [], error: e }),
  };
  const resultado = await Promise.all(partes.map(async (p) => {
    try { return [p, await tareas[p]()]; }
    catch (e) { return [p, vacio[p](String(e?.message ?? e).slice(0, 300))]; }
  }));

  return json({
    generadoEn: new Date().toISOString(),
    github: {
      escritura,
      repo: REPO,
      ramaApp: RAMA_APP,
      lectura: escritura ? 'api' : 'publica',
      // Cuándo caduca el token (ISO), null si no caduca; sin token o si aún
      // no se ha usado en esta instancia, no viene (ver github.js).
      ...(escritura && caducidadToken() !== undefined ? { caducaToken: caducidadToken() } : {}),
      // GitHub ha respondido 401 con el token: caducado o revocado.
      ...(escritura && tokenRechazado() ? { tokenRechazado: true } : {}),
      aviso: escritura ? null
        : 'Solo lectura: falta PANEL_GITHUB_TOKEN. Lo del móvil puede llegar con hasta 5 min de retraso y no se pueden mandar órdenes.',
    },
    ...Object.fromEntries(resultado),
  });
});
