// Diagnóstico del emparejado de valoraciones. Enseña la cadena completa para
// un título: qué variantes se prueban, qué devuelve TMDB en cada una, cuál se
// acepta y por qué, y qué contesta OMDB. Sirve para responder "¿por qué esta
// película no tiene nota?" mirando datos en vez de suponiendo.
//
//   GET /api/diag/ratings?t=The Fast %26 The Furious 25 aniversario
//   GET /api/diag/ratings?t=Marsupilami&t=Origen        (varios títulos)

import { NextResponse } from 'next/server';
import { variantesDeTitulo, pareceElMismo } from '@/lib/ratings/match.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tmdbOpts(baseUrl, auth) {
  const isJwt = auth.startsWith('eyJ');
  return {
    url: isJwt ? baseUrl : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}api_key=${auth}`,
    headers: isJwt ? { Authorization: `Bearer ${auth}` } : {},
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const titulos = searchParams.getAll('t').filter(Boolean);
  if (!titulos.length) {
    return NextResponse.json({ error: 'Indica al menos un título: ?t=Nombre de la peli' });
  }

  const auth = process.env.TMDB_READ_TOKEN || process.env.TMDB_API_KEY;
  const omdbKey = process.env.OMDB_API_KEY;
  const informe = {
    generatedAt: new Date().toISOString(),
    claves: { tmdb: !!auth, omdb: !!omdbKey },
    titulos: {},
  };
  if (!auth) return NextResponse.json({ ...informe, error: 'Falta TMDB_READ_TOKEN' });

  for (const titulo of titulos.slice(0, 8)) {
    const paso = { variantes: variantesDeTitulo(titulo), intentos: [], elegida: null };

    for (const variante of paso.variantes) {
      const base = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(variante)}&language=es-ES&page=1&include_adult=false`;
      const { url, headers } = tmdbOpts(base, auth);
      try {
        const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
        const data = res.ok ? await res.json() : null;
        const resultados = (data?.results ?? []).slice(0, 5).map((m) => ({
          title: m.title,
          originalTitle: m.original_title,
          year: (m.release_date || '').slice(0, 4) || null,
          voteAverage: m.vote_average,
          voteCount: m.vote_count,
          // Esto es lo que decide si lo aceptamos o lo descartamos
          casa: pareceElMismo(variante, m.title) || pareceElMismo(variante, m.original_title),
        }));
        paso.intentos.push({ variante, http: res.status, total: data?.total_results ?? 0, resultados });

        const bueno = (data?.results ?? []).find(
          (m) => pareceElMismo(variante, m.title) || pareceElMismo(variante, m.original_title)
        );
        if (bueno) {
          paso.elegida = {
            variante,
            id: bueno.id,
            title: bueno.title,
            originalTitle: bueno.original_title,
            year: (bueno.release_date || '').slice(0, 4) || null,
            voteAverage: bueno.vote_average,
            voteCount: bueno.vote_count,
          };
          break;
        }
      } catch (e) {
        paso.intentos.push({ variante, error: String(e?.message ?? e) });
      }
    }

    if (paso.elegida) {
      const b2 = `https://api.themoviedb.org/3/movie/${paso.elegida.id}?language=es-ES`;
      const { url, headers } = tmdbOpts(b2, auth);
      try {
        const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
        const d = res.ok ? await res.json() : null;
        paso.detalles = { imdbId: d?.imdb_id ?? null, genero: d?.genres?.[0]?.name ?? null };
      } catch (e) {
        paso.detalles = { error: String(e?.message ?? e) };
      }

      if (omdbKey) {
        const consultas = [];
        if (paso.detalles?.imdbId) {
          consultas.push({ via: 'imdbId', url: `https://www.omdbapi.com/?i=${paso.detalles.imdbId}&apikey=${omdbKey}` });
        }
        consultas.push({
          via: 'títuloOriginal',
          url: `https://www.omdbapi.com/?t=${encodeURIComponent(paso.elegida.originalTitle || paso.elegida.title)}${paso.elegida.year ? `&y=${paso.elegida.year}` : ''}&apikey=${omdbKey}`,
        });

        paso.omdb = [];
        for (const c of consultas) {
          try {
            const res = await fetch(c.url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
            const d = await res.json();
            paso.omdb.push({
              via: c.via,
              respuesta: d.Response,
              error: d.Error ?? null,
              title: d.Title ?? null,
              year: d.Year ?? null,
              imdb: d.imdbRating ?? null,
              // Aquí se ve si Rotten Tomatoes simplemente NO existe para esta
              // película, que es distinto de que nosotros no sepamos pedirlo.
              fuentes: d.Ratings ?? [],
              metascore: d.Metascore ?? null,
            });
          } catch (e) {
            paso.omdb.push({ via: c.via, error: String(e?.message ?? e) });
          }
        }
      }
    }

    informe.titulos[titulo] = paso;
  }

  return NextResponse.json(informe, { headers: { 'Cache-Control': 'no-store' } });
}
