// Diagnóstico v4: Arte Siete HTML completo alrededor de películas + mk2 página película
export const dynamic = 'force-dynamic';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/json,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Referer': 'https://www.google.es/',
};

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const text = await res.text().catch(() => '');
  return { status: res.status, text };
}

export async function GET() {
  const result = {};

  // ── ARTE SIETE: buscar estructura de películas en el HTML ──────────────────
  try {
    const { status, text } = await get('https://bahia.artesiete.es/');

    // Encontrar todos los bloques con datos de película (wire: data, JSON embebido, etc.)
    const wireMatches = (text.match(/wire:initial-data="([^"]{20,}?)"/g) || []).map(m => {
      try { return JSON.parse(m.slice(20, -1).replace(/&quot;/g, '"')); } catch { return m.slice(0, 200); }
    }).slice(0, 5);

    // Buscar bloques JSON en scripts
    const jsonScripts = [];
    for (const m of text.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const j = JSON.parse(m[1]);
        jsonScripts.push(JSON.stringify(j).slice(0, 500));
      } catch { jsonScripts.push(m[1].slice(0, 200)); }
    }

    // Buscar apariciones de palabras clave de sesión
    const keywords = ['Titulo', 'titulo', 'Pelicula', 'pelicula', 'Horario', 'horario', 'Sesion', 'sesion', 'pase', 'poster', 'Poster'];
    const snippets = [];
    for (const kw of keywords) {
      const idx = text.indexOf(kw);
      if (idx >= 0) {
        snippets.push({ keyword: kw, context: text.slice(Math.max(0, idx - 50), idx + 400) });
        break; // sólo el primero interesante
      }
    }

    // Slices del HTML en distintas zonas
    const zones = [
      text.slice(0, 600),
      text.slice(20000, 21000),
      text.slice(50000, 51500),
      text.slice(100000, 101500),
      text.slice(150000, text.length),
    ];

    result.artesiete = { status, bytes: text.length, wireMatches, jsonScripts, snippets, zones };
  } catch (e) { result.artesiete = { error: String(e) }; }

  // ── MK2: extraer links de películas reales y ver página de una película ─────
  try {
    const { text: cartHtml } = await get('https://www.mk2cines.es/es/mk2-cinesur-bahia-de-cadiz/cartelera');

    // Extraer links únicos de películas (excluir páginas genéricas)
    const GENERIC = new Set(['aviso-privacidad','cartelera','vose','contacto','tarjeta-mk2','eventos-sesiones-exclusivas','eventos-ciclos-exclusivos','eventos-cine-junior','eventos-estrenos','cumpl','horarios','mk2-cinesur-bahia-de-cadiz']);
    const allLinks = [...cartHtml.matchAll(/href="(https:\/\/www\.mk2cines\.es\/es\/[a-z0-9-]+[0-9])"/g)].map(m => m[1]);
    const movieLinks = [...new Set(allLinks)].filter(u => {
      const slug = u.split('/es/')[1] || '';
      return !GENERIC.has(slug) && slug.length > 3;
    });

    // Extraer también info básica del cartel: titulo, duración, poster
    const filmItems = [];
    for (const m of cartHtml.matchAll(/class="film-list-item"[\s\S]{0,2000}?(?=class="film-list-item"|$)/g)) {
      const block = m[0];
      const titleM = block.match(/film-list-title[^>]*>[\s\S]*?href="([^"]+)"[^>]*>([^<]+)/);
      const durationM = block.match(/(\d+)\s*minutos/i);
      const posterM = block.match(/src="(fr-216x326-data[^"]+)"/);
      if (titleM) {
        filmItems.push({
          url: titleM[1],
          title: titleM[2].trim(),
          duration: durationM ? durationM[1] : null,
          poster: posterM ? 'https://www.mk2cines.es/' + posterM[1] : null,
        });
      }
    }

    result.mk2_cartelera = { movieLinkCount: movieLinks.length, movieLinks: movieLinks.slice(0, 5), filmItems: filmItems.slice(0, 6) };

    // Visitar la primera película real para ver estructura de horarios
    if (movieLinks[0]) {
      const { status, text: movieHtml } = await get(movieLinks[0]);
      // Buscar zona de horarios
      const hIdx = movieHtml.search(/id="horarios"|class="horarios|Pases|HORARIOS|pases-dia|showtimes/i);
      // Buscar patrón HH:MM (horas)
      const timesZone = movieHtml.slice(Math.max(0, hIdx - 200), hIdx + 3000);
      // También buscar si aparece el nombre del cine Bahía de Cádiz
      const bahiaIdx = movieHtml.search(/bahia.de.cadiz|cinesur|bahía de cádiz/i);
      result.mk2_pelicula = {
        url: movieLinks[0],
        status,
        hIdx,
        timesZone: timesZone.slice(0, 2000),
        bahiaIdx,
        bahiaContext: bahiaIdx >= 0 ? movieHtml.slice(Math.max(0, bahiaIdx - 100), bahiaIdx + 1000) : 'NO ENCONTRADO',
        formActions: (movieHtml.match(/<form[^>]*action="([^"]{3,80})"/g) || []).slice(0, 5),
        ajaxUrls: [...new Set((movieHtml.match(/url\s*:\s*['"]([^'"]{5,80})['"]/g) || []).map(m => m))].slice(0, 10),
      };
    }
  } catch (e) { result.mk2_cartelera = { error: String(e) }; }

  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
