// Enlaces de compra en el panel: ver las plantillas, deducir una nueva a
// partir de un enlace bueno, probarla con sesiones reales y guardarla.
// El motor (huecos, filtros, deducción) está en lib/cinemas/enlaces.js; aquí
// solo lo que necesita el panel: elegir sesiones, pedir y guardar en GitHub.

import { getShowtimes } from '../cinemas/aggregator.js';
import {
  CAMPOS_POR_CINE, FILTROS, HOSTS_POR_CINE, ORIGINALES, comprobarEnlace, deducirPlantilla, enlaceDelCine,
  plantillaDe, renderizar, validarPlantilla,
} from '../cinemas/enlaces.js';
import guardadas from '../../data/enlaces.js';
import { actualizarFichero, RAMA_APP } from './github.js';
import { ErrorPanel } from './http.js';

export const MAX_PRUEBAS_DEDUCIR = 5;
// Guardar una plantilla es un commit en la rama de la web, que redespliega
// Vercel: como mucho uno por minuto. Se mira la hora que guarda el propio
// fichero (`actualizado`), así vale aunque cada petición caiga en una
// instancia distinta del servidor.
export const ENTRE_GUARDADOS_MS = 60 * 1000;

// ¿Es un cine de verdad? (Un `cine` que llega del panel no puede ser
// "constructor" ni "__proto__": se mira que sea una clave PROPIA.)
export const cineValido = (id) => typeof id === 'string' && Object.hasOwn(CAMPOS_POR_CINE, id);

// Una sesión con todo lo que el panel enseña de ella.
function fichaSesion(cineId, fecha, peli, s) {
  return {
    clave: [cineId, fecha, peli.id, s.time, s.room ?? '', s.language ?? '', s.format ?? ''].join('|'),
    fecha,
    hora: s.time,
    pelicula: peli.title,
    sala: s.room ?? null,
    formato: s.format ?? null,
    idioma: s.language ?? null,
    campos: s.enlaceCampos ? { ...s.enlaceCampos } : null,
    enlace: s.buyUrl ?? null,
    enlaceOriginal: s.enlaceAdaptador !== undefined ? s.enlaceAdaptador : (s.buyUrl ?? null),
  };
}

// Sesiones de un cine con campos, desde hoy, intercalando películas: primero
// una de cada película, luego segundas… Así una prueba de 5 sesiones toca 5
// películas distintas, no 5 pases de la misma.
export function sesionesDe(cine, { max = 12, dias = null, excluir = null } = {}) {
  const fechas = Object.keys(cine?.byDate ?? {}).sort().filter((d) => cine.byDate[d]?.length);
  const elegidas = dias ? fechas.slice(0, dias) : fechas;
  const porPeli = new Map();
  for (const f of elegidas) {
    for (const p of cine.byDate[f]) {
      for (const s of p.sessions ?? []) {
        if (!s.enlaceCampos && !s.buyUrl) continue;
        const ficha = fichaSesion(cine.id, f, p, s);
        if (excluir && ficha.clave === excluir) continue;
        if (!porPeli.has(p.id)) porPeli.set(p.id, []);
        porPeli.get(p.id).push(ficha);
      }
    }
  }
  const out = [];
  const listas = [...porPeli.values()];
  for (let i = 0; out.length < max && listas.some((l) => l.length > i); i++) {
    for (const l of listas) if (l[i] && out.length < max) out.push(l[i]);
  }
  return out;
}

function cineDe(datos, cineId) {
  if (!cineValido(cineId)) throw new ErrorPanel(400, 'datos', 'Cine desconocido.');
  const c = datos.cinemas.find((x) => x.id === cineId);
  if (!c) throw new ErrorPanel(404, 'no-esta', 'Ese cine no está en la cartelera ahora mismo.');
  return c;
}

export async function listarEnlaces() {
  const datos = await getShowtimes();
  return {
    filtros: Object.keys(FILTROS),
    cines: datos.cinemas.map((c) => ({
      id: c.id,
      nombre: c.name,
      campos: CAMPOS_POR_CINE[c.id] ?? [],
      original: ORIGINALES[c.id] ?? null,
      plantilla: plantillaDe(c.id),
      guardada: guardadas?.plantillas?.[c.id]?.guardada ?? null,
      sesiones: sesionesDe(c, { max: 12, dias: 2 }),
    })),
  };
}

// Campos que llegan a mano (si la sesión ya no está): solo los de ese cine,
// y como texto corto.
function camposDeCuerpo(cineId, campos) {
  if (!campos || typeof campos !== 'object' || Array.isArray(campos)) return null;
  const out = {};
  for (const k of CAMPOS_POR_CINE[cineId]) {
    const v = campos[k];
    if (v === undefined || v === null || v === '') continue;
    if ((typeof v !== 'string' && typeof v !== 'number') || String(v).length > 300) {
      throw new ErrorPanel(400, 'datos', `El campo «${k}» no vale.`);
    }
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : null;
}

async function probar(sesiones, plantilla, cineId) {
  return Promise.all(sesiones.map(async (s) => {
    const url = plantilla ? renderizar(plantilla, s.campos ?? {}) : s.enlace;
    const base = { clave: s.clave, pelicula: s.pelicula, fecha: s.fecha, hora: s.hora };
    if (!url) return { ...base, url: null, estado: null, ok: false, final: null, motivo: 'a esta sesión le faltan campos para la plantilla', ms: 0 };
    // comprobarEnlace solo pide a dominios de ESTE cine (ver HOSTS_POR_CINE).
    return { ...base, ...(await comprobarEnlace(url, { cineId })) };
  }));
}

export async function deducir(cuerpo) {
  const datos = await getShowtimes();
  const cine = cineDe(datos, cuerpo?.cine);
  const enlace = typeof cuerpo?.enlaceBueno === 'string' ? cuerpo.enlaceBueno.trim() : '';
  if (!enlaceDelCine(enlace, cine.id)) {
    throw new ErrorPanel(400, 'datos', `El enlace tiene que ser https:// de la web del cine (${HOSTS_POR_CINE[cine.id].join(' o ')}), sin usuario ni puerto.`);
  }

  let campos = null;
  if (typeof cuerpo.sesion === 'string' && cuerpo.sesion.length <= 500) {
    campos = sesionesDe(cine, { max: 100000 }).find((s) => s.clave === cuerpo.sesion)?.campos ?? null;
  }
  if (!campos) campos = camposDeCuerpo(cine.id, cuerpo.campos);
  if (!campos) throw new ErrorPanel(404, 'no-esta', 'Esa sesión ya no está en la cartelera (o no tiene campos). Elige otra.');

  const r = deducirPlantilla(enlace, campos, CAMPOS_POR_CINE[cine.id]);
  if (r.error) throw new ErrorPanel(400, 'datos', r.error);
  const valida = validarPlantilla(r.plantilla, cine.id);
  if (!valida.ok) throw new ErrorPanel(400, 'datos', `La plantilla deducida no vale: ${valida.error}`);

  const otras = sesionesDe(cine, { max: MAX_PRUEBAS_DEDUCIR, excluir: cuerpo.sesion ?? null })
    .filter((s) => s.campos && renderizar(r.plantilla, s.campos));
  return { ...r, pruebas: await probar(otras.slice(0, MAX_PRUEBAS_DEDUCIR), r.plantilla, cine.id) };
}

// El fichero data/enlaces.js: un módulo con el JSON dentro, como data/yelmo.js
// y data/respaldo.js, para que se importe igual desde Next y desde node.
export function leerDatosEnlaces(texto) {
  if (!texto) return { plantillas: {} };
  const i = texto.indexOf('{', texto.indexOf('export default'));
  const j = texto.lastIndexOf('}');
  try {
    const d = JSON.parse(texto.slice(i, j + 1));
    if (!d || typeof d.plantillas !== 'object' || !d.plantillas) return { plantillas: {} };
    // Solo cines de verdad: una clave rara que alguien hubiera metido a mano
    // se cae al volver a escribir el fichero.
    const plantillas = Object.fromEntries(Object.entries(d.plantillas).filter(([k]) => cineValido(k)));
    return { ...(typeof d.actualizado === 'string' ? { actualizado: d.actualizado } : {}), plantillas };
  } catch { return { plantillas: {} }; }
}

export function escribirDatosEnlaces(datos) {
  return '// Plantillas de los enlaces de compra, por cine. Las guarda el panel de\n' +
    '// control (/api/panel/enlaces) — no hace falta editarlas a mano.\n' +
    '// Sin plantilla, cada cine usa el formato de su adaptador (lib/cinemas).\n' +
    '// Formato y porqués: lib/cinemas/enlaces.js y docs/panel/API.md.\n' +
    'export default ' + JSON.stringify(datos, null, 2) + ';\n';
}

export async function guardar(cuerpo, ahora = new Date()) {
  const cine = cuerpo?.cine;
  if (!cineValido(cine)) throw new ErrorPanel(400, 'datos', 'Cine desconocido.');
  const plantilla = cuerpo.plantilla;
  if (plantilla === undefined) throw new ErrorPanel(400, 'datos', 'Falta la plantilla (o null para volver al formato original).');
  if (plantilla !== null) {
    const v = validarPlantilla(plantilla, cine);
    if (!v.ok) throw new ErrorPanel(400, 'datos', v.error);
  }
  const r = await actualizarFichero(RAMA_APP, 'data/enlaces.js', (texto) => {
    const datos = leerDatosEnlaces(texto);
    const hace = ahora - Date.parse(datos.actualizado ?? '');
    if (hace >= 0 && hace < ENTRE_GUARDADOS_MS) {
      const s = Math.ceil((ENTRE_GUARDADOS_MS - hace) / 1000);
      throw new ErrorPanel(429, 'espera', `Se acaba de guardar una plantilla; podrás guardar otra en ${s} s.`, { reintentarEn: s });
    }
    datos.actualizado = ahora.toISOString();
    if (plantilla === null) delete datos.plantillas[cine];
    else datos.plantillas[cine] = { plantilla, guardada: ahora.toISOString() };
    return escribirDatosEnlaces(datos);
  }, plantilla === null
    ? `Panel: enlaces de ${cine} vuelven al formato original`
    : `Panel: plantilla de enlaces de ${cine}`);
  return {
    ok: true,
    cine,
    plantilla,
    commit: r.commit ? r.commit.slice(0, 7) : null,
    aviso: 'Guardado. La cartelera lo usará cuando Vercel termine de redesplegar (~1 min).',
  };
}

export async function comprobar(cuerpo) {
  const datos = await getShowtimes();
  const ids = cuerpo?.cine ? [cineDe(datos, cuerpo.cine).id] : datos.cinemas.map((c) => c.id);
  const porCine = ids.length === 1 ? 5 : 3;
  const cines = await Promise.all(ids.map(async (id) => {
    const c = datos.cinemas.find((x) => x.id === id);
    const sesiones = sesionesDe(c, { max: porCine, dias: 1 }).filter((s) => s.enlace);
    const pruebas = await probar(sesiones, null, id);
    return {
      id,
      nombre: c.name,
      plantilla: plantillaDe(id) ? 'propia' : 'original',
      probadas: pruebas.length,
      buenas: pruebas.filter((p) => p.ok === true).length,
      dudosas: pruebas.filter((p) => p.ok === null).length,
      pruebas,
    };
  }));
  return { comprobadoEn: new Date().toISOString(), cines };
}
