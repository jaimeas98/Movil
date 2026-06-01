// Adaptador de Arte Siete El Puerto (C.C. Vistahermosa).
//
// Cadena pequeña; la web cinesartesiete.com publica la cartelera del recinto.
// Integración preparada y tolerante a fallos con fallback a ejemplo.
//
// NOTA: confirmar endpoint/estructura en el primer deploy con red abierta.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

export async function fetchArteSiete(cinemaId, dateStr) {
  const url = `https://www.cinesartesiete.com/cartelera/el-puerto?date=${dateStr}`;
  const html = await fetchText(url);

  const movies = parseArteSiete(html);
  if (!movies.length) {
    throw new Error('Arte Siete: no se pudieron extraer películas (formato por confirmar)');
  }
  return movies;
}

function parseArteSiete(html) {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];
  try {
    const json = JSON.parse(match[1]);
    const films = json?.props?.pageProps?.movies || json?.props?.pageProps?.billboard || [];
    return films.map((f) => ({
      id: slugify(f.title || f.name || ''),
      title: f.title || f.name || 'Sin título',
      posterUrl: f.poster || f.image || null,
      durationMin: Number(f.duration || f.runtime) || null,
      genre: f.genre || null,
      ageRating: f.rating || null,
      synopsis: f.synopsis || null,
      sessions: sortSessions(
        (f.sessions || []).map((s) => ({
          time: (s.time || '').slice(0, 5),
          format: s.format || '2D',
          language: /vos/i.test(JSON.stringify(s)) ? 'VOSE' : 'VE',
          room: s.room || null,
          buyUrl: s.url || null,
        }))
      ),
    }));
  } catch {
    return [];
  }
}
