// Endpoint batch de valoraciones para una lista de títulos.
//
// POST /api/ratings  body { titles: ["...", "..."] }
// Devuelve { ratings: { "Título": { imdb, rt, metacritic, average, genre } | null } }
//
// Fuentes (en orden de preferencia):
//   1. TMDB  (TMDB_API_KEY)  — cobertura multilingual, imprescindible para títulos
//      en español. Busca por título → obtiene imdb_id del movie details.
//   2. OMDB  (OMDB_API_KEY)  — usando el imdb_id de TMDB, no el título
//      (la búsqueda por título en OMDB falla con títulos españoles).
//      Aporta: imdbRating, Rotten Tomatoes %, Metascore.
//   3. Si solo hay OMDB sin TMDB → búsqueda por título (funciona para
//      películas anglosajones; falla con títulos españoles).
//
// Con solo TMDB_API_KEY se muestra el rating de la comunidad TMDB (0-10).
// Con TMDB + OMDB se muestran IMDb, RT y Metacritic.
//
// Claves necesarias (configurar en Vercel → Settings → Environment Variables):
//   TMDB_API_KEY  → https://www.themoviedb.org/settings/api  (gratis, sin aprobación)
//   OMDB_API_KEY  → https://www.omdbapi.com/apikey.aspx      (gratis, 1000 req/día)
//
// Cache 24h en los fetch externos (revalidate en Next.js).

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Limpia el título para la búsqueda: elimina año entre paréntesis, etc.
function cleanTitle(title) {
  return String(title || '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// TMDB: buscar película por título → devuelve el primer resultado
async function tmdbSearch(title, key) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(title)}&language=es-ES&page=1&include_adult=false`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const movie = data.results?.[0];
    if (!movie?.id) return null;
    return {
      id: movie.id,
      voteAverage: movie.vote_average > 0 ? movie.vote_average : null,
      voteCount: movie.vote_count ?? 0,
    };
  } catch { return null; }
}

// TMDB: detalles de película → imdb_id + géneros en español
async function tmdbDetails(id, key) {
  const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${key}&language=es-ES`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      imdbId: data.imdb_id || null,
      genre: data.genres?.[0]?.name || null,
    };
  } catch { return null; }
}

// OMDB: búsqueda por IMDb ID (muy preciso — sin ambigüedad de título)
async function omdbById(imdbId, key) {
  const url = `https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.Response === 'False') return null;
    const imdb = data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null;
    const rt   = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value ?? null;
    const mc   = data.Metascore && data.Metascore !== 'N/A' ? data.Metascore : null;
    const genre = data.Genre && data.Genre !== 'N/A' ? data.Genre.split(',')[0].trim() : null;
    return { imdb, rt, metacritic: mc, genre };
  } catch { return null; }
}

// OMDB: búsqueda por título (fallback sin TMDB — solo funciona bien con títulos en inglés)
async function omdbByTitle(title, key) {
  const clean = cleanTitle(title);
  const url = `https://www.omdbapi.com/?t=${encodeURIComponent(clean)}&apikey=${key}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.Response === 'False') return null;
    const imdb = data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null;
    const rt   = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value ?? null;
    const mc   = data.Metascore && data.Metascore !== 'N/A' ? data.Metascore : null;
    const genre = data.Genre && data.Genre !== 'N/A' ? data.Genre.split(',')[0].trim() : null;
    return { imdb, rt, metacritic: mc, genre };
  } catch { return null; }
}

function computeAverage(imdb, rt, mc) {
  const scores = [];
  if (imdb)  scores.push(Number(imdb) * 10);
  if (rt)    scores.push(parseInt(rt, 10));
  if (mc)    scores.push(Number(mc));
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ratings: {} }); }

  const titles = Array.isArray(body?.titles) ? body.titles.filter(Boolean) : [];
  if (!titles.length) return NextResponse.json({ ratings: {} });

  const tmdbKey = process.env.TMDB_API_KEY;
  const omdbKey = process.env.OMDB_API_KEY;

  if (!tmdbKey && !omdbKey) {
    return NextResponse.json({
      ratings: {},
      error: 'Configura TMDB_API_KEY (y opcionalmente OMDB_API_KEY) en las variables de entorno de Vercel.',
    });
  }

  const unique = [...new Set(titles.map(String))];

  const results = await Promise.all(unique.map(async (title) => {
    const clean = cleanTitle(title);

    try {
      let imdb = null, rt = null, mc = null, genre = null, average = null;

      if (tmdbKey) {
        // Flujo TMDB (soporta títulos españoles)
        const search = await tmdbSearch(clean, tmdbKey);
        if (search?.id) {
          // Details en paralelo: siempre necesitamos el imdb_id
          const details = await tmdbDetails(search.id, tmdbKey);
          if (details?.genre) genre = details.genre;

          if (details?.imdbId && omdbKey) {
            // Mejor ruta: OMDB por ID (100% preciso, no depende del título)
            const omdb = await omdbById(details.imdbId, omdbKey);
            if (omdb) {
              imdb = omdb.imdb;
              rt   = omdb.rt;
              mc   = omdb.metacritic;
              if (omdb.genre) genre = omdb.genre;
            }
          }

          // Si OMDB no devolvió nada o no hay clave OMDB, usar rating de TMDB
          if (!imdb && search.voteAverage != null) {
            imdb = search.voteAverage.toFixed(1); // TMDB rating (0-10 como IMDb)
          }
        }
      } else if (omdbKey) {
        // Solo OMDB: búsqueda por título (funciona peor con títulos españoles)
        const omdb = await omdbByTitle(clean, omdbKey);
        if (omdb) { imdb = omdb.imdb; rt = omdb.rt; mc = omdb.metacritic; genre = omdb.genre; }
      }

      average = computeAverage(imdb, rt, mc);
      if (!imdb && !rt && !mc) return [title, null];

      return [title, { imdb, rt, metacritic: mc, average, genre }];
    } catch {
      return [title, null];
    }
  }));

  return NextResponse.json({ ratings: Object.fromEntries(results) });
}
