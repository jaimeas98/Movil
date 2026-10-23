// Enlaces de compra con plantilla editable por cine.
//
// POR QUÉ
// Cada adaptador construye el enlace de compra con un formato fijo, copiado de
// la web del cine el día que se escribió. Cuando el cine cambia ese formato
// (le ha pasado a Arte Siete en octubre de 2026), todos los enlaces mueren a
// la vez y arreglarlo exigía tocar código. Ahora:
//  · cada sesión lleva `enlaceCampos`: SOLO los identificadores que hacen
//    falta para montar su enlace (pase, espectáculo, sesión…);
//  · data/enlaces.js puede guardar, por cine, una plantilla con huecos
//    `{campo}` / `{campo|filtro}` que manda sobre el formato del adaptador;
//  · el panel deduce la plantilla a partir de UN enlace bueno pegado a mano
//    (deducirPlantilla), la prueba y la guarda. Sin tocar código.
//
// Si una sesión no tiene alguno de los campos que pide la plantilla, se queda
// con el enlace del adaptador: una plantilla a medias nunca deja una sesión
// sin enlace que antes sí tenía.

import guardadas from '../../data/enlaces.js';
import { slugify } from '../normalize.js';

// Campos que puede llevar cada cine (y por tanto los únicos huecos válidos en
// su plantilla). El orden importa: en la deducción, si dos campos tienen el
// mismo valor, gana el primero (y se avisa).
export const CAMPOS_POR_CINE = {
  'arte-siete-puerto': ['pase', 'espectaculo', 'titulo'],
  'yelmo-bahia-sur': ['sesion', 'cineVista'],
  'yelmo-jerez': ['sesion', 'cineVista'],
  'cinesur-bahia-cadiz': ['evento', 'pelicula', 'enlace'],
};

// El formato de cada adaptador escrito como plantilla, solo para enseñarlo en
// el panel. Para Arte Siete es exacto; para Yelmo y mk2 el adaptador tiene
// matices (sin cine conocido, enlace sin identificadores) y es el que manda.
export const ORIGINALES = {
  'arte-siete-puerto': 'https://bahia.artesiete.es/Session/33/ARTESIETE%20BAHIA/{pase}/{titulo|mayus|url}/{espectaculo}',
  'yelmo-bahia-sur': 'https://compra.yelmocines.es/?cinemaVistaId={cineVista}&showtimeVistaId={sesion}',
  'yelmo-jerez': 'https://compra.yelmocines.es/?cinemaVistaId={cineVista}&showtimeVistaId={sesion}',
  'cinesur-bahia-cadiz': 'https://cine.entradas.com/cine/cadiz/cinesur-bahia-de-cadiz/evento/{evento}/{pelicula}',
};

export const FILTROS = {
  mayus: (v) => v.toUpperCase(),
  minus: (v) => v.toLowerCase(),
  url: (v) => encodeURIComponent(v),
  // Formularios clásicos: espacios como "+".
  'url+': (v) => encodeURIComponent(v).replace(/%20/g, '+'),
  slug: (v) => slugify(v),
};

// ── A dónde puede llevar un enlace de compra ─────────────────────────────
// SEGURIDAD (revisión del 17-10-2026). Los enlaces de compra salen en la web
// pública, así que quien consiguiera la clave del panel podría, sin esto,
// guardar una plantilla que mandara a todo el mundo a una web suya de pago.
// Y un cine con el HTML manipulado podría colar un `javascript:`. Por eso un
// enlace solo vale si es https, sin usuario, sin puerto y a un dominio del
// propio cine (o un subdominio suyo, para que un cambio de formato del cine
// —p. ej. de bahia.artesiete.es a entradas.artesiete.es— se pueda arreglar
// desde el panel sin tocar código). Dominios sacados de los enlaces reales de
// data/respaldo.js y data/yelmo.js: bahia.artesiete.es, compra.yelmocines.es
// y cine.entradas.com (la taquilla de mk2); mk2cines.es por si mk2 la lleva
// a su propia web. cineyelmo.com es la web nueva de Yelmo (desde el
// 23-10-2026 www.yelmocines.es redirige allí): los enlaces siguen yendo a
// compra.yelmocines.es, que su web nueva aún enlaza, pero si esa taquilla
// muere se podrá llevar la compra a cineyelmo.com desde el panel.
export const HOSTS_POR_CINE = {
  'arte-siete-puerto': ['artesiete.es'],
  'yelmo-bahia-sur': ['yelmocines.es', 'cineyelmo.com'],
  'yelmo-jerez': ['yelmocines.es', 'cineyelmo.com'],
  'cinesur-bahia-cadiz': ['entradas.com', 'mk2cines.es'],
};

export function hostDelCine(host, cineId) {
  if (!Object.hasOwn(HOSTS_POR_CINE, cineId) || typeof host !== 'string') return false;
  const h = host.toLowerCase();
  return HOSTS_POR_CINE[cineId].some((d) => h === d || h.endsWith(`.${d}`));
}

// ¿Puede este enlace salir como enlace de compra de este cine?
export function enlaceDelCine(url, cineId) {
  if (typeof url !== 'string' || !url || url.length > 2000) return false;
  // Nada que el navegador fuera a "arreglar" por su cuenta: espacios,
  // controles o barras invertidas.
  if (/[\s\\\u0000-\u001f\u007f]/.test(url)) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && hostDelCine(u.hostname, cineId)
    && url.toLowerCase().startsWith(`https://${u.hostname}/`);
}

const MAX_PLANTILLA = 1000;
const HUECO = /\{([A-Za-z][A-Za-z0-9]*)((?:\|[a-z+]+)*)\}/g;

export function aplicarFiltros(valor, filtros = []) {
  let v = String(valor);
  for (const f of filtros) v = FILTROS[f](v);
  return v;
}

// Trocea una plantilla en texto y huecos. Devuelve { partes } o { error }.
// Cualquier llave fuera de un hueco bien formado es un error: así no hay
// forma de que un enlace con llaves se interprete a medias.
export function analizarPlantilla(plantilla) {
  if (typeof plantilla !== 'string' || !plantilla) return { error: 'La plantilla está vacía.' };
  const partes = [];
  let ultimo = 0;
  for (const m of plantilla.matchAll(HUECO)) {
    if (m.index > ultimo) partes.push({ texto: plantilla.slice(ultimo, m.index) });
    const filtros = m[2] ? m[2].slice(1).split('|') : [];
    const malo = filtros.find((f) => !Object.hasOwn(FILTROS, f));
    if (malo) return { error: `Filtro desconocido «${malo}» en {${m[1]}${m[2]}}.` };
    partes.push({ campo: m[1], filtros });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < plantilla.length) partes.push({ texto: plantilla.slice(ultimo) });
  if (partes.some((p) => p.texto && /[{}]/.test(p.texto))) {
    return { error: 'Hay una llave { } que no es un hueco válido ({campo} o {campo|filtro}).' };
  }
  return { partes };
}

// El enlace de una sesión con esa plantilla, o null si le falta algún campo.
export function renderizar(plantilla, campos) {
  const { partes, error } = analizarPlantilla(plantilla);
  if (error) return null;
  let out = '';
  for (const p of partes) {
    if (p.texto !== undefined) { out += p.texto; continue; }
    const v = campos && Object.hasOwn(campos, p.campo) ? campos[p.campo] : undefined;
    if (v === undefined || v === null || String(v) === '') return null;
    out += aplicarFiltros(v, p.filtros);
  }
  return out;
}

// Comprueba una plantilla antes de guardarla: forma, longitud, que empiece
// por https://<un dominio del cine>/ escrito tal cual y que solo use campos de
// ese cine. Aun así, cada enlace que sale de ella se vuelve a comprobar al
// aplicarla (aplicarPlantillas): un campo no puede cambiar a dónde lleva.
export function validarPlantilla(plantilla, cineId) {
  if (typeof cineId !== 'string' || !Object.hasOwn(CAMPOS_POR_CINE, cineId)) return { ok: false, error: 'Cine desconocido.' };
  const permitidos = CAMPOS_POR_CINE[cineId];
  if (typeof plantilla !== 'string') return { ok: false, error: 'La plantilla tiene que ser texto.' };
  if (plantilla.length > MAX_PLANTILLA) return { ok: false, error: `La plantilla es demasiado larga (máximo ${MAX_PLANTILLA}).` };
  if (/[\s<>"'`\\]/.test(plantilla)) return { ok: false, error: 'La plantilla no puede llevar espacios, comillas ni < >.' };
  const { partes, error } = analizarPlantilla(plantilla);
  if (error) return { ok: false, error };
  const ajeno = partes.find((p) => p.campo && !permitidos.includes(p.campo));
  if (ajeno) return { ok: false, error: `«${ajeno.campo}» no es un campo de este cine (vale: ${permitidos.join(', ')}).` };
  // El principio, escrito tal cual (nunca un hueco): https://dominio/
  const m = plantilla.match(/^https:\/\/([a-z0-9.-]+)\//i);
  if (!m || !hostDelCine(m[1], cineId)) {
    return { ok: false, error: `La plantilla tiene que empezar por https:// y un dominio del cine (${HOSTS_POR_CINE[cineId].join(' o ')}), escrito tal cual y seguido de /.` };
  }
  return { ok: true };
}

// ── Plantillas guardadas ─────────────────────────────────────────────────
let datosGuardados = guardadas;
// Solo para pruebas: sustituir las plantillas sin tocar data/enlaces.js.
export function usarPlantillas(datos) { datosGuardados = datos ?? guardadas; }

export function plantillaDe(cineId, datos = datosGuardados) {
  const todas = datos?.plantillas;
  const p = todas && typeof cineId === 'string' && Object.hasOwn(todas, cineId) ? todas[cineId]?.plantilla : null;
  // Una plantilla guardada que no valida (editada a mano, de otra versión)
  // se ignora: antes el formato del adaptador que enlaces rotos.
  return typeof p === 'string' && validarPlantilla(p, cineId).ok ? p : null;
}

// Aplica la plantilla del cine (si hay) a todas las sesiones de un byDate, en
// el sitio. Guarda el enlace del adaptador en `enlaceAdaptador` la primera
// vez, para poder volver a él y para enseñarlo en el panel. Es idempotente:
// se puede llamar varias veces sobre los mismos objetos (la memoria del
// agregador los reutiliza).
//
// Es también el FILTRO de todos los enlaces de compra que salen en la web: el
// que dé la plantilla y el del propio adaptador tienen que pasar
// enlaceDelCine; si la plantilla da uno que no, se usa el del adaptador; si
// tampoco vale el del adaptador (HTML del cine manipulado), la sesión se
// queda sin enlace.
export function aplicarPlantillas(cineId, byDate, datos = datosGuardados) {
  const plantilla = plantillaDe(cineId, datos);
  for (const movies of Object.values(byDate ?? {})) {
    for (const m of movies ?? []) {
      for (const s of m.sessions ?? []) {
        if (!s || typeof s !== 'object') continue;
        if (!('enlaceAdaptador' in s)) s.enlaceAdaptador = enlaceDelCine(s.buyUrl, cineId) ? s.buyUrl : null;
        // Sesiones de antes de que existieran los campos (una copia vieja del
        // móvil): se sacan de su propio enlace, que lleva los mismos datos.
        if (!s.enlaceCampos && s.enlaceAdaptador) {
          const c = camposDeEnlace(cineId, s.enlaceAdaptador);
          if (c) s.enlaceCampos = c;
        }
        const r = plantilla && s.enlaceCampos ? renderizar(plantilla, s.enlaceCampos) : null;
        s.buyUrl = r && enlaceDelCine(r, cineId) ? r : s.enlaceAdaptador;
      }
    }
  }
  return byDate;
}

// Para JSON.stringify: lo que no tiene que salir en la respuesta pública de
// la cartelera. Lo usa solo el panel; en la web pública sería peso inútil y
// contaría de más (de dónde salen los datos de cada cine). function y no
// flecha: necesita `this` (el objeto que contiene la clave).
const SOLO_PANEL_CINE = new Set(['origen', 'datosDe', 'diasCompletados']);
export function sinCamposDeEnlace(clave, valor) {
  if (clave === 'enlaceCampos' || clave === 'enlaceAdaptador') return undefined;
  // Los del cine, solo en el objeto del cine (el que tiene liveDates).
  if (SOLO_PANEL_CINE.has(clave) && this && typeof this === 'object' && Object.hasOwn(this, 'liveDates')) return undefined;
  return valor;
}

// ── Campos de mk2 ────────────────────────────────────────────────────────
// mk2 no da identificadores sueltos: solo el enlace a su taquilla
// (cine.entradas.com/…/evento/111777/la-bola-negra). Se sacan de ahí; si un
// día el enlace no los lleva, el campo es el enlace entero.
export function camposMk2(href) {
  // Solo de un enlace que ya vale: un `javascript:` con el nombre del cine
  // dentro no se convierte en un campo {enlace}.
  if (!enlaceDelCine(href, 'cinesur-bahia-cadiz')) return null;
  const m = String(href).match(/\/evento\/(\d+)(?:\/([^/?#]+))?/);
  if (m) return m[2] ? { evento: m[1], pelicula: m[2] } : { evento: m[1] };
  return { enlace: String(href) };
}

// Los campos de una sesión sacados de su enlace con el formato de siempre del
// adaptador, o null si no tiene esa forma.
export function camposDeEnlace(cineId, url) {
  if (!enlaceDelCine(url, cineId)) return null;
  const u = String(url);
  if (cineId === 'arte-siete-puerto') {
    const m = u.match(/^https:\/\/bahia\.artesiete\.es\/Session\/33\/ARTESIETE%20BAHIA\/([^/]+)\/([^/]+)\/([^/?#]+)$/);
    if (!m) return null;
    let titulo;
    try { titulo = decodeURIComponent(m[2]); } catch { return null; }
    return { pase: m[1], espectaculo: m[3], titulo };
  }
  if (cineId === 'yelmo-bahia-sur' || cineId === 'yelmo-jerez') {
    let q;
    try { q = new URL(u).searchParams; } catch { return null; }
    if (!q.get('showtimeVistaId')) return null;
    return { sesion: q.get('showtimeVistaId'), ...(q.get('cinemaVistaId') ? { cineVista: q.get('cinemaVistaId') } : {}) };
  }
  if (cineId === 'cinesur-bahia-cadiz') return camposMk2(u);
  return null;
}

// ── Deducción de la plantilla ────────────────────────────────────────────
// Variantes que se buscan de cada valor. Si dos dan el mismo texto, se queda
// la primera, así que el orden decide cómo se escribe el hueco:
//  · un TEXTO (lleva espacios: un título) prefiere fijar mayúsculas: Arte
//    Siete ya da los títulos en mayúsculas y su web los quiere así; con
//    {titulo|mayus} la plantilla sigue valiendo el día que llegue uno que no;
//  · un IDENTIFICADOR (sin espacios: la-bola-negra, HO0001) va tal cual;
//  · sin letras (un número), los filtros de mayúsculas no pintan nada.
const VARIANTES_TEXTO = [
  ['mayus'], [], ['minus'], ['mayus', 'url'], ['url'], ['minus', 'url'],
  ['mayus', 'url+'], ['url+'], ['minus', 'url+'], ['slug'], ['slug', 'mayus'],
];
const VARIANTES_ID = [
  [], ['mayus'], ['minus'], ['url'], ['mayus', 'url'], ['minus', 'url'],
  ['url+'], ['slug'], ['slug', 'mayus'],
];
const VARIANTES_SIN_LETRAS = [[], ['url'], ['url+']];
const variantesDe = (valor) => {
  const v = String(valor);
  if (!/\p{L}/u.test(v)) return VARIANTES_SIN_LETRAS;
  return /\s/.test(v) ? VARIANTES_TEXTO : VARIANTES_ID;
};

const esAlfanum = (c) => c !== undefined && /[A-Za-z0-9]/.test(c);

// enlace: el enlace BUENO de una sesión; campos: sus enlaceCampos.
// Devuelve { plantilla, usados, sinUsar, renderizado, igual, avisos } o { error }.
export function deducirPlantilla(enlace, campos, ordenCampos = Object.keys(campos ?? {})) {
  if (typeof enlace !== 'string' || !enlace) return { error: 'Falta el enlace.' };
  if (/[{}]/.test(enlace)) return { error: 'El enlace lleva llaves { }; no se puede usar como plantilla.' };
  const avisos = [];

  // Candidatos: (campo, filtros, texto). Más largos primero, para que un
  // número corto no se coma un trozo de otro más largo.
  const candidatos = [];
  const vistos = new Map(); // texto -> campo que ya lo da
  for (const campo of ordenCampos) {
    const valor = campos?.[campo];
    if (valor === undefined || valor === null || String(valor).trim() === '') continue;
    for (const filtros of variantesDe(valor)) {
      let texto;
      try { texto = aplicarFiltros(valor, filtros); } catch { continue; }
      if (!texto) continue;
      if (vistos.has(texto)) {
        const otro = vistos.get(texto);
        if (otro !== campo && !avisos.some((a) => a.includes(`«${otro}» y «${campo}»`))) {
          avisos.push(`«${otro}» y «${campo}» tienen el mismo valor (${String(valor).slice(0, 40)}); revisa cuál es cuál.`);
        }
        continue;
      }
      vistos.set(texto, campo);
      candidatos.push({ campo, filtros, texto });
    }
  }
  candidatos.sort((a, b) => b.texto.length - a.texto.length);

  // El origen (https://host) no se toca: ahí no va ningún identificador, y
  // así un número corto no acaba en el dominio. Salvo un campo que es un
  // enlace entero (mk2), que va justo al principio.
  const origen = (enlace.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i) || [''])[0];
  let trozos = [{ texto: enlace, desde: 0 }];
  for (const c of candidatos) {
    const nuevos = [];
    for (const t of trozos) {
      if (t.texto === undefined) { nuevos.push(t); continue; }
      let resto = t.texto;
      let base = t.desde;
      let i = 0;
      while (true) {
        const j = resto.indexOf(c.texto, i);
        if (j < 0) break;
        const absoluta = base + j;
        const antes = resto[j - 1];
        const despues = resto[j + c.texto.length];
        const enOrigen = absoluta < origen.length && absoluta !== 0;
        if (enOrigen || (absoluta === 0 && c.campo !== 'enlace' && origen) || esAlfanum(antes) || esAlfanum(despues)) {
          i = j + 1; continue;
        }
        if (j > 0) nuevos.push({ texto: resto.slice(0, j), desde: base });
        nuevos.push({ campo: c.campo, filtros: c.filtros });
        base += j + c.texto.length;
        resto = resto.slice(j + c.texto.length);
        i = 0;
      }
      if (resto) nuevos.push({ texto: resto, desde: base });
    }
    trozos = nuevos;
  }

  const plantilla = trozos.map((t) => (t.texto !== undefined
    ? t.texto
    : `{${t.campo}${t.filtros.map((f) => `|${f}`).join('')}}`)).join('');
  const usados = [...new Set(trozos.filter((t) => t.campo).map((t) => t.campo))];
  const sinUsar = ordenCampos.filter((c) => campos?.[c] != null && String(campos[c]) !== '' && !usados.includes(c));
  if (!usados.length) avisos.push('La plantilla no usa ningún campo: todas las sesiones irían al mismo enlace.');
  else if (sinUsar.length) avisos.push(`No aparece en el enlace: ${sinUsar.join(', ')}. Si el enlace funciona igual, no pasa nada.`);
  const renderizado = renderizar(plantilla, campos);
  return { plantilla, usados, sinUsar, renderizado, igual: renderizado === enlace, avisos };
}

// ── Peticiones de comprobación (desde el servidor) ───────────────────────
// Estas peticiones las dispara alguien desde el panel, y las URL salen de una
// plantilla que ha escrito él o de la web de un cine. Para que no sirvan para
// que el servidor llame a direcciones internas (SSRF), solo se pide —y solo
// se siguen redirecciones— a dominios del propio cine (HOSTS_POR_CINE). Una
// lista de dominios, y no un filtro de IPs, porque un nombre cualquiera puede
// resolver a una IP interna (nip.io, DNS rebinding…); los de los cines no.
const MAX_SALTOS = 3;

const CABECERAS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
};

// GET siguiendo redirecciones a mano (máx. 5, cada una validada). Nunca lanza.
// { url, estado, ok: true|false|null, final, motivo, ms }
export async function comprobarEnlace(url, { cineId, tiempoMs = 6000, fetchImpl = globalThis.fetch } = {}) {
  const t0 = Date.now();
  const res = { url, estado: null, ok: false, final: null, motivo: null, ms: 0 };
  if (!enlaceDelCine(url, cineId)) return { ...res, motivo: 'no es un enlace https de la web del cine: no se pide' };
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), tiempoMs);
  let actual = url;
  try {
    for (let salto = 0; salto <= MAX_SALTOS; salto++) {
      const r = await fetchImpl(actual, { method: 'GET', redirect: 'manual', headers: CABECERAS, signal: ctrl.signal, cache: 'no-store' });
      try { await r.body?.cancel?.(); } catch { /* da igual */ }
      res.estado = r.status;
      const destino = r.headers?.get?.('location');
      if (r.status >= 300 && r.status < 400 && destino) {
        if (salto === MAX_SALTOS) { res.motivo = 'demasiadas redirecciones'; break; }
        let siguiente;
        try { siguiente = new URL(destino, actual).toString(); } catch { res.motivo = 'redirección rota'; break; }
        // Solo se sigue dentro de la web del cine; fuera, se dice y se para.
        if (!enlaceDelCine(siguiente, cineId)) { res.motivo = 'redirige fuera de la web del cine'; res.final = siguiente; break; }
        actual = siguiente;
        continue;
      }
      res.final = actual;
      const servidor = r.headers?.get?.('server') || '';
      if ((r.status === 403 || r.status === 503) && (/cloudflare/i.test(servidor) || r.headers?.get?.('cf-mitigated'))) {
        res.ok = null; res.motivo = 'bloqueado por Cloudflare: no se puede comprobar desde el servidor';
      } else if (r.status >= 200 && r.status < 300) {
        // Muchas taquillas no dan 404 con una sesión que no existe: mandan a
        // la portada. Eso es un enlace roto aunque el código sea 200.
        const pedido = new URL(url);
        const fin = new URL(actual);
        const aPortada = (fin.pathname === '/' || fin.pathname === '') && !fin.search
          && (pedido.pathname !== '/' || pedido.search);
        if (aPortada) { res.ok = false; res.motivo = 'redirige a la portada'; } else res.ok = true;
      } else {
        res.ok = false; res.motivo = `HTTP ${r.status}`;
      }
      break;
    }
  } catch (e) {
    res.ok = false;
    res.motivo = ctrl.signal.aborted ? `no responde en ${Math.round(tiempoMs / 1000)} s` : `no se pudo conectar (${String(e?.cause?.code || e?.message || e).slice(0, 60)})`;
  } finally {
    clearTimeout(reloj);
  }
  res.ms = Date.now() - t0;
  return res;
}
