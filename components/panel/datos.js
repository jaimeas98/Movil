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
import { aFecha, duracion, relativa, absoluta, enMadrid, diaCorto } from './tiempo.js';

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

// El visor de LoL (lib/panel/lol.js ya lo manda resumido; aquí solo se fija
// la forma y las fechas pasan a milisegundos).
function normalizarPartidoLol(p) {
  return {
    id: txt(p?.id),
    inicio: ms(p?.inicio),
    estado: txt(p?.estado),
    liga: txt(p?.liga),
    bloque: txt(p?.bloque),
    mejorDe: num(p?.mejorDe),
    equipos: lista(p?.equipos).map((e) => ({ codigo: txt(e?.codigo) || '?', nombre: txt(e?.nombre), victorias: num(e?.victorias), resultado: txt(e?.resultado) })),
  };
}
const copiaLol = (c) => (c && typeof c === 'object' ? { t: ms(c.generado), edadMs: segAms(c.antiguedadSeg), torneo: txt(c.torneo) } : null);
function normalizarEjecucion(x) {
  return { id: num(x?.id), estado: txt(x?.estado), conclusion: txt(x?.conclusion), evento: txt(x?.evento), creada: ms(x?.creada), actualizada: ms(x?.actualizada), url: txt(x?.url) };
}
export function normalizarLol(l) {
  if (!l || typeof l !== 'object') return null;
  const web = l.web && typeof l.web === 'object' ? l.web : {};
  const est = web.estado && typeof web.estado === 'object' ? web.estado : null;
  const ag = web.agenda && typeof web.agenda === 'object' ? web.agenda : null;
  const rep = l.repo && typeof l.repo === 'object' ? l.repo : null;
  const resp = est?.respaldo ?? {};
  return {
    configurado: { web: l.configurado?.web === true, github: l.configurado?.github === true, tokenPropio: l.configurado?.tokenPropio === true },
    web: {
      url: txt(web.url),
      responde: web.responde === true,
      error: txt(web.error),
      generado: ms(est?.generado),
      fuentes: Object.entries(est?.fuentes ?? {}).map(([clave, f]) => ({
        clave, ultimaOk: ms(f?.ultimaOk), ultimoError: txt(f?.ultimoError), ultimoErrorEn: ms(f?.ultimoErrorEn), ultimaFuente: txt(f?.ultimaFuente),
      })),
      respaldo: est ? {
        agenda: copiaLol(resp.agenda),
        ligas: copiaLol(resp.ligas),
        torneos: Object.entries(resp.torneos ?? {}).map(([slug, c]) => ({ slug, ...(copiaLol(c) ?? { t: null, edadMs: null, torneo: null }) })),
        ultimaRecogida: ms(resp.ultimaRecogida?.generado),
      } : null,
      consultas: est?.consultas ? { origen: txt(est.consultas.origen), redescubierto: ms(est.consultas.redescubiertoEn), error: txt(est.consultas.error) } : null,
      agenda: ag ? {
        generado: ms(ag.generado),
        fuente: txt(ag.fuente),
        edadMs: segAms(ag.antiguedadSeg),
        directo: lista(ag.directo).map(normalizarPartidoLol),
        proximos: lista(ag.proximos).map(normalizarPartidoLol),
        terminados: lista(ag.terminados).map(normalizarPartidoLol),
      } : null,
    },
    repo: rep ? {
      nombre: txt(rep.nombre),
      url: txt(rep.url),
      tareas: Object.fromEntries(Object.entries(rep.tareas ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.map(normalizarEjecucion) : null])),
      cambios: Array.isArray(rep.cambios) ? rep.cambios.map((c) => ({ sha: txt(c?.sha), mensaje: txt(c?.mensaje), t: ms(c?.fecha), url: txt(c?.url) })) : null,
      error: txt(rep.error),
    } : null,
    error: txt(l.error),
  };
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
      ramaApp: txt(r?.github?.ramaApp),
      // undefined: no se sabe (sin token, o el servidor aún no lo ha usado);
      // null: el token no caduca; número: cuándo caduca.
      caducaToken: r?.github && 'caducaToken' in r.github ? ms(r.github.caducaToken) : undefined,
      tokenRechazado: r?.github?.tokenRechazado === true,
    },
    lol: normalizarLol(r?.lol),
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

// El token de GitHub: si caduca, el panel se queda en solo lectura ese día.
// Se avisa con dos semanas, que es lo que se tarda en acordarse de hacerlo.
export const TOKEN_AVISO_MS = 14 * 864e5;
export function valorarToken(github, ahora = Date.now()) {
  const base = { id: 'token', titulo: 'Token de GitHub', seccion: 'resumen' };
  if (!github?.escritura) return { ...base, nivel: 'nada', valor: 'Sin token: solo lectura', detalle: 'Sin PANEL_GITHUB_TOKEN no se pueden mandar órdenes ni guardar enlaces.' };
  if (github.tokenRechazado) return { ...base, nivel: 'fallo', valor: 'GitHub no lo acepta', detalle: 'Ha caducado o se ha revocado. Crea uno nuevo en GitHub, cámbialo en Vercel (PANEL_GITHUB_TOKEN) y redespliega.' };
  const c = github.caducaToken;
  if (c === undefined) return { ...base, nivel: 'nada', valor: 'Caducidad sin comprobar', detalle: 'Se sabrá en cuanto el servidor use el token.' };
  if (c === null) return { ...base, nivel: 'bien', valor: 'No caduca', detalle: null };
  const falta = c - ahora;
  const cuando = absoluta(c, ahora);
  if (falta <= 0) return { ...base, nivel: 'fallo', valor: `Caducó ${relativa(c, ahora)}`, detalle: 'Crea uno nuevo en GitHub, cámbialo en Vercel (PANEL_GITHUB_TOKEN) y redespliega.' };
  if (falta <= 2 * 864e5) return { ...base, nivel: 'fallo', valor: `Caduca ${relativa(c, ahora)}`, detalle: `El ${cuando}. Renuévalo ya: crea uno nuevo en GitHub y cámbialo en Vercel.` };
  if (falta <= TOKEN_AVISO_MS) return { ...base, nivel: 'aviso', valor: `Caduca ${relativa(c, ahora)}`, detalle: `El ${cuando}. Conviene renovarlo antes: uno nuevo en GitHub y cambiarlo en Vercel.` };
  return { ...base, nivel: 'bien', valor: `Caduca ${relativa(c, ahora)}`, detalle: `El ${cuando}.` };
}

// ── El visor de LoL ───────────────────────────────────────────────────────
// Tres preguntas: ¿responde su web?, ¿responde lolesports.com (o el visor
// está tirando de su copia)?, ¿se renueva su respaldo? Que lolesports.com
// falle es un aviso, no un fallo: el visor sigue enseñando su copia diciendo
// de cuándo es. Sin LOL_URL ni token no hay nada que valorar ("sin datos",
// que no cuenta en el veredicto); con token pero sin acceso al repositorio,
// sí es algo que mirar, porque se arregla en un minuto.
export const LOL_RESPALDO_AVISO_MS = 8 * 3600e3;   // va cada 2 h; GitHub retrasa, pero no tanto

// Como /estado del visor: bien si lo último bueno es más nuevo que el
// último error; con fallos si falló después de una buena; falla si nunca.
export function estadoFuenteLol(f) {
  const ok = f?.ultimaOk ?? 0;
  const err = f?.ultimoErrorEn ?? 0;
  if (!ok && !err) return f?.ultimaFuente ? 'aviso' : 'nada';
  if (ok >= err) return 'bien';
  return ok ? 'aviso' : 'fallo';
}

export function valorarLolWeb(lol) {
  const base = { id: 'lol-web', titulo: 'Web del visor', seccion: 'lol' };
  if (!lol) return { ...base, nivel: 'nada', valor: 'Sin datos', detalle: null };
  if (lol.error) return { ...base, nivel: 'nada', valor: 'No se ha podido leer', detalle: frase(lol.error) };
  if (!lol.configurado.web) return { ...base, nivel: 'nada', valor: 'Sin conectar', detalle: lol.web.error ? frase(lol.web.error) : 'Falta LOL_URL en Vercel con la dirección del visor.' };
  if (!lol.web.responde) return { ...base, nivel: 'fallo', valor: 'No responde', detalle: frase(lol.web.error) };
  return { ...base, nivel: 'bien', valor: 'Responde', detalle: lol.web.error ? frase(lol.web.error) : null };
}

export function valorarLolApi(lol, ahora = Date.now()) {
  const base = { id: 'lol-api', titulo: 'lolesports.com', seccion: 'lol' };
  if (!lol?.web?.responde || !lol.web.generado) return { ...base, nivel: 'nada', valor: 'Sin datos', detalle: null };
  const f = lol.web.fuentes;
  const niveles = f.map(estadoFuenteLol);
  const bien = niveles.filter((n) => n === 'bien').length;
  const mal = f.filter((_, i) => niveles[i] === 'fallo' || niveles[i] === 'aviso');
  const ag = lol.web.agenda;
  const deCopia = ag && ag.fuente && ag.fuente !== 'directo'
    ? `La agenda sale de ${ag.fuente === 'memoria' ? 'la copia en memoria' : 'el respaldo del repositorio'}${ag.edadMs != null ? `, de hace ${duracion(ag.edadMs, { segundos: false })}` : ''}.`
    : null;
  if (!f.length) return { ...base, nivel: 'nada', valor: 'El visor aún no le ha pedido nada', detalle: deCopia };
  if (!mal.length) return { ...base, nivel: deCopia ? 'aviso' : 'bien', valor: deCopia ? 'Responde, pero la agenda es de la copia' : 'Responde: datos de ahora', detalle: deCopia };
  const ultimo = mal.map((x) => x.ultimoErrorEn).filter(Boolean).sort((a, b) => b - a)[0];
  const error = mal.find((x) => x.ultimoErrorEn === ultimo)?.ultimoError ?? mal[0].ultimoError;
  return {
    ...base,
    nivel: 'aviso',
    valor: bien ? `${mal.length} de ${f.length} fuentes fallan` : 'No responde: el visor enseña su copia',
    detalle: [error ? frase(`${mayus(error.replace(/[.\s]+$/, ''))}${ultimo ? ` (${relativa(ultimo, ahora)})` : ''}`) : null, deCopia].filter(Boolean).join(' ') || null,
  };
}

// La tarea `respaldo` (o la que se pida) según sus últimas ejecuciones.
export function valorarTareaLol(lol, tarea, ahora = Date.now()) {
  const titulo = tarea === 'respaldo' ? 'Respaldo del visor' : 'Cuerpo técnico (visor)';
  const base = { id: `lol-${tarea}`, titulo, seccion: 'lol' };
  if (!lol || lol.error) return { ...base, nivel: 'nada', valor: 'Sin datos', detalle: null };
  if (!lol.configurado.github) return { ...base, nivel: 'nada', valor: 'Sin acceso al repositorio', detalle: 'Falta un token con acceso al repositorio del visor (LOL_GITHUB_TOKEN).' };
  const runs = lol.repo?.tareas?.[tarea];
  if (!runs) return { ...base, nivel: 'aviso', valor: 'No se pueden leer sus tareas', detalle: frase(lol.repo?.error) };
  const hechas = runs.filter((x) => x.estado === 'completed' && x.conclusion !== 'cancelled' && x.conclusion !== 'skipped');
  if (!hechas.length) return { ...base, nivel: 'nada', valor: runs.length ? 'En marcha' : 'Sin ejecuciones', detalle: null };
  const ult = hechas[0];
  const buena = hechas.find((x) => x.conclusion === 'success');
  if (ult.conclusion !== 'success') {
    const seguidas = hechas.findIndex((x) => x.conclusion === 'success');
    const n = seguidas === -1 ? hechas.length : seguidas;
    return {
      ...base,
      nivel: n >= 3 && tarea === 'respaldo' ? 'fallo' : 'aviso',
      valor: `Falló ${relativa(ult.creada, ahora)}`,
      detalle: [n > 1 ? `Van ${n} seguidas mal.` : null, buena ? `La última buena, ${relativa(buena.creada, ahora)}.` : null].filter(Boolean).join(' ') || null,
    };
  }
  if (tarea === 'respaldo' && ahora - ult.creada > LOL_RESPALDO_AVISO_MS) {
    return { ...base, nivel: 'aviso', valor: `Última ${relativa(ult.creada, ahora)}`, detalle: 'Debería ir cada 2 h: GitHub la está retrasando o se ha desactivado.' };
  }
  return { ...base, nivel: 'bien', valor: `Última ${relativa(ult.creada, ahora)}`, detalle: null };
}

export function valorarLol(lol, ahora = Date.now()) {
  return [valorarLolWeb(lol), valorarLolApi(lol, ahora), valorarTareaLol(lol, 'respaldo', ahora), valorarTareaLol(lol, 'cuerpo-tecnico', ahora)];
}

// ── Cobertura: qué ratos estuvo el móvil dando señal ──────────────────────
// El bucle no da una vuelta cada 15 min exactos sino cada ~15 min 40 s
// (scripts/movil/bucle.sh solo mira si toca tras cada sleep de 60 s y la
// comprobación de órdenes, así que arranca algo después). Así que cada
// pocas horas una franja de 15 min se queda sin informe propio sin que haya
// faltado ninguno. Contar franjas vacías daba un 95 % y marcas de hueco que
// no existían. Lo que cuenta es el tiempo ENTRE informes: dos seguidos a
// menos de 25 min cubren todo lo que hay entre ellos.
export const ENTRE_INFORMES_MS = 25 * 60e3;
export function tramosCubiertos(vueltas) {
  const asc = [...(vueltas ?? [])].map((v) => v.t).filter((t) => t != null).sort((a, b) => a - b);
  const tramos = [];
  for (let i = 0; i < asc.length; i++) {
    const a = asc[i];
    const b = asc[i + 1];
    if (b != null && b - a <= ENTRE_INFORMES_MS) {
      const ult = tramos.at(-1);
      if (ult && a <= ult[1]) ult[1] = b; else tramos.push([a, b]);
    } else if (!tramos.length || a > tramos.at(-1)[1]) {
      tramos.push([a, a]);
    }
  }
  return tramos;
}
// ¿Cae algún trozo de [desde, hasta) dentro de un tramo cubierto?
export function cubierto(tramos, desde, hasta) {
  return tramos.some(([a, b]) => a < hasta && b >= desde);
}

// ── Fiabilidad de 7 días ──────────────────────────────────────────────────
// De lo que el móvil ya publica (historial.jsonl, 7 días; recogidas.jsonl):
// por día de Madrid, sus 96 franjas de 15 min con la peor vuelta de cada una,
// qué parte de las que tocaban llegaron, y las recogidas buenas y fallidas.
// Lo que antes del primer dato del historial no se sabe sale como tal, no
// como "sin señal": el móvil puede haber estado bien sin que quede apunte.
export const FRANJAS_DIA = 96;
export function fiabilidad(movil, ahora = Date.now(), dias = 7) {
  if (!movil) return null;
  const hoy = enMadrid(ahora);
  const desdeDato = movil.vueltas.length ? movil.vueltas[movil.vueltas.length - 1].t : null;
  const primero = desdeDato != null ? enMadrid(desdeDato) : null;
  // Los días, con aritmética de calendario sobre el día de hoy en Madrid:
  // restar 24 h repetía o se saltaba un día junto a los cambios de hora.
  const [y, m, dd0] = hoy.dia.split('-').map(Number);
  const claves = [];
  for (let i = dias - 1; i >= 0; i--) claves.push(new Date(Date.UTC(y, m - 1, dd0 - i)).toISOString().slice(0, 10));
  const porDia = new Map(claves.map((k) => [k, {
    dia: k, etiqueta: diaCorto(k), hoy: k === hoy.dia,
    franjas: Array(FRANJAS_DIA).fill(null), cubiertas: Array(FRANJAS_DIA).fill(false), existe: Array(FRANJAS_DIA).fill(false),
    vueltas: 0, fallos: 0, recogidas: 0, recogidasMal: 0,
  }]));
  // Qué franjas existen cada día: el de adelantar la hora no tiene las de las
  // 02:00 a las 03:00, y contarlas como esperadas daba 4 huecos que no hubo.
  for (const k of claves) {
    const [ky, km, kd] = k.split('-').map(Number);
    const base = Date.UTC(ky, km - 1, kd) - 3 * 3600e3;
    const d = porDia.get(k);
    for (let t = base; t < base + 30 * 3600e3; t += 15 * 60e3) {
      const p = enMadrid(t);
      if (p.dia === k) d.existe[Math.floor(p.minuto / 15)] = true;
    }
  }
  // Hoy solo cuentan las franjas que ya se pueden juzgar: hasta el último
  // informe o, si lleva más de 25 min callado, hasta hace 25 min. La que está
  // en curso (o la que va tras el último informe, que aún no ha llegado) no es
  // un hueco todavía.
  const ultimaT = movil.vueltas.length ? movil.vueltas[0].t : null;
  const limiteHoy = enMadrid(Math.max(ultimaT ?? -Infinity, ahora - ENTRE_INFORMES_MS));
  // Las franjas que caen entre dos informes cercanos (ver tramosCubiertos),
  // marcadas paso a paso en la hora de Madrid.
  for (const [a, b] of tramosCubiertos(movil.vueltas)) {
    for (let t = a; ; t = Math.min(b, t + 5 * 60e3)) {
      const p = enMadrid(t);
      const dd = p && porDia.get(p.dia);
      if (dd) dd.cubiertas[Math.min(FRANJAS_DIA - 1, Math.floor(p.minuto / 15))] = true;
      if (t >= b) break;
    }
  }
  for (const v of movil.vueltas) {
    const p = enMadrid(v.t);
    const d = p && porDia.get(p.dia);
    if (!d) continue;
    const i = Math.min(FRANJAS_DIA - 1, Math.floor(p.minuto / 15));
    d.vueltas++;
    if (v.nivel === 'fallo') d.fallos++;
    if (!d.franjas[i] || PESO[v.nivel] > PESO[d.franjas[i]]) d.franjas[i] = v.nivel;
  }
  for (const r of movil.recogidas) {
    const p = enMadrid(r.t);
    const d = p && porDia.get(p.dia);
    if (!d) continue;
    d.recogidas++;
    if (r.nivel === 'fallo' || r.nivel === 'aviso') d.recogidasMal++;
  }
  const filas = [...porDia.values()].map((d) => {
    // Franjas que tocaban: hasta la de ahora hoy; desde la del primer dato el
    // primer día del historial; ninguna antes de él.
    let desde = 0, hasta = FRANJAS_DIA;
    if (d.hoy) hasta = limiteHoy.dia === d.dia ? Math.floor(limiteHoy.minuto / 15) + 1 : 0;
    if (!primero || d.dia < primero.dia) return { ...d, sinHistorial: true, esperadas: 0, llegadas: 0, pct: null, desde: 0, hasta };
    if (d.dia === primero.dia) desde = Math.floor(primero.minuto / 15);
    let llegadas = 0, esperadas = 0;
    for (let i = desde; i < hasta; i++) {
      if (!d.existe[i]) continue;
      esperadas++;
      if (d.franjas[i] || d.cubiertas[i]) llegadas++;
    }
    return { ...d, sinHistorial: false, esperadas, llegadas, pct: esperadas ? llegadas / esperadas : null, desde, hasta };
  });
  const conDatos = filas.filter((f) => !f.sinHistorial && f.esperadas);
  const esperadas = conDatos.reduce((s, f) => s + f.esperadas, 0);
  const llegadas = conDatos.reduce((s, f) => s + f.llegadas, 0);
  // Los días de antes del historial no se enseñan como filas vacías: se dice
  // desde cuándo hay datos (el historial guarda 7 días y el móvil empezó a
  // escribirlo hace menos).
  const primeraConDatos = filas.findIndex((f) => !f.sinHistorial);
  return {
    filas: primeraConDatos > 0 ? filas.slice(primeraConDatos) : filas,
    desdeHistorial: primeraConDatos > 0 ? filas[primeraConDatos].etiqueta : null,
    pct: esperadas ? llegadas / esperadas : null,
    recogidas: filas.reduce((s, f) => s + f.recogidas, 0),
    recogidasMal: filas.reduce((s, f) => s + f.recogidasMal, 0),
    fallos: filas.reduce((s, f) => s + f.fallos, 0),
  };
}

// Qué cine falla más en las recogidas del móvil (las que traen el detalle
// por cine), en los mismos 7 días.
export function fallosPorCine(movil, ahora = Date.now(), dias = 7) {
  const desde = ahora - dias * 864e5;
  const cuenta = Object.fromEntries(ordenCines.map((id) => [id, { id, recogidas: 0, mal: 0, ultimoError: null }]));
  for (const r of movil?.recogidas ?? []) {
    if (r.t < desde) continue;
    for (const c of r.cines) {
      const x = cuenta[c.id];
      if (!x) continue;
      x.recogidas++;
      if (c.error) { x.mal++; if (!x.ultimoError) x.ultimoError = { t: r.t, error: c.error }; }
    }
  }
  return cuenta;
}

// El estado en texto plano, para "Copiar estado" (pegárselo a Claude cuando
// algo falla). Solo lo que el panel ya enseña: el móvil filtra lo que publica
// y aquí no entra nada del servidor que no esté en pantalla.
export function textoEstado(d, val, ahora = Date.now()) {
  const linea = (v) => `- ${v.titulo}: ${PALABRA_NIVEL[v.nivel]}. ${v.valor}.${v.detalle ? ` ${v.detalle}` : ''}`.replace(/\.\./g, '.');
  const ver = veredicto(val);
  const fia = fiabilidad(d.movil, ahora);
  const out = [
    `Estado del panel, ${absoluta(ahora, ahora)} (${new Date(ahora).toISOString()})`,
    `Veredicto: ${ver.texto}${ver.sub ? ` ${ver.sub}` : ''}.`,
    '', 'Móvil:', ...val.movil.map(linea),
    '', 'Cines en la web:', ...val.cines.map(linea),
    '', 'Vigilante:', linea(val.avisos),
    ...d.avisos.abiertos.map((a) => `  · #${a.numero ?? '?'} ${a.titulo}`),
    '', linea(val.token),
    '', 'Visor de LoL:', ...val.lol.map(linea),
  ];
  const directo = d.lol?.web?.agenda?.directo ?? [];
  if (directo.length) out.push(`  En directo: ${directo.map(textoPartidoLol).join('; ')}.`);
  if (fia?.pct != null) {
    out.push('', `Señal en 7 días: ${Math.round(fia.pct * 100)} % de las vueltas; ${fia.fallos} fallidas; ${fia.recogidas} recogidas (${fia.recogidasMal} con problemas).`);
  }
  const ult = d.movil?.vueltas?.[0];
  if (ult) out.push(`Última vuelta: ${absoluta(ult.t, ahora)}, ${ult.resultado || 'sin resultado'}${ult.error ? ` (${ult.error})` : ''}.`);
  if (d.movil?.informe?.codigo) out.push(`Código del móvil: ${d.movil.informe.codigo}.`);
  const pend = d.movil?.ordenes?.pendientes ?? [];
  if (pend.length) out.push(`Órdenes pendientes: ${pend.map((o) => o.accion).join(', ')}.`);
  return out.join('\n');
}
// "T1 1-0 GEN (Mundial)".
export function textoPartidoLol(p) {
  const [a, b] = p.equipos;
  const marcador = a?.victorias != null && b?.victorias != null && p.estado !== 'programado' ? ` ${a.victorias}-${b.victorias} ` : ' – ';
  return `${a?.codigo ?? '?'}${marcador}${b?.codigo ?? '?'}${p.liga ? ` (${p.liga})` : ''}`;
}
const PALABRA_NIVEL = { bien: 'bien', aviso: 'aviso', fallo: 'FALLO', nada: 'sin datos' };

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
  const token = valorarToken(d.github, ahora);
  const lol = valorarLol(d.lol, ahora);
  const todas = [...movil, ...cines, avisos, token, ...lol];
  const fallos = todas.filter((v) => v.nivel === 'fallo').length;
  const avisosN = todas.filter((v) => v.nivel === 'aviso').length;
  const porSeccion = {};
  for (const v of todas) {
    const peor = porSeccion[v.seccion];
    if (!peor || PESO[v.nivel] > PESO[peor]) porSeccion[v.seccion] = v.nivel;
  }
  return { movil, cines, avisos, token, lol, todas, fallos, avisosN, porSeccion };
}

export const PESO = { bien: 0, nada: 1, aviso: 2, fallo: 3 };

export function veredicto({ fallos, avisosN }) {
  if (fallos) return { nivel: 'fallo', texto: fallos === 1 ? 'Hay un fallo' : `Hay ${fallos} fallos`, sub: avisosN ? (avisosN === 1 ? 'y un aviso' : `y ${avisosN} avisos`) : null };
  if (avisosN) return { nivel: 'aviso', texto: avisosN === 1 ? 'Una cosa que mirar' : `${avisosN} cosas que mirar`, sub: null };
  return { nivel: 'bien', texto: 'Todo bien', sub: null };
}
