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
import { variantesDeTitulo, pareceElMismo } from '@/lib/ratings/match.js';

export const runtime = 'nodejs';

// Limpia el título para la búsqueda: elimina año entre paréntesis, etc.
function cleanTitle(title) {
  return String(title || '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// TMDB: buscar película por título → devuelve el primer resultado
// Construye headers/URL para TMDB según el tipo de credencial:
// - JWT (TMDB_READ_TOKEN): Authorization: Bearer <token>
// - API key v3 (TMDB_API_KEY): ?api_key=<key> en la URL
function tmdbFetchOpts(baseUrl, auth) {
  const isJwt = auth.startsWith('eyJ');
  return {
    url: isJwt ? baseUrl : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}api_key=${auth}`,
    headers: isJwt ? { Authorization: `Bearer ${auth}` } : {},
  };
}

async function tmdbSearch(title, auth) {
  const base = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&language=es-ES&page=1&include_adult=false`;
  const { url, headers } = tmdbFetchOpts(base, auth);
  try {
    const res = await fetch(url, {
      headers,
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const resultados = data.results ?? [];
    if (!resultados.length) return null;

    // No aceptamos a ciegas el primer resultado: TMDB devuelve algo para casi
    // cualquier cosa y así es como una película acaba con la nota de otra.
    const bueno = resultados.find(
      (m) => pareceElMismo(title, m.title) || pareceElMismo(title, m.original_title)
    );
    if (!bueno?.id) return null;

    return {
      id: bueno.id,
      title: bueno.title,
      originalTitle: bueno.original_title,
      year: (bueno.release_date || '').slice(0, 4) || null,
      voteAverage: bueno.vote_average > 0 ? bueno.vote_average : null,
      voteCount: bueno.vote_count ?? 0,
    };
  } catch { return null; }
}

// Prueba las variantes del título de la más fiel a la más agresiva y se queda
// con la primera que da un resultado creíble.
async function buscarPelicula(titulo, auth) {
  for (const variante of variantesDeTitulo(titulo)) {
    const hallazgo = await tmdbSearch(variante, auth);
    if (hallazgo) return { ...hallazgo, consulta: variante };
  }
  return null;
}

// TMDB: detalles de película → imdb_id + géneros en español
async function tmdbDetails(id, auth) {
  const base = `https://api.themoviedb.org/3/movie/${id}?language=es-ES`;
  const { url, headers } = tmdbFetchOpts(base, auth);
  try {
    const res = await fetch(url, {
      headers,
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
async function omdbByTitle(title, key, year = null) {
  const clean = cleanTitle(title);
  const url = `https://www.omdbapi.com/?t=${encodeURIComponent(clean)}${year ? `&y=${year}` : ''}&apikey=${key}`;
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

// La media solo usa TMDB cuando no hay ninguna nota de las buenas, para que
// una película conocida no vea su media desplazada por el voto de TMDB.
function computeAverage(imdb, rt, mc, tmdb) {
  const scores = [];
  if (imdb)  scores.push(Number(imdb) * 10);
  if (rt)    scores.push(parseInt(rt, 10));
  if (mc)    scores.push(Number(mc));
  if (!scores.length && tmdb) scores.push(Number(tmdb) * 10);
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ratings: {} }); }

  const titles = Array.isArray(body?.titles) ? body.titles.filter(Boolean) : [];
  if (!titles.length) return NextResponse.json({ ratings: {} });

  const tmdbToken = process.env.TMDB_READ_TOKEN;
  const tmdbKey   = process.env.TMDB_API_KEY;
  const omdbKey   = process.env.OMDB_API_KEY;

  // Bearer token preferred; API key as fallback
  const tmdbAuth = tmdbToken || tmdbKey;

  if (!tmdbAuth && !omdbKey) {
    return NextResponse.json({
      ratings: {},
      error: 'Configura TMDB_READ_TOKEN (o TMDB_API_KEY) en las variables de entorno de Vercel.',
    });
  }

  const unique = [...new Set(titles.map(String))];

  const results = await Promise.all(unique.map(async (title) => {
    const clean = cleanTitle(title);

    try {
      let imdb = null, rt = null, mc = null, genre = null, average = null;

      let tmdb = null;

      if (tmdbAuth) {
        // Flujo TMDB (soporta títulos españoles)
        const search = await buscarPelicula(title, tmdbAuth);
        if (search?.id) {
          if (search.voteAverage != null && search.voteCount >= 10) {
            tmdb = search.voteAverage.toFixed(1);
          }

          const details = await tmdbDetails(search.id, tmdbAuth);
          if (details?.genre) genre = details.genre;

          let omdb = null;
          if (omdbKey) {
            if (details?.imdbId) {
              // Mejor ruta: OMDB por ID (100% preciso, no depende del título)
              omdb = await omdbById(details.imdbId, omdbKey);
            }
            // Sin imdb_id nos quedábamos sin consultar OMDB, y con ello sin
            // Rotten Tomatoes ni Metacritic. El título ORIGINAL que nos da
            // TMDB (casi siempre el inglés) es justo lo que OMDB entiende.
            if (!omdb && search.originalTitle) {
              omdb = await omdbByTitle(search.originalTitle, omdbKey, search.year);
            }
          }

          if (omdb) {
            imdb = omdb.imdb;
            rt   = omdb.rt;
            mc   = omdb.metacritic;
            if (omdb.genre) genre = omdb.genre;
          }
        }
      } else if (omdbKey) {
        // Solo OMDB: búsqueda por título (funciona peor con títulos españoles)
        const omdb = await omdbByTitle(clean, omdbKey);
        if (omdb) { imdb = omdb.imdb; rt = omdb.rt; mc = omdb.metacritic; genre = omdb.genre; }
      }

      average = computeAverage(imdb, rt, mc, tmdb);
      if (!imdb && !rt && !mc && !tmdb) return [title, null];

      return [title, { imdb, rt, metacritic: mc, tmdb, average, genre }];
    } catch {
      return [title, null];
    }
  }));

  return NextResponse.json({ ratings: Object.fromEntries(results) });
}
