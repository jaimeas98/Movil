// Recolector de Yelmo con un navegador de verdad, para el móvil.
//
// POR QUÉ UN NAVEGADOR (13-10-2026)
// Yelmo bloquea con Cloudflare a los programas automáticos: curl y Node
// reciben 403 incluso desde la conexión de casa, y Chromium sin pantalla
// también, porque se anuncia como "HeadlessChrome". El navegador del mismo
// móvil, manejado a mano, entra sin problema.
//
// Se le planteó al usuario que esto es esquivar una regla antibots y decidió
// seguir: proyecto personal, datos públicos que se ven en cualquier navegador,
// desde su propio móvil y su conexión, a ritmo de persona —un par de veces al
// día—. Así que Chromium usa la identidad del Chrome de ese mismo móvil.
//
// LA IDENTIDAD SALE DEL MÓVIL DONDE CORRE (17-10-2026)
// Modelo y versión de Android los pasa tarea.sh (getprop), y la de Chrome sale
// del Chromium instalado. Si el móvil se cambia por otro, el recolector se
// presenta como lo que es ese otro, sin tocar nada aquí. Si no llegan (se
// ejecuta a mano, sin tarea.sh), se usa el del primer móvil, que es lo que ya
// funcionaba.
//
// LA WEB NUEVA (23-10-2026)
// Ese día Yelmo cambió de web: www.yelmocines.es redirige a
// https://cineyelmo.com/es, una aplicación de Next.js (la de Cinépolis) que
// pide todo a un API GraphQL en api-g.cinepolis.com, también tras Cloudflare
// (Node a pelo desde el móvil: 403). Lo que se sabe de ese API sale de tres
// exploraciones hechas desde el propio móvil (rama estado-movil,
// exploracion-yelmo{,2,3}.json):
//  · Movies (categoría now-playing) da la cartelera de TODA España, 92
//    películas, y su campo `cinemas` viene vacío: no dice en qué cines está
//    cada una.
//  · Billboard (movieId + cinemas + timezone) da las sesiones de una película
//    en los cines pedidos. Es la consulta de la ficha de película de su web.
//  · Si se llama al API desde la página sin más, responde 401 "Unauthorized
//    access.": las peticiones de la propia web llevan cabeceras suyas (una
//    clave o similar; el navegador hace la comprobación previa OPTIONS, señal
//    de cabeceras propias). No sabemos cuáles son y pueden cambiar, así que no
//    se escriben aquí: se COPIAN de las peticiones que hace la propia web al
//    cargar, que el navegador nos deja ver.
//
// QUÉ HACE
//  1. Abre la portada como lo haría cualquiera y mira, sin tocar nada, las
//     peticiones que hace la web al API: se queda con sus cabeceras y con la
//     cartelera (Movies now-playing) que la web ya ha pedido para sí.
//  2. Intenta saber qué películas hay en cada uno de nuestros dos cines
//     (Movies filtrado por cine, una consulta por cine). Si el API no filtra,
//     se miran todas.
//  3. Pide los horarios (Billboard) película a película, una detrás de otra y
//     con pausas de persona entre medias. Si una película falla, se salta y se
//     apunta; si falla la autorización o Cloudflare, se para todo.
//  4. Lo convierte al formato de la web antigua (Cinema → Dates → Movies →
//     Formats → Showtimes), que es el que lee lib/cinemas/yelmo.js: para la
//     web no cambia nada, y la fusión con la recogida anterior tampoco.
//
// El informe del móvil es público: de las cabeceras copiadas solo se apuntan
// los NOMBRES, nunca los valores.
//
// LO NUEVO NO BORRA LO QUE YA HABÍA
// Cada recogida se FUSIONA con la anterior en vez de sustituirla: un día que
// viene en la nueva manda (los horarios pueden cambiar), pero un día que ya
// no aparece —porque la recogida ha venido corta por lo que sea— se conserva
// de la anterior, y un cine que no aparece, también. Mejor ver la cartelera
// de ayer de un día que perder el día. Lo conservado caduca a los 7 días y
// los días ya pasados se van solos.
//
//   DESTINO=~/Movil/data/yelmo.js CHROME=$(command -v chromium-browser) node recolector.mjs
//   … --solo-probar      no escribe nada, solo dice si funciona (y enseña ejemplos)
//   … DISPOSITIVO_MODELO="$(getprop ro.product.model)" DISPOSITIVO_ANDROID="$(getprop ro.build.version.release)"
//
// Necesita puppeteer-core instalado junto a él (lo prepara instalar.sh en
// ~/navegador, que es desde donde lo ejecuta tarea.sh).

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SOLO_PROBAR = process.argv.includes('--solo-probar');
const DESTINO = process.env.DESTINO;

const PORTADA = 'https://cineyelmo.com/es';
const API = 'https://api-g.cinepolis.com/';
const RUTA_CARTELERA = '/v2/billboards/graphql';
const API_CARTELERA = 'https://api-g.cinepolis.com' + RUTA_CARTELERA;

// Nuestros dos cines: id en la web → id en el API nuevo y su número de Vista
// (el sistema de taquilla, el mismo que antes: lo usan los enlaces de compra).
// Sacados de la respuesta real de Cities (scripts/datos-prueba/yelmo-api-real.json).
export const CINES = {
  'yelmo-bahia-sur': { api: 'premium-bahia-sur-cadiz', vista: '1340', nombre: 'Premium Bahía Sur' },
  'yelmo-jerez': { api: 'area-sur-cadiz', vista: '803', nombre: 'Área Sur' },
};
// Los dos a la vez, como pide la consulta Cinemas de su web (`cinemas:
// String!`, un texto con varios). Si el API no lo admite, se pide de uno en uno.
const LOS_DOS = Object.values(CINES).map((c) => c.api).join(',');

// Tiempo máximo de la recogida. tarea.sh corta a los 240 s; con este margen da
// tiempo a cerrar Chromium y escribir. Si no da tiempo, se para SIN publicar
// nada: una recogida a medias quitaría películas de los días que sí trae.
const PRESUPUESTO_MS = 200 * 1000;

// Pausas de persona entre consulta y consulta. RECOLECTOR_PAUSA_MS fija una
// pausa exacta: solo para las simulaciones (probar.sh), que no pueden esperar.
const PAUSA_FIJA = /^\d+$/.test(process.env.RECOLECTOR_PAUSA_MS ?? '') ? Number(process.env.RECOLECTOR_PAUSA_MS) : null;
const pausa = (min, max) => PAUSA_FIJA ?? Math.round(min + Math.random() * (max - min));
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

// El informe es público: cualquier IP que apareciera se tapa.
const log = (...a) => console.log(a.join(' ').replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[IP omitida]'));

// ── Fusión con la recogida anterior ───────────────────────────────────────
const CONSERVAR_MS = 7 * 24 * 3600 * 1000;

const hoyMadrid = (ms) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(ms));

// El día de un bloque de Yelmo, con la misma regla que lib/cinemas/yelmo.js:
// sale del TimeFilter de su primera sesión. Si no se puede saber, null: ese
// día no se conserva, porque no habría forma de saber si está repetido.
export function diaDe(bloque) {
  const tf = bloque?.Movies?.[0]?.Formats?.[0]?.Showtimes?.[0]?.TimeFilter ?? '';
  const dm = tf.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
  const ms = Number((tf.match(/\/Date\((\d+)\)\//) || [])[1]);
  if (ms > 0) return new Date(ms - 6 * 3600 * 1000).toISOString().slice(0, 10);
  return null;
}

// Devuelve { cines, conservados } donde conservados cuenta, por cine, cuántos
// días vienen de la recogida anterior porque esta no los traía.
export function fusionar(previa, nueva, ahora = Date.now()) {
  const hoy = hoyMadrid(ahora);
  const marca = new Date(ahora).toISOString();
  const cines = {};
  const conservados = {};
  const ids = new Set([...Object.keys(previa?.cines ?? {}), ...Object.keys(nueva.cines)]);

  for (const id of ids) {
    const antes = previa?.cines?.[id];
    const ahoraCine = nueva.cines[id];
    // Cada día lleva la fecha en que se recogió, para poder caducarlo.
    const nuevos = (ahoraCine?.Dates ?? []).map((d) => ({ ...d, _recogido: marca }));
    const yaEstan = new Set(nuevos.map(diaDe).filter(Boolean));
    // Lo conservado guarda SU fecha de recogida, no la de hoy: si no, cada
    // fusión lo "rejuvenecería" y no caducaría nunca.
    const viejos = (antes?.Dates ?? [])
      .map((d) => ({ ...d, _recogido: d._recogido ?? previa?.generatedAt }))
      .filter((d) => {
        const dia = diaDe(d);
        const recogido = Date.parse(d._recogido ?? '') || 0;
        return dia && dia >= hoy && !yaEstan.has(dia) && ahora - recogido <= CONSERVAR_MS;
      });
    const dias = [...nuevos, ...viejos].sort((a, b) => (diaDe(a) ?? '').localeCompare(diaDe(b) ?? ''));
    if (!dias.length) continue;
    cines[id] = { ...(antes ?? {}), ...(ahoraCine ?? {}), Dates: dias };
    if (viejos.length) conservados[id] = viejos.length;
  }
  return { cines, conservados };
}

// ── Identidad del móvil ───────────────────────────────────────────────────
// Lo que de verdad pondría el Chrome de este móvil. Solo se aceptan textos con
// pinta de modelo y de versión: lo que venga raro (vacío, con comillas, un
// getprop que ha fallado) cae al del primer móvil en vez de ir tal cual a una
// cabecera.
const MODELO_DE_SIEMPRE = 'Mi Note 10 Lite';
const ANDROID_DE_SIEMPRE = '12';

export function identidad(env = process.env) {
  const m = String(env.DISPOSITIVO_MODELO ?? '').trim();
  const a = String(env.DISPOSITIVO_ANDROID ?? '').trim();
  const modelo = /^[A-Za-z0-9][A-Za-z0-9 ._+()-]{0,39}$/.test(m) ? m : MODELO_DE_SIEMPRE;
  const android = /^\d{1,2}(\.\d{1,2}){0,2}$/.test(a) ? a : ANDROID_DE_SIEMPRE;
  // Las client hints quieren tres números ("12.0.0"); el User-Agent, tal cual.
  const partes = android.split('.');
  while (partes.length < 3) partes.push('0');
  return { modelo, android, androidCompleta: partes.join('.') };
}

// ── El API de cineyelmo.com ───────────────────────────────────────────────
// Las dos consultas, copiadas del código de su web (exploraciones 2 y 3).
const CONSULTA_PELICULAS = `query Movies($countryId: String!, $category: String, $cinemas: String, $after: String, $limit: Int, $isAbsoluteMediaPath: Boolean) {
  movies(countryId: $countryId, category: $category, cinemas: $cinemas, after: $after, limit: $limit, isAbsoluteMediaPath: $isAbsoluteMediaPath) {
    pageInfo { startCursor endCursor hasNextPage hasPreviousPage }
    totalCount
    edges { cursor node {
      id type countryId name originalName distributor rating ratingDescription position genre synopsis length
      availableForSale alerts { title message } releaseDate languages formats tags { name resource }
      media { resource type code sizes { large medium small } } cities cinemas categories experiences { icon name }
    } }
  }
}`;

const CONSULTA_HORARIOS = `query Billboard($countryId: String!, $movieId: String!, $cinemas: String!, $timezone: String) {
  billboard(countryId: $countryId, movieId: $movieId, cinemas: $cinemas, timezone: $timezone) {
    dates
    schedules {
      cinemaId cityId movieId
      dates { date languages { language displayLanguage showtimes {
        format { icon name } sessionId datetime screen experience { icon name } movieVistaId cinemaVistaId
        alerts { section title message } availability isAllocatedSeating
      } } }
    }
  }
}`;

// Cabeceras de la web que se pueden (y conviene) repetir en nuestras
// peticiones. Fuera las que pone el propio navegador o que fetch no deja
// poner (host, cookies, longitud, origen, User-Agent, client hints sec-*…):
// esas ya las pone Chromium igual que para la web, y meterlas a mano o haría
// fallar la petición o sería mentir dos veces.
const NO_COPIAR = new Set([
  'host', 'content-length', 'cookie', 'cookie2', 'connection', 'keep-alive', 'origin', 'referer', 'user-agent',
  'accept-encoding', 'accept-charset', 'accept-language', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via',
  'expect', 'date', 'dnt', 'priority', 'access-control-request-headers', 'access-control-request-method',
]);
export function cabecerasCopiables(cabeceras = {}) {
  const fuera = {};
  for (const [nombre, valor] of Object.entries(cabeceras ?? {})) {
    const n = String(nombre).toLowerCase().trim();
    if (!n || n.startsWith(':') || n.startsWith('sec-') || n.startsWith('proxy-') || NO_COPIAR.has(n)) continue;
    if (typeof valor !== 'string' || /[\r\n]/.test(valor)) continue;
    fuera[n] = valor;
  }
  return fuera;
}

const conEstado = (estado, mensaje) => Object.assign(new Error(mensaje), { estado });

// Lo que devuelve el API, ya comprobado: los datos, o un error con su estado
// HTTP (403 = Cloudflare, 401 = sin autorización) para decidir si seguir.
export function respuestaGraphQL({ status, texto = '' } = {}, que = 'el API') {
  const t = String(texto ?? '');
  if (status === 403) throw conEstado(403, `Cloudflare ha bloqueado el API de cartelera (403) al pedir ${que}.`);
  if (status === 401) throw conEstado(401, `El API ha respondido 401 (no autorizado) al pedir ${que}.`);
  if (!status) throw conEstado(0, `No se ha podido llamar al API para ${que}: ${t.slice(0, 120)}`);
  if (status !== 200) throw conEstado(status, `El API ha respondido ${status} al pedir ${que}.`);
  let j;
  try { j = JSON.parse(t); } catch { throw conEstado(status, `El API no ha devuelto JSON al pedir ${que}: ${t.slice(0, 120)}`); }
  const error = j?.errors?.[0]?.message;
  if (error && (!j.data || Object.values(j.data).every((v) => v == null))) {
    throw conEstado(status, `El API ha dado un error al pedir ${que}: ${String(error).slice(0, 160)}`);
  }
  return j?.data ?? {};
}

// ── Fechas y horas ────────────────────────────────────────────────────────
const RELOJ_MADRID = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function partesMadrid(ms) {
  const p = Object.fromEntries(RELOJ_MADRID.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

// Día y hora en España de lo que dé el API. Aún no hemos visto una respuesta
// de horarios (todas daban 401), así que se acepta lo razonable: con zona
// ("…Z", "+01:00") se pasa a la hora de Madrid; sin zona se toma tal cual,
// porque se pide con timezone "Europe/Madrid"; y también "DD/MM/AAAA HH:MM" o
// milisegundos. → { dia: 'AAAA-MM-DD', hora: 'HH:MM' | null } o null.
export function enMadrid(valor) {
  if (valor == null || valor === '') return null;
  const s = String(valor).trim();
  if (typeof valor === 'number' || /^\d{10,13}$/.test(s)) {
    const ms = Number(s) < 1e12 ? Number(s) * 1000 : Number(s);
    return Number.isFinite(ms) ? partesMadrid(ms) : null;
  }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) {
    if (m[6] && m[4] != null) {
      const zona = m[6].toUpperCase() === 'Z' ? 'Z' : m[6].replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2');
      const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${zona}`);
      if (Number.isFinite(ms)) return partesMadrid(ms);
    }
    return { dia: `${m[1]}-${m[2]}-${m[3]}`, hora: m[4] != null ? `${m[4]}:${m[5]}` : null };
  }
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return { dia: `${m[3]}-${m[2]}-${m[1]}`, hora: m[4] != null ? `${m[4]}:${m[5]}` : null };
  return null;
}

const limpio = (x) => (x == null ? '' : String(x).trim());

// ── Del formato nuevo al antiguo ──────────────────────────────────────────
// El nombre del formato, como lo escribía la web antigua: "2D", "3D",
// "PREMIUM", "3D PREMIUM"… El API nuevo lo separa en formato (2D/3D) y
// experiencia (sus códigos: PREM, DolbyAtmos, 4DE, LUX, XE…). "2D" solo se
// dice si no hay nada más: una sala Premium en 2D era "PREMIUM" a secas.
const EXPERIENCIAS = { PREM: 'PREMIUM', PREMIUM: 'PREMIUM', DOLBYATMOS: 'DOLBY ATMOS', ATMOS: 'DOLBY ATMOS' };
export function nombreFormato(format, experience) {
  const f = limpio(format?.name).toUpperCase();
  const bruto = limpio(experience?.name);
  const e = EXPERIENCIAS[bruto.toUpperCase().replace(/[\s_-]+/g, '')] ?? bruto.toUpperCase();
  const partes = [];
  if (f && !(f === '2D' && e && e !== '2D')) partes.push(f);
  if (e && e !== f && e !== '2D') partes.push(e);
  return partes.join(' ') || '2D';
}

// ¿Versión original subtitulada? La web solo distingue VOSE de doblada. Vale
// lo que diga el texto ("VOSE", "Inglés subtitulado", "Versión original"…) o
// un código de idioma que no sea español (ni catalán, que sería otro doblaje).
const ESPANOL = /^(es|esp|spa|cas|castellano|espa[nñ]ol|doblad[ao])$/i;
export function esVOSE(language, displayLanguage) {
  const texto = `${limpio(displayLanguage)} ${limpio(language)}`;
  // "SUB ESP" (así lo pone Yelmo desde el 23-10-2026) es subtitulada: VOSE.
  if (/VOSE|\bVOS\b|\bV\.?O\.?\b|ORIGINAL|SUBTITUL|\bSUB\b|INGL[EÉ]S|ENGLISH/i.test(texto)) return true;
  const l = limpio(language);
  return /^[a-z]{2,3}$/i.test(l) && !ESPANOL.test(l) && !/^(ca|cat)$/i.test(l);
}

// El cartel vertical (code "poster"), a su tamaño grande (720×1022). Las URL
// traen "España" sin codificar: se codifican para que valgan en cualquier sitio.
export function cartel(media) {
  const lista = Array.isArray(media) ? media : [];
  const p = lista.find((x) => x?.code === 'poster') ?? lista.find((x) => /poster|cartel/i.test(x?.code ?? ''));
  const url = p?.sizes?.large || p?.sizes?.medium || p?.resource || '';
  if (!/^https:\/\//i.test(url)) return null;
  try { return encodeURI(decodeURI(url)); } catch { return url; }
}

const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

// "Estreno" (lo que la web marca como nuevo): si el API lo etiqueta así o si
// se estrenó hace menos de una semana. Las preventas, como las llamaba Yelmo.
function estadoDe(nodo, hoy) {
  const etiquetas = (nodo?.tags ?? []).map((t) => limpio(t?.name));
  if (etiquetas.some((t) => /estreno/i.test(t))) return 'Estreno';
  const estreno = limpio(nodo?.releaseDate).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(estreno) && estreno <= hoy && diasEntre(estreno, hoy) < 7) return 'Estreno';
  if (etiquetas.some((t) => /preventa|anticipada/i.test(t))) return 'Venta Anticipada';
  return '';
}

// La ficha de una película con los nombres de campo de la web antigua.
export function fichaAntigua(nodo, hoy = hoyMadrid(Date.now())) {
  const genero = Array.isArray(nodo?.genre) ? nodo.genre[0] : nodo?.genre;
  return {
    Key: limpio(nodo?.id),
    Title: limpio(nodo?.name) || limpio(nodo?.originalName) || 'Sin título',
    OriginalTitle: limpio(nodo?.originalName),
    Rating: limpio(nodo?.rating) || null,
    RatingDescription: limpio(nodo?.ratingDescription),
    RunTime: (limpio(nodo?.length).match(/\d+/) ?? [''])[0],
    Poster: cartel(nodo?.media),
    Distributor: limpio(nodo?.distributor),
    Gender: limpio(genero),
    Synopsis: limpio(nodo?.synopsis) || null,
    Status: estadoDe(nodo, hoy),
    ReleaseDate: limpio(nodo?.releaseDate) || null,
    Order: Number(nodo?.position) || 0,
  };
}

// peliculas: { [movieId]: nodo de Movies }; horarios: [{ movieId, billboard }].
// → { cines: { 'yelmo-bahia-sur': Cinema antiguo, … }, vistos } donde vistos
// resume lo que ha venido (para el registro y para --solo-probar).
//
// Cada día es un bloque de la cartelera del cine (el `date` del API): una
// sesión de madrugada sigue en el día en que la anuncia el cine. El
// TimeFilter de cada sesión lleva ese día ("DD/MM/AAAA HH:MM:SS"), que es de
// donde lo sacan lib/cinemas/yelmo.js y diaDe() de aquí arriba.
export function aFormatoAntiguo(peliculas, horarios, { ahora = Date.now() } = {}) {
  const hoy = hoyMadrid(ahora);
  const porApi = Object.fromEntries(Object.entries(CINES).map(([id, c]) => [c.api, id]));
  const vistos = { sesiones: 0, descartadas: 0, ajenas: 0, idiomas: new Set(), formatos: new Set(), muestra: null };
  const cines = {};

  for (const { movieId, billboard } of horarios ?? []) {
    for (const prog of billboard?.schedules ?? []) {
      const id = porApi[limpio(prog?.cinemaId)];
      if (!id) { vistos.ajenas++; continue; }
      const nodo = peliculas?.[prog.movieId] ?? peliculas?.[movieId] ?? { id: movieId, name: movieId };
      const cine = (cines[id] ??= { dias: new Map(), vista: null });

      for (const d of prog?.dates ?? []) {
        for (const l of d?.languages ?? []) {
          const vose = esVOSE(l?.language, l?.displayLanguage);
          const idioma = limpio(l?.displayLanguage) || limpio(l?.language);
          for (const s of l?.showtimes ?? []) {
            const cuando = enMadrid(s?.datetime);
            const dia = enMadrid(d?.date)?.dia ?? cuando?.dia;
            if (!cuando?.hora || !dia || limpio(s?.sessionId) === '') { vistos.descartadas++; continue; }
            vistos.sesiones++;
            vistos.muestra ??= { date: d?.date ?? null, datetime: s?.datetime ?? null, screen: s?.screen ?? null,
              language: l?.language ?? null, displayLanguage: l?.displayLanguage ?? null,
              format: s?.format?.name ?? null, experience: s?.experience?.name ?? null,
              cinemaVistaId: s?.cinemaVistaId ?? null, sessionId: s?.sessionId ?? null };
            vistos.idiomas.add(`${limpio(l?.language)}|${limpio(l?.displayLanguage)} → ${vose ? 'VOSE' : 'ESPAÑOL'}`);
            const nombre = nombreFormato(s?.format, s?.experience);
            vistos.formatos.add(`${limpio(s?.format?.name)}+${limpio(s?.experience?.name)} → ${nombre}`);

            const vistaSesion = limpio(s?.cinemaVistaId);
            cine.vista ??= vistaSesion || null;
            if (!cine.dias.has(dia)) cine.dias.set(dia, new Map());
            const pelis = cine.dias.get(dia);
            const clave = limpio(nodo.id) || movieId;
            if (!pelis.has(clave)) pelis.set(clave, { ficha: fichaAntigua(nodo, hoy), formatos: new Map() });
            const peli = pelis.get(clave);
            const language = vose ? 'VOSE' : 'ESPAÑOL';
            const grupo = `${nombre}|${language}`;
            if (!peli.formatos.has(grupo)) peli.formatos.set(grupo, { Name: nombre, Language: language, Idioma: idioma, Showtimes: [] });
            const [a, m, dd] = dia.split('-');
            const sala = limpio(s?.screen);
            peli.formatos.get(grupo).Showtimes.push({
              ShowtimeId: limpio(s.sessionId),
              Time: cuando.hora,
              TimeFilter: `${dd}/${m}/${a} ${cuando.hora}:00`,
              Screen: /^\d+$/.test(sala) ? Number(sala) : (sala || null),
              VistaCinemaId: vistaSesion || CINES[id].vista,
              Datetime: limpio(s?.datetime),
              Availability: s?.availability ?? null,
              _orden: `${cuando.dia} ${cuando.hora}`,
            });
          }
        }
      }
    }
  }

  const fuera = {};
  for (const [id, c] of Object.entries(cines)) {
    const Dates = [...c.dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, pelis]) => ({
      Dia: dia,
      Movies: [...pelis.values()]
        .sort((a, b) => (a.ficha.Order || 999) - (b.ficha.Order || 999) || a.ficha.Title.localeCompare(b.ficha.Title))
        .map(({ ficha, formatos }) => ({
          ...ficha,
          Formats: [...formatos.values()].map((f) => ({
            ...f,
            Showtimes: f.Showtimes.sort((x, y) => x._orden.localeCompare(y._orden)).map(({ _orden, ...resto }) => resto),
          })),
        })),
    }));
    if (!Dates.length) continue;
    fuera[id] = { Key: CINES[id].api, Name: CINES[id].nombre, CityKey: 'cadiz', VistaId: c.vista || CINES[id].vista, Dates };
  }
  return { cines: fuera, vistos };
}

// ── Recogida ──────────────────────────────────────────────────────────────
const operacion = (cuerpo) => {
  try {
    const j = JSON.parse(cuerpo ?? '');
    return Array.isArray(j) ? j[0] : j;
  } catch { return null; }
};

async function recoger() {
  const t0 = Date.now();
  const limite = t0 + PRESUPUESTO_MS;
  const { modelo, android, androidCompleta } = identidad();
  const { default: puppeteer } = await import('puppeteer-core');
  const navegador = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: true,
    // Necesarias para que Chromium arranque dentro de Termux.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const pagina = await navegador.newPage();
    const version = (await navegador.version()).match(/\/(\d+)/)?.[1] ?? '155';
    // Al registro (público): modelo y versiones, nada que identifique al móvil.
    log(`identidad: Android ${android} · ${modelo} · Chrome ${version}`);

    // La identidad del Chrome del propio móvil, incluidas las client hints
    // (Sec-CH-UA), que es donde Chromium sin pantalla mete "HeadlessChrome".
    await pagina.setUserAgent(
      `Mozilla/5.0 (Linux; Android ${android}; ${modelo}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Mobile Safari/537.36`,
      {
        brands: [
          { brand: 'Chromium', version },
          { brand: 'Google Chrome', version },
          { brand: 'Not.A/Brand', version: '99' },
        ],
        fullVersion: `${version}.0.0.0`,
        platform: 'Android',
        platformVersion: androidCompleta,
        architecture: '',
        model: modelo,
        mobile: true,
      }
    );
    // La pantalla, la de un móvil corriente: desde Termux no se puede leer la
    // de verdad sin ADB, y no es lo que mira Cloudflare.
    await pagina.setViewport({ width: 393, height: 851, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
    await pagina.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9' });
    await pagina.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Lo que la propia web pide al API mientras carga: sus cabeceras (por
    // ruta del API, por si cada servicio lleva las suyas) y la cartelera, que
    // ya pide ella. Solo se mira; no se toca ninguna petición.
    const cabecerasPorRuta = new Map();
    const operacionesVistas = new Set();
    let carteleraDeLaWeb = null;
    pagina.on('request', (pet) => {
      try {
        if (pet.method() !== 'POST' || !pet.url().startsWith(API)) return;
        cabecerasPorRuta.set(new URL(pet.url()).pathname, cabecerasCopiables(pet.headers()));
        const op = operacion(pet.postData());
        if (op?.operationName) operacionesVistas.add(op.operationName);
      } catch { /* una petición rara de la web no es asunto nuestro */ }
    });
    pagina.on('response', async (res) => {
      try {
        const pet = res.request();
        if (pet.method() !== 'POST' || !res.url().startsWith(API_CARTELERA) || res.status() !== 200) return;
        const op = operacion(pet.postData());
        if (op?.operationName !== 'Movies' || op.variables?.category !== 'now-playing' || op.variables?.cinemas) return;
        carteleraDeLaWeb = await res.text();
      } catch { /* si no se puede leer, se pide después */ }
    });

    const portada = await pagina.goto(PORTADA, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const estadoPortada = portada?.status();
    log(`portada: ${estadoPortada} · ${await pagina.title()}`);
    if (estadoPortada === 403) {
      throw new Error('Cloudflare ha bloqueado la portada (403): ha cambiado algo en su detección.');
    }
    // Se espera a que la web haya hecho sus peticiones (como mucho 25 s) y un
    // poco más, como una persona que mira la portada antes de buscar. (En las
    // simulaciones la web simulada pide lo suyo al instante, o nunca: no se
    // espera.)
    const hasta = Date.now() + (PAUSA_FIJA == null ? 25000 : 500);
    while (Date.now() < hasta && !(carteleraDeLaWeb && cabecerasPorRuta.has(RUTA_CARTELERA))) await dormir(250);
    await dormir(pausa(2000, 4000));

    const cabeceras = { 'content-type': 'application/json', ...(cabecerasPorRuta.get(RUTA_CARTELERA) ?? [...cabecerasPorRuta.values()][0] ?? {}) };
    const nombres = Object.keys(cabecerasPorRuta.get(RUTA_CARTELERA) ?? [...cabecerasPorRuta.values()][0] ?? {}).sort().join(', ') || 'ninguna';
    log(`peticiones de la web al API: ${[...operacionesVistas].join(', ') || 'ninguna'}`);
    // Solo los NOMBRES: los valores pueden ser una clave y el informe es público.
    log(`cabeceras copiadas de la web (solo nombres): ${nombres}`);
    const explicar = (e) => {
      if (e.estado !== 401) return e;
      return conEstado(401, `${e.message} Cabeceras copiadas de la web: ${nombres}. ` +
        (nombres === 'ninguna' ? 'La web no ha hecho ninguna petición al API que se pudiera copiar.' : 'Con ellas no basta (¿caducan o van firmadas?).'));
    };

    // Las peticiones salen de un MUNDO AISLADO de la página: mismo origen,
    // sesión y cookies que la web, pero con sus propias funciones, para que
    // nada de lo que cargue la página (antes MicrosoftAjax reescribía
    // funciones nativas) pueda romper o espiar nuestro código.
    const cdp = await pagina.createCDPSession();
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const { executionContextId } = await cdp.send('Page.createIsolatedWorld', {
      frameId: frameTree.frame.id,
      worldName: 'recolector',
    });

    // Una petición al API, sin reintentos y siempre después de una pausa:
    // una detrás de otra, a ritmo de persona.
    let peticiones = 0;
    // Si el API corta ("Failed to fetch" a partir de ~57 seguidas, 23-10-2026),
    // se sigue más despacio y lo cortado se reintenta al final, una vez.
    let lenta = false;
    const pedir = async (consulta, variables, operationName, que) => {
      if (peticiones++) await dormir(lenta ? pausa(900, 1500) : pausa(300, 600));
      if (Date.now() > limite) {
        throw conEstado(-1, `No ha dado tiempo: la recogida pasaba de ${PRESUPUESTO_MS / 1000} s (${peticiones - 1} peticiones). No se publica una a medias.`);
      }
      const cuerpo = JSON.stringify({ operationName, variables, query: consulta });
      const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
        expression: `(async () => {
          try {
            const res = await fetch(${JSON.stringify(API_CARTELERA)}, { method: 'POST', headers: ${JSON.stringify(cabeceras)}, body: ${JSON.stringify(cuerpo)} });
            return { status: res.status, texto: await res.text() };
          } catch (e) { return { status: 0, texto: String((e && e.message) || e) }; }
        })()`,
        contextId: executionContextId,
        awaitPromise: true,
        returnByValue: true,
      });
      if (exceptionDetails) throw conEstado(0, exceptionDetails.exception?.description || exceptionDetails.text);
      return respuestaGraphQL(result?.value, que);
    };

    // Movies en cartelera, con todas sus páginas (hoy viene en una sola).
    const peliculasDe = async (cinemas, que) => {
      const todas = [];
      let despues;
      for (let pag = 0; pag < 5; pag++) {
        const variables = { category: 'now-playing', cinemas, limit: 100, countryId: 'ES', isAbsoluteMediaPath: true };
        if (despues) variables.after = despues;
        const datos = await pedir(CONSULTA_PELICULAS, variables, 'Movies', que);
        const pelis = datos?.movies;
        todas.push(...(pelis?.edges ?? []).map((e) => e?.node).filter((n) => n?.id));
        if (!pelis?.pageInfo?.hasNextPage || !pelis.pageInfo.endCursor || pelis.pageInfo.endCursor === despues) break;
        despues = pelis.pageInfo.endCursor;
      }
      return todas;
    };

    // 1. La cartelera de toda España: la que ya ha pedido la web, o la pedimos.
    let todas = null;
    if (carteleraDeLaWeb) {
      try {
        const datos = respuestaGraphQL({ status: 200, texto: carteleraDeLaWeb }, 'la cartelera');
        todas = (datos?.movies?.edges ?? []).map((e) => e?.node).filter((n) => n?.id);
        if (datos?.movies?.pageInfo?.hasNextPage) todas = null;   // incompleta: mejor pedirla entera
        else log(`cartelera: ${todas.length} películas en España (la que ya había pedido la web)`);
      } catch { todas = null; }
    }
    if (!todas?.length) {
      try { todas = await peliculasDe('', 'la cartelera'); }
      catch (e) { throw explicar(e); }
      log(`cartelera: ${todas.length} películas en España (pedida por el recolector)`);
    }
    if (!todas.length) throw new Error('La cartelera del API ha venido vacía.');
    const peliculas = Object.fromEntries(todas.map((n) => [n.id, n]));
    const titulo = (id) => limpio(peliculas[id]?.name) || id;

    // 2. Qué películas hay en cada cine. El campo `cinemas` de cada película
    // vino vacío en la exploración; si un día viene relleno, manda. Si no, se
    // pregunta al API filtrando por cine; si no filtra (devuelve todas, o
    // nada), se mirarán todas las películas.
    const listas = {};
    const conCines = todas.some((n) => Array.isArray(n.cinemas) && n.cinemas.length);
    for (const [id, c] of Object.entries(CINES)) {
      if (conCines) {
        listas[id] = todas.filter((n) => (n.cinemas ?? []).some((x) => (x?.id ?? x) === c.api)).map((n) => n.id);
        log(`${id}: ${listas[id].length} películas según la cartelera`);
        continue;
      }
      try {
        const suyas = await peliculasDe(c.api, `la cartelera de ${c.nombre}`);
        for (const n of suyas) peliculas[n.id] ??= n;
        if (suyas.length && suyas.length < todas.length) {
          listas[id] = suyas.map((n) => n.id);
          log(`${id}: el API filtra por cine → ${suyas.length} de ${todas.length} películas`);
        } else log(`${id}: el API no filtra por cine (${suyas.length} de ${todas.length}); se mirarán todas`);
      } catch (e) {
        if (e.estado === 401 || e.estado === 403 || e.estado === -1) throw explicar(e);
        log(`⚠️  ${id}: no se ha podido filtrar por cine (${e.message}); se mirarán todas`);
      }
    }

    // 3. Los horarios, película a película.
    //  · por cine: si sabemos qué películas tiene cada cine, una consulta por
    //    película y cine (sin dudas sobre cómo se piden dos cines a la vez);
    //  · juntos: si no, una por película con los dos cines a la vez, que son
    //    la mitad de peticiones. Mientras no haya funcionado ninguna, cada
    //    fallo se prueba otra vez con un solo cine (hasta tres veces, por si
    //    la primera película es la que está rota): si así funciona, el API no
    //    admite dos cines a la vez y se sigue de uno en uno.
    let modo = Object.keys(CINES).every((id) => listas[id]) ? 'por cine' : 'juntos';
    let sondeos = 0;
    const porCine = (ids) => Object.entries(CINES).flatMap(([id, c]) => ids(id).map((movieId) => ({ movieId, cinemas: c.api })));
    let tareas = modo === 'por cine' ? porCine((id) => listas[id]) : todas.map((n) => ({ movieId: n.id, cinemas: LOS_DOS }));
    log(`horarios: ${tareas.length} consultas (${modo === 'por cine' ? 'una por película y cine' : 'una por película, los dos cines a la vez'})`);

    const horarios = [];
    const fallos = [];
    const cortadas = [];
    const consultar = (t) => pedir(CONSULTA_HORARIOS,
      { countryId: 'ES', movieId: t.movieId, cinemas: t.cinemas, timezone: 'Europe/Madrid' }, 'Billboard', `los horarios de «${titulo(t.movieId)}»`)
      .then((datos) => {
        if (!datos?.billboard) throw conEstado(200, `El API no ha devuelto horarios de «${titulo(t.movieId)}»`);
        return datos.billboard;
      });
    for (let i = 0; i < tareas.length; i++) {
      const t = tareas[i];
      try {
        horarios.push({ movieId: t.movieId, billboard: await consultar(t) });
      } catch (e) {
        if (e.estado === 401 || e.estado === 403 || e.estado === -1) throw explicar(e);
        if (modo === 'juntos' && !horarios.length && sondeos < 3) {
          sondeos++;
          const uno = Object.values(CINES)[0].api;
          try {
            const billboard = await consultar({ movieId: t.movieId, cinemas: uno });
            log(`⚠️  el API no admite los dos cines a la vez ("${LOS_DOS}": ${e.message}); se piden de uno en uno`);
            horarios.push({ movieId: t.movieId, billboard });
            modo = 'por cine';
            const resto = todas.slice(todas.findIndex((n) => n.id === t.movieId)).map((n) => n.id);
            tareas = [...tareas.slice(0, i + 1),
              ...Object.values(CINES).slice(1).map((c) => ({ movieId: t.movieId, cinemas: c.api })),
              ...porCine(() => resto.slice(1))];
            continue;
          } catch (e2) {
            if (e2.estado === 401 || e2.estado === 403 || e2.estado === -1) throw explicar(e2);
          }
        }
        if (e.estado === 0) { lenta = true; cortadas.push(t); continue; }
        fallos.push(`«${titulo(t.movieId)}»: ${e.message}`);
        log(`⚠️  sin horarios de «${titulo(t.movieId)}» (${t.cinemas}): ${e.message} — se salta`);
      }
    }
    // Lo que cortó el API: un respiro y otra vez, despacio, mientras dé tiempo
    // (con margen: pasarse del presupuesto tiraría la recogida entera).
    if (cortadas.length) {
      log(`el API ha cortado ${cortadas.length} consultas; respiro y se reintentan despacio`);
      await dormir(PAUSA_FIJA ?? 15000);
      for (const t of cortadas) {
        if (Date.now() > limite - 20000) {
          fallos.push(`«${titulo(t.movieId)}»: sin tiempo para reintentarla`);
          log(`⚠️  sin horarios de «${titulo(t.movieId)}» (${t.cinemas}): sin tiempo para reintentarla — se salta`);
          continue;
        }
        try { horarios.push({ movieId: t.movieId, billboard: await consultar(t) }); }
        catch (e) {
          if (e.estado === 401 || e.estado === 403 || e.estado === -1) throw explicar(e);
          fallos.push(`«${titulo(t.movieId)}»: ${e.message}`);
          log(`⚠️  sin horarios de «${titulo(t.movieId)}» (${t.cinemas}): ${e.message} — se salta`);
        }
      }
    }
    if (!horarios.length) throw new Error(`No ha funcionado ninguna consulta de horarios (${fallos.length}). La primera: ${fallos[0] ?? '—'}`);
    if (fallos.length > tareas.length / 2) {
      throw new Error(`Han fallado ${fallos.length} de ${tareas.length} consultas de horarios: algo ha cambiado en el API. La primera: ${fallos[0]}`);
    }

    // 4. Al formato de siempre.
    const { cines, vistos } = aFormatoAntiguo(peliculas, horarios);
    log(`horarios: ${horarios.length} bien, ${fallos.length} saltadas · ${vistos.sesiones} sesiones` +
      (vistos.descartadas ? ` · ${vistos.descartadas} descartadas por no entender su fecha u hora` : '') +
      ` · ${peticiones} peticiones al API en ${Math.round((Date.now() - t0) / 1000)} s`);
    for (const id of Object.keys(CINES)) {
      if (!cines[id]) {
        log(`⚠️  no ha venido ninguna sesión de ${id} (${CINES[id].api})` +
          (modo === 'juntos' ? ` — ¿no entiende los dos cines separados por coma?` : ''));
      }
    }
    if (!Object.keys(cines).length) throw new Error('No ha venido ninguno de nuestros dos cines.');
    return { recogida: { generatedAt: new Date().toISOString(), origen: 'navegador-movil', fuente: 'cineyelmo.com', cines }, vistos };
  } finally {
    await navegador.close();
  }
}

// Las primeras sesiones de un cine, para ver de un vistazo que tienen sentido.
function primerasSesiones(cine, n = 3) {
  const todas = [];
  for (const d of cine.Dates ?? []) {
    for (const m of d.Movies ?? []) {
      for (const f of m.Formats ?? []) {
        for (const s of f.Showtimes ?? []) todas.push({ dia: d.Dia ?? diaDe(d), m, f, s });
      }
    }
  }
  return todas.sort((a, b) => `${a.dia} ${a.s.Time}`.localeCompare(`${b.dia} ${b.s.Time}`)).slice(0, n);
}

async function principal() {
  const { recogida, vistos } = await recoger();
  for (const [id, c] of Object.entries(recogida.cines)) {
    const titulos = new Set();
    let sesiones = 0;
    for (const d of c.Dates) for (const m of d.Movies) {
      titulos.add(m.Title);
      for (const f of m.Formats) sesiones += f.Showtimes.length;
    }
    log(`✅ ${id}: ${c.Dates.length} días, ${titulos.size} películas, ${sesiones} sesiones`);
    if (!SOLO_PROBAR) continue;
    for (const { dia, m, f, s } of primerasSesiones(c)) {
      log(`     · ${dia} ${s.Time} «${m.Title}» — ${f.Name} · ${f.Language} (${f.Idioma || '?'}) · sala ${s.Screen ?? '?'} · sesión ${s.ShowtimeId}`);
    }
    const [primera] = primerasSesiones(c, 1);
    if (primera) log(`     compra (formato de siempre): https://compra.yelmocines.es/?cinemaVistaId=${c.VistaId}&showtimeVistaId=${primera.s.ShowtimeId}`);
  }

  if (SOLO_PROBAR) {
    // Lo que de verdad ha devuelto el API, para comprobar las suposiciones
    // sobre su forma (aún no se había visto ninguna respuesta de horarios).
    log(`muestra del API: ${JSON.stringify(vistos.muestra)}`);
    log(`idiomas vistos: ${[...vistos.idiomas].slice(0, 12).join(' ; ') || '—'}`);
    log(`formatos vistos: ${[...vistos.formatos].slice(0, 12).join(' ; ') || '—'}`);
    if (vistos.ajenas) log(`programas de otros cines ignorados: ${vistos.ajenas}`);
    log('VEREDICTO: FUNCIONA (no se ha escrito nada)');
    return;
  }
  if (!DESTINO) throw new Error('Falta DESTINO: dónde escribir data/yelmo.js');

  let previa = null;
  try {
    const t = readFileSync(DESTINO, 'utf8');
    previa = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch { /* no había instantánea previa (o era el marcador vacío) */ }

  const { cines, conservados } = fusionar(previa, recogida);
  for (const [id, n] of Object.entries(conservados)) {
    log(`🛟 ${id}: ${n} día(s) que esta recogida no traía se conservan de la anterior`);
  }
  for (const id of Object.keys(cines)) {
    if (!recogida.cines[id]) log(`🛟 ${id}: no ha venido; se conserva el de la recogida anterior`);
  }

  writeFileSync(
    DESTINO,
    '// Instantánea de la cartelera de Yelmo, recogida con un navegador desde el móvil.\n' +
    '// La genera scripts/movil/recolector-navegador.mjs — NO se edita a mano.\n' +
    'export default ' + JSON.stringify({ ...recogida, cines }, null, 2) + ';\n'
  );
  log(`guardado en ${DESTINO}`);
}

// Solo se recoge al ejecutarlo; importarlo (las pruebas) no abre nada.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await principal();
  } catch (e) {
    log(`❌ ${e.message}`);
    process.exit(1);
  }
}
