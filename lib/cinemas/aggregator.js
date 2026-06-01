// Orquestador: para una fecha dada, obtiene la cartelera de los 4 cines.
// Cada cine se intenta en vivo con su adaptador; si falla, se usan datos de
// ejemplo deterministas para ese cine. La web nunca se queda vacía.

import { CINEMAS } from './config.js';
import { mergeMoviesByTitle } from '../normalize.js';
import { buildSampleMovies } from './sample.js';
import { fetchYelmo } from './yelmo.js';
import { fetchMk2 } from './mk2.js';
import { fetchArteSiete } from './artesiete.js';

// Asocia cada cine con su función de obtención en vivo.
const LIVE_FETCHERS = {
  'cinesur-bahia-cadiz': fetchMk2,
  'yelmo-bahia-sur': fetchYelmo,
  'yelmo-jerez': fetchYelmo,
  'arte-siete-puerto': fetchArteSiete,
};

async function getCinemaMovies(cinemaId, dateStr) {
  const fetcher = LIVE_FETCHERS[cinemaId];
  try {
    const movies = await fetcher(cinemaId, dateStr);
    if (movies && movies.length) {
      return { source: 'live', movies: mergeMoviesByTitle(movies) };
    }
    throw new Error('respuesta vacía');
  } catch (err) {
    // Fallback transparente a datos de ejemplo para este cine.
    return {
      source: 'sample',
      reason: String(err && err.message ? err.message : err),
      movies: buildSampleMovies(cinemaId, dateStr),
    };
  }
}

export async function getShowtimes(dateStr) {
  const results = await Promise.all(
    CINEMAS.map(async (cinema) => {
      const { source, movies, reason } = await getCinemaMovies(cinema.id, dateStr);
      return {
        id: cinema.id,
        name: cinema.name,
        short: cinema.short,
        city: cinema.city,
        venue: cinema.venue,
        color: cinema.color,
        website: cinema.website,
        source,
        reason: reason || null,
        movies,
      };
    })
  );

  const anyLive = results.some((c) => c.source === 'live');

  return {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    mode: anyLive ? 'mixed' : 'sample', // 'sample' = ningún cine respondió en vivo
    cinemas: results,
  };
}
