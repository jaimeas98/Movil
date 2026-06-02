// Endpoint batch de valoraciones (OMDB) para una lista de títulos.
//
// POST /api/ratings  body { titles: ["...", "..."] }
// Devuelve { ratings: { "title": { imdb, rt, metacritic, average, genre } | null } }
//
// - imdb       → string "X.Y" sobre 10  (o null)
// - rt         → string "X%"            (o null)
// - metacritic → string "X" sobre 100   (o null)
// - average    → entero 0-100, promedio normalizado de las tres anteriores
// - genre      → string (ej. "Animation, Adventure") — útil para mk2, que no
//                expone el género en su HTML; el cliente toma el primer
//                género si la película no trae uno propio.
//
// Cache 24h en el fetch a OMDB (revalidate en Next.js) para no agotar la cuota.
// La cuota gratuita es de 1000 req/día.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ratings: {} }); }
  const titles = Array.isArray(body?.titles) ? body.titles.filter(Boolean) : [];
  if (!titles.length) return NextResponse.json({ ratings: {} });

  const key = process.env.OMDB_API_KEY;
  if (!key) return NextResponse.json({ ratings: {}, error: 'sin clave OMDB' });

  // Normalizamos para no pedir el mismo título dos veces (la cartelera junta
  // mismas películas en varios cines).
  const unique = [...new Set(titles.map(String))];

  const results = await Promise.all(unique.map(async (title) => {
    const clean = title.replace(/\(.*?\)/g, '').trim();
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(clean)}&apikey=${key}`;
    try {
      const res = await fetch(url, { next: { revalidate: 86400 } });
      const data = await res.json();
      if (data.Response === 'False') return [title, null];

      const imdb = data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null;
      const rtRating = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value ?? null;
      const mc = data.Metascore && data.Metascore !== 'N/A' ? data.Metascore : null;

      // Promedio 0-100 (cada fuente normalizada).
      const scores = [];
      if (imdb) scores.push(Number(imdb) * 10);
      if (rtRating) scores.push(parseInt(rtRating, 10));
      if (mc) scores.push(Number(mc));
      const average = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

      return [title, {
        imdb,
        rt: rtRating,
        metacritic: mc,
        average,
        genre: data.Genre && data.Genre !== 'N/A' ? data.Genre : null,
      }];
    } catch {
      return [title, null];
    }
  }));

  return NextResponse.json({ ratings: Object.fromEntries(results) });
}
