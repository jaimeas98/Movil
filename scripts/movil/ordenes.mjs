// Ayudante en Node de las órdenes del panel, para scripts/movil/ordenes.sh.
// Lo que en bash sería frágil (leer JSON ajeno, montar JSON con la salida de
// un comando, filtrar lo que no puede salir en público) se hace aquí.
//
//   node ordenes.mjs nuevas HECHAS RESULTADOS [LIMITES] [--motivos]  < ordenes.json
//       Una línea por orden nueva: id<TAB>accion<TAB>ejecutar|rechazada|caducada
//       (con --motivos, una cuarta columna con el porqué del rechazo). Apunta
//       en LIMITES (por defecto ~/.recolector/ordenes-limites.json) las que
//       se van a ejecutar, para los límites de abajo.
//   node ordenes.mjs filtrar  < texto  > texto filtrado (lo mismo que va al informe)
//   ID=… ACCION=… ESTADO=… INICIO=… FIN=… CODIGO=… node ordenes.mjs anotar RESULTADOS  < salida
//       Añade (o sustituye) el resultado de una orden en ordenes-resultado.json.
//
// SEGURIDAD
// ordenes.json lo puede escribir cualquiera con permiso de escritura en el
// repositorio (el panel con su token). Por eso aquí solo se aceptan ids con
// una forma fija y acciones de la lista cerrada, y la salida que vuelve al
// informe PÚBLICO pasa por filtrar(): claves, tokens, IPs, MACs y correos.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

// La misma lista que lib/panel/ordenes.js y que el `case` de acciones.sh.
export const ACCIONES = ['informe', 'recoger', 'recoger-yelmo', 'respaldo', 'probar-yelmo',
  'diagnostico', 'reiniciar-bucle', 'actualizar-paquetes'];
export const ID_VALIDO = /^o-\d{8}-\d{4}-[a-z0-9]{4,8}$/;
export const CADUCA_MS = 6 * 3600 * 1000;
export const MAX_RESULTADOS = 20;

// LÍMITES, los mismos que lib/panel/ordenes.js. Se aplican AQUÍ también, con
// el registro propio del móvil: si la clave del panel (o el token de GitHub)
// cayera en malas manos, el servidor no es de fiar, y el móvil no puede
// ponerse a actualizar paquetes o a recoger sin parar porque se lo pidan.
const MIN = 60 * 1000;
export const ESPERAS_MS = {
  informe: 2 * MIN, diagnostico: 2 * MIN,
  recoger: 30 * MIN, 'recoger-yelmo': 30 * MIN, respaldo: 30 * MIN, 'probar-yelmo': 30 * MIN,
  'reiniciar-bucle': 10 * MIN, 'actualizar-paquetes': 24 * 60 * MIN,
};
export const MAX_POR_HORA = 10;
const GUARDAR_REGISTRO_MS = 48 * 3600 * 1000;

const cuanto = (ms) => {
  const min = Math.ceil(ms / MIN);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
};
const MAX_SALIDA = 4000;

const OCTETO = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';

export function filtrar(texto) {
  return String(texto ?? '')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[clave privada omitida]')
    .replace(/(gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/g, '[token omitido]')
    .replace(/\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi, '[MAC omitida]')
    // IPv4 con octetos de verdad (≤255): "Chromium 130.0.6723.58" no es una IP.
    .replace(new RegExp(`\\b${OCTETO}(?:\\.${OCTETO}){3}\\b`, 'g'), '[IP omitida]')
    // IPv6: completa (8 grupos) o abreviada con "::". Una hora (18:30:00) no.
    .replace(/\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi, '[IP omitida]')
    .replace(/\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?\b/gi, '[IP omitida]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[correo omitido]');
}

// Lo último de la salida, que es donde está el resultado (y el error).
export function recortar(texto, max = MAX_SALIDA) {
  const t = String(texto ?? '').replace(/\r/g, '').trimEnd();
  return t.length > max ? '…\n' + t.slice(t.length - max) : t;
}

function leerJson(ruta) {
  try { return JSON.parse(readFileSync(ruta, 'utf8')); } catch { return null; }
}

function leerLineas(ruta) {
  try { return readFileSync(ruta, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean); } catch { return []; }
}

// Una orden: { id, accion, tipo, motivo, pedida }. Cada una por su cuenta: una
// mal formada (un campo de otro tipo, un objeto donde va un texto…) se
// rechaza ELLA, sin tumbar a las demás ni dejar la lista atascada.
function clasificar(o, ahora) {
  const id = o.id;
  // Una acción rara se rechaza (y se dice), pero su texto no se repite tal
  // cual: podría ser cualquier cosa.
  const accion = typeof o.accion === 'string' && /^[a-z-]{1,30}$/.test(o.accion) ? o.accion : 'desconocida';
  const pedidaOk = typeof o.pedida === 'string' && Number.isFinite(Date.parse(o.pedida));
  const pedida = pedidaOk ? Date.parse(o.pedida) : 0;
  const base = { id, accion, pedida };
  if (!ACCIONES.includes(accion)) return { ...base, tipo: 'rechazada', motivo: 'acción no permitida (no está en la lista de acciones.sh)' };
  if (!pedidaOk) return { ...base, tipo: 'rechazada', motivo: 'orden mal formada: «pedida» no es una fecha' };
  const p = o.parametros;
  if (p !== undefined && (p === null || typeof p !== 'object' || Array.isArray(p))) {
    return { ...base, tipo: 'rechazada', motivo: 'orden mal formada: «parametros» no es un objeto' };
  }
  if (p && Object.keys(p).length) return { ...base, tipo: 'rechazada', motivo: 'ninguna acción admite parámetros' };
  if (ahora - pedida > CADUCA_MS) return { ...base, tipo: 'caducada', motivo: 'llevaba más de 6 h esperando' };
  return { ...base, tipo: 'ejecutar', motivo: '' };
}

// Órdenes de ordenesTexto que aún no se han hecho, ya clasificadas y con los
// límites aplicados. registro: [{ id, accion, t }] de lo que el móvil ya ha
// empezado. Devuelve { lista, registro } (el registro con las nuevas).
export function nuevas(ordenesTexto, hechas, resultados, registro = [], ahora = Date.now()) {
  let datos;
  try { datos = JSON.parse(ordenesTexto); } catch { return { lista: [], registro }; }
  const lista = Array.isArray(datos?.ordenes) ? datos.ordenes : [];
  const ya = new Set([...hechas, ...(resultados ?? []).map((r) => r?.id)]);
  const candidatas = [];
  for (const o of lista) {
    try {
      if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !ID_VALIDO.test(o.id) || ya.has(o.id)) continue;
      ya.add(o.id);
      candidatas.push(clasificar(o, ahora));
    } catch { /* ni siquiera se puede leer: fuera, sin tumbar a las demás */ }
  }
  candidatas.sort((a, b) => a.pedida - b.pedida);

  let reg = (Array.isArray(registro) ? registro : [])
    .filter((r) => r && typeof r.id === 'string' && typeof r.accion === 'string' && Number.isFinite(r.t) && ahora - r.t < GUARDAR_REGISTRO_MS);
  for (const c of candidatas) {
    if (c.tipo !== 'ejecutar') continue;
    // Ya contada (se quedó a medias tras una actualización en segundo plano):
    // no compite consigo misma.
    if (reg.some((r) => r.id === c.id)) continue;
    const ultima = Math.max(-Infinity, ...reg.filter((r) => r.accion === c.accion).map((r) => r.t));
    const espera = ESPERAS_MS[c.accion];
    if (ahora - ultima < espera) {
      Object.assign(c, { tipo: 'rechazada', motivo: `demasiado pronto: «${c.accion}» como mucho una cada ${cuanto(espera)}; se podrá dentro de ${cuanto(ultima + espera - ahora)}` });
      continue;
    }
    if (reg.filter((r) => ahora - r.t < 3600 * 1000).length >= MAX_POR_HORA) {
      Object.assign(c, { tipo: 'rechazada', motivo: `demasiadas órdenes: como mucho ${MAX_POR_HORA} por hora` });
      continue;
    }
    reg = [...reg, { id: c.id, accion: c.accion, t: ahora }];
  }
  return { lista: candidatas, registro: reg.slice(-200) };
}

export function anotar(previo, entrada) {
  const lista = Array.isArray(previo?.resultados) ? previo.resultados.filter((r) => r?.id !== entrada.id) : [];
  return { actualizado: new Date().toISOString(), resultados: [entrada, ...lista].slice(0, MAX_RESULTADOS) };
}

const fecha = (s) => {
  const n = Number(s);
  return s && Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

function principal() {
  const [orden, ...args] = process.argv.slice(2);
  const entrada = readFileSync(0, 'utf8');
  if (orden === 'nuevas') {
    const conMotivos = args.includes('--motivos');
    const [hechas, resultados, limites = join(process.env.HOME || '.', '.recolector', 'ordenes-limites.json')] = args.filter((a) => a !== '--motivos');
    const previo = leerJson(limites);
    const { lista, registro } = nuevas(entrada, leerLineas(hechas), leerJson(resultados)?.resultados, Array.isArray(previo) ? previo : []);
    // El registro, ANTES de decir qué ejecutar: si no se puede guardar, no se
    // ejecuta nada (el error tumba el proceso y ordenes.sh lo vuelve a probar).
    writeFileSync(limites + '.tmp', JSON.stringify(registro));
    renameSync(limites + '.tmp', limites);
    for (const o of lista) {
      const motivo = conMotivos ? `\t${String(o.motivo || '').replace(/[\t\r\n]+/g, ' ')}` : '';
      process.stdout.write(`${o.id}\t${o.accion}\t${o.tipo}${motivo}\n`);
    }
  } else if (orden === 'filtrar') {
    process.stdout.write(filtrar(entrada));
  } else if (orden === 'anotar') {
    const [destino] = args;
    const e = process.env;
    const codigo = e.CODIGO === '' || e.CODIGO === undefined ? null : Number(e.CODIGO);
    const nueva = {
      id: ID_VALIDO.test(e.ID ?? '') ? e.ID : 'desconocida',
      accion: /^[a-z-]{1,30}$/.test(e.ACCION ?? '') ? e.ACCION : 'desconocida',
      estado: ['en-curso', 'hecha', 'fallida', 'rechazada', 'caducada'].includes(e.ESTADO) ? e.ESTADO : 'fallida',
      inicio: fecha(e.INICIO),
      fin: fecha(e.FIN),
      codigo: Number.isFinite(codigo) ? codigo : null,
      salida: recortar(filtrar(entrada)),
    };
    const tmp = destino + '.tmp';
    writeFileSync(tmp, JSON.stringify(anotar(leerJson(destino), nueva), null, 2) + '\n');
    renameSync(tmp, destino);
  } else {
    console.error('uso: ordenes.mjs nuevas|anotar …');
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) principal();
