// Adaptador de mk2 Cinesur Bahía de Cádiz (antes Cinesur).
//
// La web mk2cines.es carga la cartelera de cada recinto. Igual que con Yelmo,
// dejamos la integración preparada y tolerante a fallos: el agregador hará
// fallback a ejemplo si la llamada real no está confirmada todavía.
//
// NOTA: confirmar el slug/id del recinto y el endpoint exacto en el primer deploy.

import { fetchText } from './http.js';
import { slugify, sortSessions } from '../normalize.js';

const MK2_VENUE_SLUG = {
  'cinesur-bahia-cadiz': 'bahia-de-cadiz-cadiz',
};

export async function fetchMk2(cinemaId, dateStr) {
  const slug = MK2_VENUE_SLUG[cinemaId];
  if (!slug) {
    throw new Error(`Falta el slug de mk2 para ${cinemaId}`);
  }

  // Pendiente de confirmar el endpoint JSON real; de momento se intenta el HTML.
  const url = `https://www.mk2cines.es/es/${slug}?date=${dateStr}`;
  const html = await fetchText(url);

  const movies = parseMk2Html(html);
  if (!movies.length) {
    throw new Error('mk2: no se pudieron extraer películas del HTML (formato por confirmar)');
  }
  return movies;
}

// Parser de marcador de posición. Se afinará con el HTML real tras el deploy.
function parseMk2Html(html) {
  // Intento de localizar un bloque JSON embebido tipo __NEXT_DATA__ o similar.
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];
  try {
    const json = JSON.parse(match[1]);
    const films = json?.props?.pageProps?.movies || [];
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
