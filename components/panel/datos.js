// De la respuesta de /api/panel/estado a lo que enseña el panel.
//
// Dos pasos, separados a propósito:
//  1. normalizar(): deja la respuesta en una forma fija, tolerando campos que
//     falten o que lleguen con otro nombre o en otra unidad. El móvil escribe
//     ficheros que cambian con el tiempo (versiones viejas del recolector,
//     vueltas a medias), así que las pantallas nunca leen la respuesta cruda:
//     si el contrato se mueve, se arregla aquí y en ningún otro sitio.
//  2. valorar(): decide, para cada cosa, si está bien, en aviso, en fallo o
//     sin datos, con una frase. El Resumen y la navegación leen lo mismo, así
//     que no puede pasar que una diga "bien" y la otra "fallo".

import { CINEMAS } from '@/lib/cinemas/config.js';
import { aFecha, duracion, relativa, absoluta } from './tiempo.js';

// ── Umbrales ──────────────────────────────────────────────────────────────
// El bucle del móvil da una vuelta cada 15 min: con más de 32 min se ha
// saltado una (aviso); a los 45 min el servidor ya lo da por no vivo
// (`vivo`, lo mismo que usa el vigilante) y eso es un fallo.
export const LATIDO_AVISO_MS = 32 * 60e3;
export const LATIDO_FALLO_MS = 45 * 60e3;
export const RESERVA = 15;               // como scripts/movil/bateria.mjs
const RECOGIDA_AVISO_MS = 26 * 3600e3;   // recoge cada ~11 h: más de un día sin recoger ya es raro

const NOMBRE_CORTO = {
  'cinesur-bahia-cadiz': 'Cinesur Bahía',
  'yelmo-bahia-sur': 'Yelmo Bahía Sur',
  'yelmo-jerez': 'Yelmo Área Sur',
  'arte-siete-puerto': 'Arte Siete',
};
export const nombreCine = (id) => NOMBRE_CORTO[id] || CINEMAS.find((c) => c.id === id)?.short || id || 'Cine';
export const ordenCines = CINEMAS.map((c) => c.id);

// ── Ayudas ────────────────────────────────────────────────────────────────
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const txt = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const lista = (v) => (Array.isArray(v) ? v : []);
const ms = (v) => aFecha(v)?.getTime() ?? null;
function de(obj, ...claves) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of claves) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

// Un .jsonl llega como texto o como lista ya leída: las dos valen.
function lineas(v) {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object');
  if (typeof v !== 'string') return [];
  return v.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// Las edades llegan en segundos (`latidoHace`, `edadS`, `cacheHace`).
function segAms(v) {
  const n = num(v);
  return n == null ? null : n * 1000;
}

// "fallo al recoger", "error: …", "❌" → fallo. "sin recogida: no tocaba" → bien.
export function nivelDeResultado(resultado, error) {
  const r = `${resultado || ''} ${error || ''}`.toLowerCase();
  if (!r.trim()) return 'nada';
  if (error || /fallo|error|❌|bloque|cloudflare|403|no se ha podido|timeout|caduc/.test(r)) return 'fallo';
  if (/aviso|parcial|incomplet|sin datos|reintent/.test(r)) return 'aviso';
  return 'bien';
}

// ── 1. Normalizar ─────────────────────────────────────────────────────────
function normalizarBateria(b, informe) {
  const base = b && typeof b === 'object' ? b : {};
  const delInforme = informe?.bateria && typeof informe.bateria === 'object' ? informe.bateria : {};
  const pct = num(de(base, 'porcentaje', 'pct', 'nivel')) ?? num(de(delInforme, 'porcentaje', 'pct'));
  if (pct == null && !Object.keys(base).length && !Object.keys(delInforme).length) return null;
  const prev = de(base, 'prevision') || {};
  return {
    pct,
    cargando: Boolean(de(base, 'cargando') ?? de(delInforme, 'cargando')),
    estado: txt(de(base, 'estado') ?? de(delInforme, 'estado')),
    temperatura: num(de(base, 'temperatura') ?? de(delInforme, 'temperatura')),
    ritmoPorHora: num(de(base, 'ritmoPorHora', 'ritmo') ?? de(prev, 'ritmoPorHora')),
    horasHastaReserva: num(de(base, 'horasHastaReserva') ?? de(prev, 'horasHastaReserva')),
    desenchufadoDesde: ms(de(base, 'desenchufadoDesde') ?? de(prev, 'desenchufadoDesde')),
  };
}

function normalizarHistorialBateria(h) {
  const puntos = Array.isArray(h) ? h : lista(h?.puntos ?? h?.historial);
  return puntos
    .map((p) => ({ t: ms(de(p, 't', 'hora', 'ts')), pct: num(de(p, 'pct', 'porcentaje')), cargando: Boolean(p?.cargando) }))
    .filter((p) => p.t != null && p.pct != null)
    .sort((a, b) => a.t - b.t);
}

function normalizarVuelta(v) {
  const t = ms(de(v, 't', 'hora', 'vuelta', 'inicio'));
  const resultado = txt(de(v, 'resultado'));
  const error = txt(de(v, 'error'));
  const bat = de(v, 'bateria');
  return {
    t,
    resultado,
    motivo: txt(de(v, 'motivo')),
    error,
    bateria: typeof bat === 'object' && bat ? num(bat.porcentaje ?? bat.pct) : num(bat),
    cargando: typeof v?.cargando === 'boolean' ? v.cargando : null,
    ritmo: num(de(v, 'ritmo', 'ritmoPorHora')),
    codigo: txt(de(v, 'codigo')),
    orden: txt(de(v, 'orden')),
    nivel: nivelDeResultado(resultado, error),
  };
}

function normalizarRecogida(r) {
  const t = ms(de(r, 't', 'hora', 'fin', 'inicio'));
  let duracionMs = segAms(de(r, 'duracionS'));
  if (duracionMs == null) {
    const i = ms(r?.inicio), f = ms(r?.fin);
    if (i != null && f != null) duracionMs = f - i;
  }
  // Por cine: { id: {dias, peliculas} } o [{cine, dias, peliculas}]
  const crudo = de(r, 'cines', 'resumen', 'porCine');
  let cines = [];
  if (Array.isArray(crudo)) {
    cines = crudo.map((c) => ({ id: txt(de(c, 'id', 'cine')), dias: num(c?.dias), peliculas: num(c?.peliculas), error: txt(c?.error) }));
  } else if (crudo && typeof crudo === 'object') {
    cines = Object.entries(crudo).map(([id, c]) => ({ id, dias: num(c?.dias), peliculas: num(c?.peliculas), error: txt(c?.error) }));
  }
  const resultado = txt(de(r, 'resultado', 'estado'));
  const error = txt(de(r, 'error'));
  const algunCineMal = cines.some((c) => c.error);
  return {
    t,
    duracionMs,
    cines,
    motivo: txt(de(r, 'motivo')),
    partes: lista(r?.partes).filter((x) => typeof x === 'string'),
    orden: txt(de(r, 'orden')),
    resultado,
    error,
    nivel: error ? 'fallo' : algunCineMal ? 'aviso' : nivelDeResultado(resultado ?? 'bien', null),
  };
}

function normalizarOrden(o) {
  const inicio = ms(de(o, 'inicio', 'empezada'));
  const fin = ms(de(o, 'fin', 'terminada', 'acabada'));
  return {
    id: txt(de(o, 'id')),
    accion: txt(de(o, 'accion')),
    pedida: ms(de(o, 'pedida', 'creada')),
    inicio,
    fin,
    codigo: num(de(o, 'codigo', 'salida_codigo', 'exit')),
    salida: typeof o?.salida === 'string' ? o.salida : typeof o?.texto === 'string' ? o.texto : null,
    estado: txt(de(o, 'estado')) || 'pendiente', // pendiente | en-curso | hecha | fallida | rechazada | caducada
    duracionMs: num(o?.duracionMs) ?? (inicio != null && fin != null ? fin - inicio : null),
  };
}

function normalizarCine(c) {
  const id = txt(de(c, 'id', 'cine'));
  const fuente = txt(de(c, 'fuente', 'source')) || 'nada';
  const edad = segAms(de(c, 'edadS'));
  const datosDe = ms(de(c, 'datosDe', 'staleAt'));
  return {
    id,
    nombre: txt(c?.corto) || nombreCine(id),
    nombreLargo: txt(c?.nombre),
    fuente,                              // live | stale | error | sample | nada
    motivo: txt(de(c, 'motivo', 'reason')),
    dias: num(de(c, 'dias')),
    peliculas: num(de(c, 'peliculas', 'movies')),
    sesiones: num(de(c, 'sesiones', 'showtimes')),
    hoy: c?.hoy && typeof c.hoy === 'object' ? { peliculas: num(c.hoy.peliculas), sesiones: num(c.hoy.sesiones) } : null,
    primerDia: txt(c?.primerDia),
    ultimoDia: txt(c?.ultimoDia),
    diasCompletados: num(c?.diasCompletados) ?? 0,
    plantilla: txt(c?.plantilla),        // 'propia' | 'original'
    edadMs: edad,
    datosDe: datosDe ?? null,
    origen: txt(de(c, 'origen')),        // directo | movil | copia | memoria | ejemplo | null
  };
}

function normalizarAviso(a) {
  return {
    numero: num(de(a, 'numero', 'number')),
    titulo: txt(de(a, 'titulo', 'title')) || 'Aviso sin título',
    estado: txt(de(a, 'estado', 'state')) || 'open',
    nivel: txt(a?.nivel) === 'critico' ? 'critico' : 'aviso',
    comentarios: num(a?.comentarios),
    creado: ms(de(a, 'creado', 'created_at', 'abierto')),
    cerrado: ms(de(a, 'cerrado', 'closed_at')),
    actualizado: ms(de(a, 'actualizado', 'updated_at')),
    url: txt(de(a, 'url', 'html_url')),
    cuerpo: txt(de(a, 'cuerpo', 'body', 'resumen')),
  };
}

function normalizarFecha(v) {
  if (v == null) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    const cines = v.cines && typeof v.cines === 'object'
      ? Object.entries(v.cines).map(([id, c]) => ({ id, dias: num(c?.dias), t: ms(c?.at) }))
      : [];
    return { t: ms(de(v, 'generadoEn', 'fecha', 'at')), edadMs: segAms(v.edadS), origen: txt(v.origen), cines };
  }
  return { t: ms(v), edadMs: null, origen: null, cines: [] };
}

export function normalizar(r, ahora = Date.now()) {
  const m = r?.movil ?? null;
  const s = r?.servidor ?? null;
  const informe = m?.informe && typeof m.informe === 'object' ? m.informe : null;

  // El latido es la hora del último informe. Se prefiere informe.vuelta (una
  // hora fija) a ahora − latidoHace, que depende de cuándo se generó la
  // respuesta; latidoHace queda para cuando el informe no trae hora.
  const generado = ms(r?.generadoEn) ?? ahora;
  const hace = segAms(m?.latidoHace);
  const latido = ms(informe?.vuelta) ?? (hace != null ? generado - hace : null);

  const ordenes = m?.ordenes ?? {};
  const resultados = lista(ordenes.resultados).map(normalizarOrden).filter((o) => o.id);
  const idsHechas = new Set(resultados.map((o) => o.id));

  const cines = lista(s?.cines).map(normalizarCine).filter((c) => c.id);
  cines.sort((a, b) => ordenCines.indexOf(a.id) - ordenCines.indexOf(b.id));

  return {
    movil: m ? {
      informe,
      latido,
      vivo: typeof m.vivo === 'boolean' ? m.vivo : null,
      bateria: normalizarBateria(m.bateria, informe),
      historial: normalizarHistorialBateria(m.historialBateria),
      vueltas: lineas(m.ultimasVueltas).map(normalizarVuelta).filter((v) => v.t != null).sort((a, b) => b.t - a.t),
      recogidas: lineas(m.ultimasRecogidas).map(normalizarRecogida).filter((x) => x.t != null).sort((a, b) => b.t - a.t),
      registro: typeof m.registro === 'string' ? m.registro : null,
      ultimaRecogida: ms(informe?.ultimaRecogida),
      proximaRecogida: ms(informe?.proximaRecogida),
      ordenes: {
        pendientes: lista(ordenes.pendientes).map(normalizarOrden).filter((o) => o.id && !idsHechas.has(o.id)),
        resultados: resultados.sort((a, b) => (b.fin ?? b.inicio ?? 0) - (a.fin ?? a.inicio ?? 0)),
      },
      ficheros: m.ficheros && typeof m.ficheros === 'object' ? m.ficheros : {},
      error: txt(m.error),
    } : null,
    servidor: s ? {
      cines,
      instantaneaYelmo: normalizarFecha(s.instantaneaYelmo),
      respaldo: normalizarFecha(s.respaldo),
      claves: s.claves && typeof s.claves === 'object' ? s.claves : null,
      generado: ms(s.generadoEn),
      cacheMs: segAms(s.cacheHace),
      error: txt(s.error),
    } : null,
    avisos: {
      abiertos: lista(r?.avisos?.abiertos).map(normalizarAviso),
      recientes: lista(r?.avisos?.recientes).map(normalizarAviso),
      error: txt(r?.avisos?.error),
    },
    github: {
      escritura: r?.github?.escritura === true,
      lectura: txt(r?.github?.lectura),   // 'api' | 'publica'
      aviso: txt(r?.github?.aviso),
      repo: txt(r?.github?.repo),
    },
    generado,
  };
}

// ── 2. Valorar ────────────────────────────────────────────────────────────
// Cada valoración: { id, nivel, titulo, valor, detalle, seccion, cine? }
// nivel: 'bien' | 'aviso' | 'fallo' | 'nada'

export function valorarLatido(movil, ahora = Date.now()) {
  const base = { id: 'latido', titulo: 'Móvil', seccion: 'movil' };
  if (!movil) return { ...base, nivel: 'nada', valor: 'Sin datos del móvil', detalle: 'El servidor no ha podido leer sus informes.' };
  if (movil.latido == null) return { ...base, nivel: 'nada', valor: 'Todavía no ha dado señales', detalle: null };
  const edad = ahora - movil.latido;
  const cuando = relativa(movil.latido, ahora);
  if (movil.vivo === false || edad > LATIDO_FALLO_MS) {
    return { ...base, nivel: 'fallo', valor: `Callado desde ${absoluta(movil.latido, ahora)}`, detalle: `Su último informe es de ${cuando}. Da una vuelta cada 15 min: puede estar apagado, sin red o con el bucle parado.` };
  }
  if (edad > LATIDO_AVISO_MS) {
    return { ...base, nivel: 'aviso', valor: `Último informe ${cuando}`, detalle: 'Se ha saltado alguna vuelta de 15 min.' };
  }
  return { ...base, nivel: 'bien', valor: `Último informe ${cuando}`, detalle: null };
}

// Una frase siempre acaba en punto (los errores del móvil llegan sin él).
const frase = (t) => {
  if (!t) return null;
  const x = t.trim();
  return /[.!?…]$/.test(x) ? x : `${x}.`;
};
const mayus = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

export function valorarBateria(movil, ahora = Date.now()) {
  const base = { id: 'bateria', titulo: 'Batería', seccion: 'movil' };
  const b = movil?.bateria;
  if (!b || b.pct == null) return { ...base, nivel: 'nada', valor: 'Sin datos', detalle: null };
  const pct = `${Math.round(b.pct)} %`;
  // Con el móvil callado, el porcentaje es de su último informe, no de ahora:
  // se dice de cuándo es y se proyecta con el ritmo que llevaba.
  const viejo = movil.latido != null && ahora - movil.latido > LATIDO_AVISO_MS;
  const deCuando = viejo ? ` ${relativa(movil.latido, ahora)}` : '';
  if (b.cargando) return { ...base, nivel: 'bien', valor: `${pct}, cargando${deCuando}`, detalle: null };
  const h = b.horasHastaReserva;
  const ritmo = b.ritmoPorHora != null ? `baja ${String(b.ritmoPorHora).replace('.', ',')} %/h` : null;
  let llega = null;
  let yaAbajo = false;
  if (h != null) {
    const cuando = (viejo ? movil.latido : ahora) + h * 3600e3;
    if (viejo && cuando <= ahora) { yaAbajo = true; llega = `a ese ritmo ya estará por debajo del ${RESERVA} % (desde ~${absoluta(cuando, ahora)})`; }
    else llega = `llega al ${RESERVA} % en ${duracion(cuando - ahora, { segundos: false })}`;
  }
  const detalle = mayus([ritmo, llega].filter(Boolean).join(', ')) || 'Desenchufado';
  const valor = `${pct}, sin cargar${deCuando}`;
  if (b.pct <= RESERVA || yaAbajo || (h != null && h < 1)) return { ...base, nivel: 'fallo', valor, detalle: `${frase(detalle)} Hay que enchufarlo.` };
  if (b.pct <= 30 || (h != null && h < 4)) return { ...base, nivel: 'aviso', valor, detalle: frase(detalle) };
  return { ...base, nivel: 'bien', valor, detalle: frase(detalle) };
}

export function valorarRecogida(movil, ahora = Date.now()) {
  const base = { id: 'recogida', titulo: 'Recogida de Yelmo', seccion: 'movil' };
  if (!movil) return { ...base, nivel: 'nada', valor: 'Sin datos', detalle: null };
  const ult = movil.recogidas[0];
  const ultimaT = movil.ultimaRecogida ?? ult?.t ?? null;
  const prox = movil.proximaRecogida;
  let proxTexto = null;
  if (prox) {
    proxTexto = prox >= ahora - 5 * 60e3
      ? `La siguiente, ${absoluta(prox, ahora)} (${relativa(prox, ahora)}).`
      : `Tocaba otra a las ${absoluta(prox, ahora)} y no ha llegado.`;
  }
  // La última vuelta que intentó recoger y falló manda sobre la fecha de la última buena.
  const vueltaFallida = movil.vueltas.find((v) => v.nivel === 'fallo');
  const ultimaVuelta = movil.vueltas[0];
  if (ultimaVuelta && ultimaVuelta.nivel === 'fallo') {
    return { ...base, nivel: 'fallo', valor: `Falló ${relativa(ultimaVuelta.t, ahora)}`, detalle: [frase(mayus(ultimaVuelta.error || ultimaVuelta.resultado)), proxTexto].filter(Boolean).join(' ') };
  }
  if (ultimaT == null) return { ...base, nivel: 'nada', valor: 'Aún no ha recogido', detalle: proxTexto };
  const edad = ahora - ultimaT;
  const valor = `Última ${relativa(ultimaT, ahora)}`;
  if (edad > RECOGIDA_AVISO_MS) return { ...base, nivel: 'aviso', valor, detalle: ['Lleva más de un día sin recoger.', proxTexto].filter(Boolean).join(' ') };
  if (vueltaFallida && vueltaFallida.t > ultimaT) {
    return { ...base, nivel: 'aviso', valor, detalle: [`Una vuelta falló ${relativa(vueltaFallida.t, ahora)}.`, proxTexto].filter(Boolean).join(' ') };
  }
  return { ...base, nivel: ult?.nivel === 'fallo' ? 'aviso' : 'bien', valor, detalle: proxTexto };
}

const ORIGEN = { directo: 'leídos ahora de su web', movil: 'recogidos por el móvil', copia: 'de la copia de respaldo del móvil', memoria: 'guardados en el servidor', ejemplo: 'de ejemplo' };
export const textoOrigen = (o) => (o ? ORIGEN[o] || o : null);

export function valorarCine(c, ahora = Date.now()) {
  const base = { id: `cine-${c.id}`, titulo: c.nombre, seccion: 'cines', cine: c.id };
  const edad = c.edadMs ?? (c.datosDe != null ? ahora - c.datosDe : null);
  const deCuando = edad != null ? `datos de hace ${duracion(edad, { segundos: false })}` : null;
  const cifras = c.peliculas != null ? `${c.peliculas} películas${c.dias != null ? ` en ${c.dias} días` : ''}` : null;
  if (c.fuente === 'error') return { ...base, nivel: 'fallo', valor: 'Sin cartelera', detalle: frase(mayus(c.motivo)) || 'El cine no ha respondido.' };
  if (c.fuente === 'stale') return { ...base, nivel: 'aviso', valor: deCuando ? `Guardados, ${deCuando}` : 'Datos guardados', detalle: frase(mayus(c.motivo)) };
  if (c.fuente === 'sample') return { ...base, nivel: 'aviso', valor: 'Datos de muestra', detalle: 'El servidor está enseñando la cartelera de ejemplo.' };
  if (c.fuente === 'live') {
    if (c.peliculas === 0) return { ...base, nivel: 'aviso', valor: 'Responde, pero sin películas', detalle: c.motivo };
    const completados = c.diasCompletados ? `${c.diasCompletados === 1 ? '1 día rellenado' : `${c.diasCompletados} días rellenados`} con la copia` : null;
    const det = [textoOrigen(c.origen), deCuando, completados].filter(Boolean).join(', ');
    return { ...base, nivel: 'bien', valor: cifras || 'Al día', detalle: det ? det.charAt(0).toUpperCase() + det.slice(1) : null };
  }
  return { ...base, nivel: 'nada', valor: 'Sin datos', detalle: c.motivo };
}

export function valorarAvisos(avisos) {
  const base = { id: 'avisos', titulo: 'Avisos', seccion: 'avisos' };
  if (avisos.error && !avisos.abiertos.length) return { ...base, nivel: 'nada', valor: 'No se han podido leer', detalle: avisos.error };
  const n = avisos.abiertos.length;
  if (!n) return { ...base, nivel: 'bien', valor: 'Ninguno abierto', detalle: null };
  const critico = avisos.abiertos.some((a) => a.nivel === 'critico');
  return { ...base, nivel: critico ? 'fallo' : 'aviso', valor: n === 1 ? '1 abierto' : `${n} abiertos`, detalle: avisos.abiertos[0]?.titulo };
}

export function valorar(d, ahora = Date.now()) {
  const movil = [valorarLatido(d.movil, ahora), valorarBateria(d.movil, ahora), valorarRecogida(d.movil, ahora)];
  let cines;
  if (!d.servidor) {
    cines = [{ id: 'servidor', titulo: 'Cines', seccion: 'cines', nivel: 'nada', valor: 'Sin datos del servidor', detalle: null }];
  } else if (d.servidor.error && !d.servidor.cines.length) {
    cines = [{ id: 'servidor', titulo: 'Cines', seccion: 'cines', nivel: 'fallo', valor: 'El servidor no ha podido leer los cines', detalle: d.servidor.error }];
  } else {
    // Los cuatro siempre, aunque el servidor solo mande algunos: uno que
    // falta es justo lo que hay que ver.
    cines = ordenCines.map((id) => {
      const c = d.servidor.cines.find((x) => x.id === id);
      return c ? valorarCine(c, ahora) : { id: `cine-${id}`, titulo: nombreCine(id), seccion: 'cines', cine: id, nivel: 'nada', valor: 'El servidor no lo ha mandado', detalle: null };
    });
  }
  const avisos = valorarAvisos(d.avisos);
  const todas = [...movil, ...cines, avisos];
  const fallos = todas.filter((v) => v.nivel === 'fallo').length;
  const avisosN = todas.filter((v) => v.nivel === 'aviso').length;
  const porSeccion = {};
  for (const v of todas) {
    const peor = porSeccion[v.seccion];
    if (!peor || PESO[v.nivel] > PESO[peor]) porSeccion[v.seccion] = v.nivel;
  }
  return { movil, cines, avisos, todas, fallos, avisosN, porSeccion };
}

export const PESO = { bien: 0, nada: 1, aviso: 2, fallo: 3 };

export function veredicto({ fallos, avisosN }) {
  if (fallos) return { nivel: 'fallo', texto: fallos === 1 ? 'Hay un fallo' : `Hay ${fallos} fallos`, sub: avisosN ? (avisosN === 1 ? 'y un aviso' : `y ${avisosN} avisos`) : null };
  if (avisosN) return { nivel: 'aviso', texto: avisosN === 1 ? 'Una cosa que mirar' : `${avisosN} cosas que mirar`, sub: null };
  return { nivel: 'bien', texto: 'Todo bien', sub: null };
}
