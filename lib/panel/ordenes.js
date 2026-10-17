// Órdenes del panel al móvil (rama huérfana `ordenes-movil`, fichero
// ordenes.json) y su seguimiento (ordenes-resultado.json en `estado-movil`).
//
// LISTA CERRADA
// El panel solo puede pedir estas acciones, y el móvil solo ejecuta estas
// mismas (scripts/movil/acciones.sh, con su propio `case`). Nunca un comando
// libre: si alguien consiguiera la clave del panel, lo peor que podría hacer
// es pedir una recogida de más, no ejecutar lo que quisiera en un móvil que
// está en casa de Jaime. Si se añade una acción, se añade en los dos sitios
// (y en docs/panel/API.md).

import { actualizarFichero, leerFichero, RAMA_ESTADO, RAMA_ORDENES } from './github.js';
import { ErrorPanel } from './http.js';

export const ACCIONES = {
  informe: 'Vuelta sin recoger: refresca el estado ya',
  recoger: 'Recogida completa ya (Yelmo + copia de mk2 y Arte Siete)',
  'recoger-yelmo': 'Solo Yelmo',
  respaldo: 'Solo la copia de mk2 y Arte Siete',
  'probar-yelmo': 'Recolector en modo de prueba (no publica)',
  diagnostico: 'Versiones, disco, memoria, git, bucle, batería y red (sin IPs)',
  'reiniciar-bucle': 'Mata y vuelve a arrancar el bucle del móvil',
  'actualizar-paquetes': 'pkg upgrade en segundo plano (largo)',
};

export const MAX_ORDENES = 20;
export const ID_VALIDO = /^o-\d{8}-\d{4}-[a-z0-9]{4,8}$/;
export const CADUCA_MS = 6 * 3600 * 1000;   // el móvil no ejecuta órdenes más viejas

// LÍMITES (revisión de seguridad del 17-10-2026). Con la clave del panel en
// malas manos, lo peor que se puede hacer es pedir acciones de la lista; sin
// límites, eso es pedirlas sin parar (actualizar paquetes cinco veces, una
// recogida cada minuto…). Cada acción tiene su espera mínima entre dos
// pedidas, y hay un tope de órdenes por hora. El MÓVIL aplica los mismos
// límites por su cuenta (scripts/movil/ordenes.mjs), con su propio registro:
// no se fía de que el servidor los haya respetado.
const MIN = 60 * 1000;
export const ESPERAS_MS = {
  informe: 2 * MIN,
  diagnostico: 2 * MIN,
  recoger: 30 * MIN,
  'recoger-yelmo': 30 * MIN,
  respaldo: 30 * MIN,
  'probar-yelmo': 30 * MIN,
  'reiniciar-bucle': 10 * MIN,
  'actualizar-paquetes': 24 * 60 * MIN,
};
export const MAX_POR_HORA = 10;
// Una orden «en curso» cuenta como pendiente… salvo que lleve tanto que el
// móvil se apagó a medias (la más larga, actualizar-paquetes, se corta a 30 min).
const EN_CURSO_VALE_MS = 2 * 3600 * 1000;
const NO_CUENTAN = new Set(['rechazada', 'caducada']);

const LEEME = 'Órdenes del panel de control para el móvil recolector.\n' +
  'Las escribe el panel (lib/panel/ordenes.js) y las lee scripts/movil/ordenes.sh.\n' +
  'Solo acciones de una lista cerrada (scripts/movil/acciones.sh).\n';
// Rama sin nada que desplegar: que Vercel no lo intente, lea su configuración
// de donde la lea (también está en el vercel.json de la web).
const VERCEL = JSON.stringify({ git: { deploymentEnabled: false } }, null, 2) + '\n';

function idNuevo(ahora = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(ahora).map((x) => [x.type, x.value]));
  const azar = [...crypto.getRandomValues(new Uint8Array(2))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `o-${p.year}${p.month}${p.day}-${p.hour}${p.minute}-${azar}`;
}

// Una orden bien formada: cada campo de su tipo. Una rara se descarta (y al
// reescribir ordenes.json, desaparece).
export function ordenValida(o) {
  return Boolean(o) && typeof o === 'object' && !Array.isArray(o)
    && typeof o.id === 'string' && ID_VALIDO.test(o.id)
    && typeof o.accion === 'string' && Object.hasOwn(ACCIONES, o.accion)
    && typeof o.pedida === 'string' && Number.isFinite(Date.parse(o.pedida))
    && (o.parametros === undefined || (o.parametros !== null && typeof o.parametros === 'object' && !Array.isArray(o.parametros)));
}

export function parsearOrdenes(texto) {
  try {
    const d = JSON.parse(texto ?? '');
    return Array.isArray(d?.ordenes) ? d.ordenes.filter(ordenValida) : [];
  } catch { return []; }
}

export function parsearResultados(texto) {
  try {
    const d = JSON.parse(texto ?? '');
    return Array.isArray(d?.resultados)
      ? d.resultados.filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && typeof r.accion === 'string')
      : [];
  } catch { return []; }
}

export function cuantoFalta(s) {
  if (s < 60) return `${s} s`;
  const min = Math.ceil(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

const espera = (accion, ms, porque) => {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return new ErrorPanel(429, 'espera', `Podrás pedir «${accion}» otra vez en ${cuantoFalta(s)} (${porque}).`, { reintentarEn: s, accion });
};

// ¿Se puede pedir `accion` ahora? Lanza el ErrorPanel que toque si no.
//  · 409 ya-pedida: hay una igual pendiente o en curso
//  · 429 espera: aún no ha pasado su espera mínima, o ya van 10 en una hora
export function comprobarLimites(accion, ordenes, resultados, ahora = Date.now()) {
  const resultadoDe = new Map(resultados.map((r) => [r.id, r]));
  const t = (x) => Date.parse(x ?? '');
  // Sin `inicio` legible también cuenta: ante la duda, pendiente.
  const enCurso = (r) => r?.estado === 'en-curso' && !(ahora - t(r.inicio) >= EN_CURSO_VALE_MS);

  const pendiente = ordenes.find((o) => o.accion === accion
    && ((!resultadoDe.has(o.id) && ahora - t(o.pedida) < CADUCA_MS) || enCurso(resultadoDe.get(o.id))))
    ?? resultados.find((r) => r.accion === accion && enCurso(r));
  if (pendiente) {
    throw new ErrorPanel(409, 'ya-pedida', `Ya hay una orden «${accion}» pendiente o en marcha (${pendiente.id}).`, { id: pendiente.id });
  }

  // Lo que cuenta: lo pedido (salvo lo que el móvil rechazó o dejó caducar) y
  // lo que el móvil empezó, aunque ya no esté en ordenes.json.
  const cuentan = ordenes.filter((o) => !NO_CUENTAN.has(resultadoDe.get(o.id)?.estado)).map((o) => ({ accion: o.accion, t: t(o.pedida) }))
    .concat(resultados.filter((r) => !NO_CUENTAN.has(r.estado)).map((r) => ({ accion: r.accion, t: t(r.inicio) })))
    .filter((x) => Number.isFinite(x.t));
  const ultima = Math.max(-Infinity, ...cuentan.filter((x) => x.accion === accion).map((x) => x.t));
  const minimo = ESPERAS_MS[accion];
  if (ahora - ultima < minimo) throw espera(accion, ultima + minimo - ahora, `como mucho una cada ${cuantoFalta(minimo / 1000)}`);

  const enLaHora = ordenes.filter((o) => !NO_CUENTAN.has(resultadoDe.get(o.id)?.estado))
    .map((o) => t(o.pedida)).filter((x) => ahora - x < 3600 * 1000).sort((a, b) => a - b);
  if (enLaHora.length >= MAX_POR_HORA) {
    throw espera(accion, enLaHora[enLaHora.length - MAX_POR_HORA] + 3600 * 1000 - ahora, `como mucho ${MAX_POR_HORA} órdenes por hora`);
  }
}

// Valida lo que llega del panel. Devuelve la acción.
export function validarPeticion(cuerpo) {
  const accion = cuerpo?.accion;
  if (typeof accion !== 'string' || !Object.hasOwn(ACCIONES, accion)) {
    throw new ErrorPanel(400, 'datos', `Acción desconocida. Valen: ${Object.keys(ACCIONES).join(', ')}.`);
  }
  const p = cuerpo.parametros;
  if (p !== undefined && p !== null && (typeof p !== 'object' || Array.isArray(p) || Object.keys(p).length)) {
    throw new ErrorPanel(400, 'datos', 'Ninguna acción lleva parámetros todavía.');
  }
  return accion;
}

export async function leerOrdenesYResultados() {
  const [o, r] = await Promise.all([
    leerFichero(RAMA_ORDENES, 'ordenes.json', { ttlMs: 4000 }),
    leerFichero(RAMA_ESTADO, 'ordenes-resultado.json', { ttlMs: 4000 }),
  ]);
  return { ordenes: parsearOrdenes(o), resultados: parsearResultados(r), hayOrdenes: o !== null, hayResultados: r !== null };
}

// Estado de una orden según lo que ha publicado el móvil.
export function estadoDe(orden, resultados) {
  const r = resultados.find((x) => x.id === orden.id);
  return r ? (r.estado || (r.codigo === 0 ? 'hecha' : 'fallida')) : 'pendiente';
}

export function pendientes(ordenes, resultados) {
  return ordenes.filter((o) => !resultados.some((r) => r.id === o.id))
    .sort((a, b) => String(b.pedida).localeCompare(String(a.pedida)));
}

// Añade una orden a ordenes.json (recortando a las últimas 20).
export async function pedirOrden(accion, ahora = new Date()) {
  const { resultados } = await leerOrdenesYResultados();
  const orden = { id: idNuevo(ahora), accion, pedida: ahora.toISOString(), parametros: {} };
  await actualizarFichero(RAMA_ORDENES, 'ordenes.json', (texto) => {
    const lista = parsearOrdenes(texto);
    // Con lo que hay en GitHub justo ahora (se vuelve a mirar en cada
    // reintento): dos toques seguidos no son dos recogidas.
    comprobarLimites(accion, lista, resultados, ahora.getTime());
    return JSON.stringify({ ordenes: [...lista, orden].slice(-MAX_ORDENES) }, null, 2) + '\n';
  }, `Panel: orden «${accion}» (${orden.id})`, { huerfana: { 'LEEME.txt': LEEME, 'vercel.json': VERCEL } });
  return { ...orden, estado: 'pendiente' };
}
