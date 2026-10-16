// La cartelera del día, vista por PELÍCULA y no por cine.
//
// Los adaptadores devuelven una lista por cine, y así la pintaba la web: la
// misma película salía hasta cuatro veces y comparar sus horarios entre cines
// obligaba a ir y volver por la página. Aquí se juntan las entradas que son la
// misma película para que cada una se lea como "sus horas por toda la bahía".
//
// Sin dependencias del navegador ni alias '@/': lo importan tanto la página
// como las pruebas de scripts/ directamente con node.

import { normaliza, pareceElMismo, variantesDeTitulo } from './ratings/match.js';

// ── Minutos ───────────────────────────────────────────────────────────────────
// Las sesiones de madrugada ("00:30", "01:15") pertenecen a la noche del día
// que se está mirando, no a su mañana: los cines las publican así. Si se
// ordenaran tal cual, el pase de las 00:30 saldría el primero del día y como
// "ya pasado" toda la tarde. Por debajo de las 05:00 se cuentan tras las 24:00.
const CORTE_MADRUGADA = 5 * 60;

export function minutosDeSesion(hora) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora || ''));
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]);
  return total < CORTE_MADRUGADA ? total + 24 * 60 : total;
}

// ── ¿Es la misma película? ────────────────────────────────────────────────────
// Con prudencia: juntar dos películas distintas es mucho peor que dejar la
// misma dos veces. Un reestreno "25 aniversario" o un pase en 4K no es la
// película nueva de la saga, y "Padre no hay más que uno 4" no es la 5 aunque
// compartan seis de siete palabras.

// Lo que las coletillas del cine le añaden al título ("20º aniversario",
// "(Infinity Vision)", "4K", "VOSE"…): si un título las lleva y el otro no, o
// llevan otras, no son el mismo pase de la misma película.
function coletillas(titulo) {
  const original = new Set(normaliza(titulo).split(' ').filter(Boolean));
  const limpio = new Set(normaliza(variantesDeTitulo(titulo)[0] ?? titulo).split(' ').filter(Boolean));
  return [...original].filter((p) => !limpio.has(p)).sort().join(' ');
}

// Cifras y números romanos del título: la parte de una saga.
const ROMANOS = new Set(['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']);
function numeros(titulo) {
  return normaliza(titulo)
    .split(' ')
    .filter((p) => /^\d+$/.test(p) || ROMANOS.has(p))
    .sort()
    .join(' ');
}

export function esLaMismaPelicula(a, b) {
  const ta = a?.title ?? '';
  const tb = b?.title ?? '';
  const na = normaliza(ta);
  const nb = normaliza(tb);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // A partir de aquí solo hay parecido, y el parecido tiene que pasar todas
  // las comprobaciones. Basta con que una falle para dejarlas separadas.
  if (!pareceElMismo(ta, tb)) return false;
  if (coletillas(ta) !== coletillas(tb)) return false;
  if (numeros(ta) !== numeros(tb)) return false;
  // Si los dos cines dan duración y no se parecen, son montajes o películas
  // distintas. Diez minutos de margen: unos cuentan los créditos y otros no.
  if (a.durationMin && b.durationMin && Math.abs(a.durationMin - b.durationMin) > 10) return false;
  return true;
}

// Un título escrito TODO EN MAYÚSCULAS es la forma en que lo teclea el cine,
// no el título: si otro cine lo escribe normal, ese es el que se enseña.
function esGrito(t) {
  const letras = String(t || '').replace(/[^a-záéíóúüñ]/gi, '');
  return letras.length > 3 && letras === letras.toUpperCase();
}

function ordenarSesiones(sesiones) {
  return [...(sesiones ?? [])]
    .map((s) => ({ ...s, minuto: minutosDeSesion(s.time) }))
    .filter((s) => s.minuto != null)
    .sort((x, y) => x.minuto - y.minuto);
}

// cines: [{ id, name, short, city, color, website, source, staleAt, movies: [...] }]
// en el orden de lib/cinemas/config.js. Devuelve una entrada por película:
// { clave, title, posterUrl, durationMin, ageRating, genre, generos, synopsis,
//   ratings, isNew, titulos, cines: [{ cine, movie, sessions }], primera }
export function agruparPeliculas(cines) {
  const grupos = [];

  for (const cine of cines ?? []) {
    const { movies, ...datosCine } = cine;
    for (const movie of movies ?? []) {
      const sesiones = ordenarSesiones(movie.sessions);
      if (!sesiones.length) continue;

      let grupo = grupos.find((g) => g.entradas.some((e) => esLaMismaPelicula(e, movie)));
      // Dentro de un mismo cine solo se junta lo que es literalmente el mismo
      // título (el cine lo ha partido en dos). Dos fichas parecidas en el mismo
      // cine son, casi siempre, dos pases distintos: la VOSE y la doblada, la
      // versión 3D aparte…
      if (grupo) {
        const yaEnEsteCine = grupo.cines.find((c) => c.cine.id === cine.id);
        if (yaEnEsteCine && normaliza(yaEnEsteCine.movie.title) !== normaliza(movie.title)) grupo = null;
      }

      if (!grupo) {
        grupo = { entradas: [], cines: [] };
        grupos.push(grupo);
      }
      grupo.entradas.push(movie);
      const enCine = grupo.cines.find((c) => c.cine.id === cine.id);
      if (enCine) {
        enCine.sessions = ordenarSesiones([...enCine.sessions, ...sesiones]);
      } else {
        grupo.cines.push({ cine: datosCine, movie, sessions: sesiones });
      }
    }
  }

  return grupos.map((g) => {
    const e = g.entradas;
    const primero = (campo) => e.find((m) => m[campo] != null && m[campo] !== '')?.[campo] ?? null;
    const titulo = (e.find((m) => !esGrito(m.title)) ?? e[0]).title;
    const generos = [...new Set(e.map((m) => m.genre).filter(Boolean))];
    const ratings = e.find((m) => m.ratings)?.ratings ?? null;
    return {
      clave: normaliza(titulo) || e[0].id,
      title: titulo,
      titulos: [...new Set(e.map((m) => m.title))],
      posterUrl: primero('posterUrl'),
      durationMin: primero('durationMin'),
      ageRating: primero('ageRating'),
      genre: generos[0] ?? null,
      generos,
      synopsis: primero('synopsis'),
      ratings,
      isNew: e.some((m) => m.isNew),
      cines: g.cines,
      primera: Math.min(...g.cines.map((c) => c.sessions[0].minuto)),
    };
  });
}

// ── Orden ─────────────────────────────────────────────────────────────────────
// Hoy manda la primera sesión que AÚN NO ha empezado: lo que uno quiere saber
// es qué puede ver a partir de ahora. Las que ya no tienen ninguna sesión por
// delante se apartan. Otro día, simplemente la primera sesión del día.
// `umbral` es el minuto (del día, con la madrugada tras las 24:00) a partir del
// cual una sesión todavía no ha empezado; null para cualquier día que no sea hoy.
export function ordenarPeliculas(peliculas, umbral = null) {
  const desempate = (a, b) =>
    b.cines.length - a.cines.length || a.title.localeCompare(b.title, 'es');

  if (umbral == null) {
    return {
      porDelante: [...peliculas].sort((a, b) => a.primera - b.primera || desempate(a, b)),
      empezadas: [],
    };
  }

  const siguiente = (p) => {
    let min = Infinity;
    for (const c of p.cines) for (const s of c.sessions) if (s.minuto >= umbral && s.minuto < min) min = s.minuto;
    return min;
  };
  const conSiguiente = peliculas.map((p) => ({ p, sig: siguiente(p) }));
  const porDelante = conSiguiente
    .filter((x) => x.sig !== Infinity)
    .sort((a, b) => a.sig - b.sig || desempate(a.p, b.p))
    .map((x) => x.p);
  const empezadas = conSiguiente
    .filter((x) => x.sig === Infinity)
    .map((x) => x.p)
    .sort((a, b) => a.primera - b.primera || desempate(a, b));
  return { porDelante, empezadas };
}

// Todas las sesiones del día en una sola lista, por hora: la vista "Horario".
export function sesionesEnOrden(peliculas) {
  const filas = [];
  for (const p of peliculas) {
    for (const c of p.cines) {
      for (const s of c.sessions) filas.push({ pelicula: p, cine: c.cine, sesion: s, minuto: s.minuto });
    }
  }
  return filas.sort((a, b) =>
    a.minuto - b.minuto ||
    a.pelicula.title.localeCompare(b.pelicula.title, 'es') ||
    a.cine.id.localeCompare(b.cine.id)
  );
}

// Franjas de una hora en punto ("17:00"). Una hora es lo bastante corta para
// que "qué empieza ahora" se lea de un vistazo y lo bastante larga para que no
// haya un rótulo por cada fila.
export function franjasPorHora(filas) {
  const franjas = [];
  for (const f of filas) {
    const h = Math.floor(f.minuto / 60);
    const ultima = franjas.at(-1);
    if (ultima && ultima.hora === h) ultima.filas.push(f);
    else franjas.push({ hora: h, etiqueta: `${String(h % 24).padStart(2, '0')}:00`, filas: [f] });
  }
  return franjas;
}

// ── Lo pequeño de cada sesión ─────────────────────────────────────────────────
// Solo lo que cambia la decisión: VOSE (el doblaje es lo normal y no se dice),
// el formato si no es el 2D de siempre, y la sala.
export function detallesDeSesion(s) {
  const etiquetas = [];
  if (s.language && s.language !== 'VE') etiquetas.push(s.language);
  if (s.format && s.format !== '2D') etiquetas.push(s.format);
  let sala = s.room ? String(s.room).trim() : '';
  if (/^\d+$/.test(sala)) sala = `Sala ${sala}`;
  // Hay cines que meten el formato en la sala ("PREMIUM"): no se repite.
  if (sala && etiquetas.some((t) => t.toLowerCase() === sala.toLowerCase())) sala = '';
  return { etiquetas, sala };
}

// "de 18:03" si es de hoy; "del lun 12, 18:03" si es de otro día, que con
// datos de hace días la hora sola engañaría. (Misma redacción que tenía la
// sección de cine del diseño anterior.)
export function deCuando(ms) {
  if (!ms) return 'de antes';
  const d = new Date(ms);
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  const dia = (x) => x.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
  if (dia(d) === dia(new Date())) return `de ${hora}`;
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Madrid' });
  return `del ${fecha.replace('.', '')}, ${hora}`;
}
