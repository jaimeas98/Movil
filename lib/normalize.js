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

// Los títulos que scrapeamos del HTML llegan con entidades sin decodificar
// ("Minions &amp; Monsters"). Se muestran tal cual en la tarjeta, así que hay
// que convertirlas antes de guardarlas.
export function decodeEntities(text) {
  return String(text || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // el último, para no re-decodificar de más
}

// Los géneros llegan escritos de cualquier manera: los propios datos de un
// mismo cine traen "Animacion" y "Animación", unos cines dicen "Aventura" y
// otros "Aventuras", y si TMDB no contesta puede colarse el inglés de OMDB.
// Cada variante creaba un chip de filtro distinto para el mismo género.
//
// La clave de comparación es el texto sin acentos y en minúsculas; a partir de
// ahí se devuelve SIEMPRE la misma etiqueta en español.
const GENEROS = {
  accion: 'Acción', action: 'Acción',
  animacion: 'Animación', animation: 'Animación',
  aventura: 'Aventura', aventuras: 'Aventura', adventure: 'Aventura',
  comedia: 'Comedia', comedy: 'Comedia',
  drama: 'Drama',
  terror: 'Terror', horror: 'Terror',
  suspense: 'Suspense', thriller: 'Suspense', intriga: 'Suspense',
  'ciencia ficcion': 'Ciencia ficción', 'science fiction': 'Ciencia ficción',
  'sci fi': 'Ciencia ficción', 'sci-fi': 'Ciencia ficción',
  fantasia: 'Fantasía', fantasy: 'Fantasía',
  documental: 'Documental', documentary: 'Documental',
  musical: 'Musical', music: 'Musical', musica: 'Musical',
  romance: 'Romance', romantica: 'Romance',
  crimen: 'Crimen', crime: 'Crimen', policiaca: 'Crimen',
  misterio: 'Misterio', mystery: 'Misterio',
  belico: 'Bélico', war: 'Bélico',
  historica: 'Histórica', historia: 'Histórica', history: 'Histórica',
  infantil: 'Infantil', familia: 'Infantil', family: 'Infantil',
  western: 'Western',
  opera: 'Ópera',
  biografia: 'Biografía', biography: 'Biografía',
  deporte: 'Deporte', sport: 'Deporte',
  concierto: 'Concierto', conciertos: 'Concierto',
  anime: 'Anime',
};

export function normalizaGenero(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) return null;
  const clave = bruto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (GENEROS[clave]) return GENEROS[clave];
  // Sin equivalencia conocida: al menos unificamos mayúsculas para que
  // "TERROR" y "Terror" no se dupliquen.
  return bruto.charAt(0).toUpperCase() + bruto.slice(1).toLowerCase();
}

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
