// Historial de batería del móvil y previsión de cuánto le queda.
//
// POR QUÉ
// Un porcentaje suelto no dice si hay que preocuparse: un 40 % que baja un
// 2 % por hora aguanta todo el día, y un 40 % que baja un 15 % por hora (el
// móvil desenchufado con Chromium recogiendo) se apaga antes de que nadie lo
// mire. Así que cada vuelta (cada 15 min) anota un punto y de los últimos
// puntos SIN CARGAR sale el ritmo de descarga. Con eso el vigilante de GitHub
// (scripts/vigilante/revisar.mjs) avisa por lo que VA a pasar, no solo por lo
// que ya ha pasado.

const DIA_MS = 24 * 3600 * 1000;
const VENTANA_RITMO_MS = 2 * 3600 * 1000;   // el ritmo se mide sobre las últimas 2 h sin cargar
const MINIMO_RITMO_MS = 20 * 60 * 1000;     // con menos de 20 min de datos, el porcentaje (entero) no dice nada
export const RESERVA = 15;                   // por debajo de esto el móvil ya está en apuros

// Añade un punto { t (ms), pct, cargando } y deja solo las últimas 24 h.
export function anotar(historial, punto) {
  const lista = Array.isArray(historial) ? historial.filter((p) => Number.isFinite(p?.t)) : [];
  if (Number.isFinite(punto?.t) && Number.isFinite(punto?.pct)) lista.push(punto);
  return lista.filter((p) => punto.t - p.t <= DIA_MS).slice(-200);
}

// { ritmoPorHora, horasHastaReserva, desenchufadoDesde } con el último punto
// como "ahora". Cargando: todo null salvo que no hay prisa.
export function prevision(historial) {
  const vacia = { ritmoPorHora: null, horasHastaReserva: null, desenchufadoDesde: null };
  if (!historial?.length) return vacia;
  const ultimo = historial.at(-1);
  if (ultimo.cargando) return vacia;

  // El tramo actual sin cargar: desde el último punto que sí cargaba.
  let i = historial.length - 1;
  while (i > 0 && !historial[i - 1].cargando) i--;
  const tramo = historial.slice(i);
  const desenchufadoDesde = new Date(tramo[0].t).toISOString();

  const recientes = tramo.filter((p) => ultimo.t - p.t <= VENTANA_RITMO_MS);
  const primero = recientes[0];
  const lapso = ultimo.t - primero.t;
  if (lapso < MINIMO_RITMO_MS) return { ...vacia, desenchufadoDesde };

  // Nunca negativo: si sube sin cargar es un dato raro, no una buena noticia.
  const ritmoPorHora = Math.max(0, (primero.pct - ultimo.pct) / (lapso / 3600000));
  const horasHastaReserva = ritmoPorHora > 0 ? Math.max(0, (ultimo.pct - RESERVA) / ritmoPorHora) : null;
  return {
    ritmoPorHora: Math.round(ritmoPorHora * 10) / 10,
    horasHastaReserva: horasHastaReserva === null ? null : Math.round(horasHastaReserva * 10) / 10,
    desenchufadoDesde,
  };
}
