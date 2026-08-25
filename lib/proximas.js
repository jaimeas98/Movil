'use client';

import { longLabel } from './dates.js';

// "Próximas": las películas que los cines ya tienen programadas MÁS ALLÁ de los
// días que se ven en la tira. Son sobre todo ciclos y reestrenos —el ciclo de
// clásicos de mk2, el ciclo Ghibli, las óperas— que se anuncian con semanas o
// meses de antelación y que, si no te metes justo el día que salen, se pasan.
//
// No hace falta pedir nada nuevo: los adaptadores ya devuelven esas fechas
// lejanas, solo que la cartelera únicamente pinta los primeros días.

export function calcularProximas(cinemas, ultimoDiaVisible) {
  const porPelicula = new Map();

  for (const cine of cinemas ?? []) {
    for (const [iso, peliculas] of Object.entries(cine.byDate ?? {})) {
      if (ultimoDiaVisible && iso <= ultimoDiaVisible) continue;
      for (const peli of peliculas ?? []) {
        const clave = peli.id || peli.title;
        if (!porPelicula.has(clave)) {
          porPelicula.set(clave, { ...peli, pases: [] });
        }
        const ficha = porPelicula.get(clave);
        // Nos quedamos con los datos más completos que encontremos: un mismo
        // título puede venir de dos cines y que solo uno traiga sinopsis.
        if (!ficha.synopsis && peli.synopsis) ficha.synopsis = peli.synopsis;
        if (!ficha.posterUrl && peli.posterUrl) ficha.posterUrl = peli.posterUrl;
        if (!ficha.genre && peli.genre) ficha.genre = peli.genre;
        if (!ficha.durationMin && peli.durationMin) ficha.durationMin = peli.durationMin;
        ficha.pases.push({
          iso,
          cineId: cine.id,
          cineNombre: cine.short || cine.name,
          color: cine.color,
          sesiones: peli.sessions ?? [],
        });
      }
    }
  }

  const lista = [...porPelicula.values()];
  for (const p of lista) {
    p.pases.sort((a, b) => a.iso.localeCompare(b.iso));
    p.primeraFecha = p.pases[0]?.iso ?? '';
  }
  // Lo más cercano primero: es lo que uno quiere saber, qué cae antes.
  lista.sort((a, b) => a.primeraFecha.localeCompare(b.primeraFecha));
  return lista;
}

// "vie 29 oct" — compacto, para los chips de fecha.
export function fechaCorta(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(d).replace(/\./g, '');
}

// Agrupa por mes para poder poner separadores en la lista.
export function mesDe(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const t = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export { longLabel };
