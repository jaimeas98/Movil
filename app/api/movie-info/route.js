import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');
  if (!title) return NextResponse.json({ error: 'title requerido' }, { status: 400 });

  const key = process.env.OMDB_API_KEY;
  if (!key) return NextResponse.json({ ratings: null, error: 'sin clave OMDB' }, { status: 200 });

  const clean = title.replace(/\(.*?\)/g, '').trim();
  const url = `https://www.omdbapi.com/?t=${encodeURIComponent(clean)}&apikey=${key}`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
    const data = await res.json();
    if (data.Response === 'False') {
      return NextResponse.json({ ratings: null }, { status: 200 });
    }

    const rtCritic = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes');
    const ratings = {
      imdb: data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null,
      rt: rtCritic ? rtCritic.Value : null,          // e.g. "85%"
      metacritic: data.Metascore && data.Metascore !== 'N/A' ? data.Metascore : null,
    };

    return NextResponse.json({ ratings });
  } catch {
    return NextResponse.json({ ratings: null }, { status: 200 });
  }
}
