// Generador de datos de EJEMPLO, deterministas por (fecha + cine).
// Sirve para que la web siempre se vea perfecta aunque un cine no responda.
// Cuando los adaptadores reales devuelvan datos en vivo, estos se ignoran.

import { slugify, sortSessions } from '../normalize.js';

// Pool de películas de ejemplo (realista). posterUrl se deja null a propósito:
// la tarjeta dibuja un póster generado por CSS, atractivo y que nunca se rompe.
const MOVIE_POOL = [
  { title: 'Dune: Parte Tres', genre: 'Ciencia ficción', durationMin: 166, ageRating: '+12', synopsis: 'Paul Atreides afronta el destino del universo conocido en el desierto de Arrakis.' },
  { title: 'Vengadores: Secret Wars', genre: 'Acción', durationMin: 149, ageRating: '+12', synopsis: 'Los héroes de la Tierra se unen ante una amenaza que cruza el multiverso.' },
  { title: 'Del Revés 3', genre: 'Animación', durationMin: 101, ageRating: 'TP', synopsis: 'Las emociones de Riley vuelven con nuevos retos en la adolescencia.' },
  { title: 'Una Película de Minecraft 2', genre: 'Aventura', durationMin: 110, ageRating: 'TP', synopsis: 'Una nueva aventura por bloques para toda la familia.' },
  { title: 'Wicked: Para Siempre', genre: 'Musical', durationMin: 138, ageRating: 'TP', synopsis: 'El destino de Elphaba y Glinda llega a su conclusión en la tierra de Oz.' },
  { title: 'Gladiator III', genre: 'Histórica', durationMin: 152, ageRating: '+16', synopsis: 'La arena de Roma vuelve a teñirse de honor, sangre y poder.' },
  { title: 'F1: La Película 2', genre: 'Acción', durationMin: 135, ageRating: '+12', synopsis: 'Velocidad, rivalidad y adrenalina en el circuito más exigente.' },
  { title: 'El Conjuro 4', genre: 'Terror', durationMin: 118, ageRating: '+16', synopsis: 'Los Warren investigan su caso más oscuro hasta la fecha.' },
  { title: 'Padre No Hay Más Que Uno 4', genre: 'Comedia', durationMin: 99, ageRating: 'TP', synopsis: 'La familia más numerosa del cine español vuelve con nuevos líos.' },
  { title: 'Sonic 4', genre: 'Aventura', durationMin: 112, ageRating: 'TP', synopsis: 'Sonic y sus amigos corren contra un nuevo enemigo a toda velocidad.' },
  { title: 'Misión Imposible: El Capítulo Final', genre: 'Acción', durationMin: 158, ageRating: '+12', synopsis: 'Ethan Hunt afronta la misión definitiva de su carrera.' },
  { title: 'Cómo Entrenar a tu Dragón', genre: 'Fantasía', durationMin: 125, ageRating: 'TP', synopsis: 'Hipo y Desdentao regresan en una emocionante aventura de acción real.' },
  { title: 'Superman: Legado', genre: 'Acción', durationMin: 141, ageRating: '+12', synopsis: 'Un nuevo comienzo para el hombre de acero y el universo DC.' },
  { title: 'La Sustancia 2', genre: 'Thriller', durationMin: 124, ageRating: '+18', synopsis: 'El precio de la belleza eterna alcanza un nuevo y perturbador límite.' },
  { title: 'Buscando a Frodo', genre: 'Drama', durationMin: 108, ageRating: '+7', synopsis: 'Una historia íntima sobre la amistad y los recuerdos compartidos.' },
  { title: 'Garfield 2', genre: 'Animación', durationMin: 95, ageRating: 'TP', synopsis: 'El gato más perezoso del mundo se mete en otro embrollo glotón.' },
];

const FORMATS = ['2D', '2D', '2D', '3D'];
const LANGUAGES = ['VE', 'VE', 'VE', 'VOSE'];
const TIME_SLOTS = ['12:00', '15:45', '16:30', '17:15', '18:00', '19:00', '19:45', '20:30', '21:15', '22:00', '22:45', '23:30'];

// PRNG determinista (mulberry32) para que cada día/cine tenga una cartelera estable.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Devuelve una cartelera de ejemplo (lista de películas con sesiones) para un cine y fecha.
export function buildSampleMovies(cinemaId, dateStr) {
  const rng = mulberry32(hashString(`${cinemaId}|${dateStr}`));
  const count = 6 + Math.floor(rng() * 4); // entre 6 y 9 películas

  // Barajamos el pool de forma determinista.
  const pool = [...MOVIE_POOL].sort(() => rng() - 0.5).slice(0, count);

  return pool.map((m) => {
    const numSessions = 3 + Math.floor(rng() * 4); // 3-6 sesiones
    const usedTimes = new Set();
    const sessions = [];
    for (let i = 0; i < numSessions; i++) {
      let time = pick(rng, TIME_SLOTS);
      let guard = 0;
      while (usedTimes.has(time) && guard < 8) {
        time = pick(rng, TIME_SLOTS);
        guard++;
      }
      usedTimes.add(time);
      sessions.push({
        time,
        format: pick(rng, FORMATS),
        language: pick(rng, LANGUAGES),
        room: `Sala ${1 + Math.floor(rng() * 10)}`,
        buyUrl: null,
      });
    }
    return {
      id: slugify(m.title),
      title: m.title,
      posterUrl: null,
      durationMin: m.durationMin,
      genre: m.genre,
      ageRating: m.ageRating,
      synopsis: m.synopsis,
      rating: null,
      sessions: sortSessions(sessions),
    };
  });
}

// Mapa { 'YYYY-MM-DD': [películas] } de ejemplo para un rango de fechas.
export function buildSampleByDate(cinemaId, isoDates) {
  const byDate = {};
  for (const iso of isoDates) {
    byDate[iso] = buildSampleMovies(cinemaId, iso);
  }
  return byDate;
}
