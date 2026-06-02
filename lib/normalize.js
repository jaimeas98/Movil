// Utilidades de normalización: todos los adaptadores de cines devuelven datos
// con esta misma forma para que la interfaz no tenga que conocer cada fuente.

// Forma de una película normalizada:
// {
//   id: string,            // identificador estable (slug del título)
//   title: string,
//   posterUrl: string|null,
//   durationMin: number|null,
//   genre: string|null,    // género principal en español
//   ageRating: string|null,// p.ej. "+12", "TP", "+16"
//   synopsis: string|null,
//   sessions: [ { time: "HH:MM", format: "2D"|"3D"|..., language: "VE"|"VOSE", room: string|null, buyUrl: string|null } ]
// }

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function minutesToHuman(min) {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

// Ordena las sesiones por hora ascendente.
export function sortSessions(sessions) {
  return [...(sessions || [])].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

// Mezcla películas duplicadas (mismo título) sumando sus sesiones.
export function mergeMoviesByTitle(movies) {
  const map = new Map();
  for (const movie of movies) {
    const key = movie.id || slugify(movie.title);
    if (!map.has(key)) {
      map.set(key, { ...movie, id: key, sessions: [...(movie.sessions || [])] });
    } else {
      const existing = map.get(key);
      existing.sessions.push(...(movie.sessions || []));
      // Completamos campos que falten con los del nuevo registro.
      existing.posterUrl = existing.posterUrl || movie.posterUrl;
      existing.durationMin = existing.durationMin || movie.durationMin;
      existing.genre = existing.genre || movie.genre;
      existing.ageRating = existing.ageRating || movie.ageRating;
      existing.synopsis = existing.synopsis || movie.synopsis;
      existing.isNew = existing.isNew || movie.isNew;
    }
  }
  return [...map.values()].map((m) => ({ ...m, sessions: sortSessions(m.sessions) }));
}
