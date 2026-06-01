// Endpoint de diagnóstico v2: extrae var cities de Yelmo y estructura de mk2.
export const dynamic = 'force-dynamic';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/json,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Referer': 'https://www.google.es/',
};

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000), cache: 'no-store' });
  const text = await res.text().catch(() => '');
  return { status: res.status, text };
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, text };
}

// Extrae var cities=... del HTML de Yelmo
function extractCities(html) {
  const m = html.match(/var\s+cities\s*=\s*(\[[\s\S]{0,8000}?\])\s*[,;]/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return m[1].slice(0, 2000); }
}

// Intenta encontrar el bloque principal de datos en el HTML de mk2
function analyzeMk2(html) {
  const results = [];
  // Buscar scripts con JSON
  const scriptMatches = [...html.matchAll(/<script[^>]*>([\s\S]{50,}?)<\/script>/gi)];
  for (const m of scriptMatches.slice(0, 10)) {
    const content = m[1].trim();
    if (content.includes('pelicula') || content.includes('movie') || content.includes('Titulo') || content.includes('horario')) {
      results.push({ type: 'script-con-datos', preview: content.slice(0, 500) });
    }
  }
  // Buscar patrones de API
  const apiMatches = html.match(/['"`](\/api\/[^'"`\s]{3,60})['"`]/g) || [];
  results.push({ type: 'api-endpoints-encontrados', endpoints: [...new Set(apiMatches)].slice(0, 20) });
  // Buscar variables JS con datos de películas
  const varMatches = html.match(/var\s+(\w+)\s*=\s*\[[\s\S]{20,}/g) || [];
  results.push({ type: 'variables-js', vars: varMatches.map(v => v.slice(0, 200)) });
  // Snippet de la zona central del HTML (donde suelen estar los datos)
  results.push({ type: 'html-zona-central', snippet: html.slice(html.length / 2 - 500, html.length / 2 + 500) });
  return results;
}

export async function GET(req) {
  const url = new URL(req.url);
  const section = url.searchParams.get('s') || 'all';
  const sections = {};

  // ── YELMO BAHÍA SUR ─────────────────────────────────────────────────────────
  if (section === 'all' || section === 'yelmo') {
    const { status: s1, text: h1 } = await get('https://www.yelmocines.es/cartelera/cadiz/premium-bahia-sur');
    const cities1 = extractCities(h1);
    sections.yelmo_bahia_sur = { status: s1, cities: cities1, htmlPreview: h1.slice(0, 500) };

    const { status: s2, text: h2 } = await get('https://www.yelmocines.es/cartelera/cadiz/jerez');
    const cities2 = extractCities(h2);
    sections.yelmo_jerez = { status: s2, cities: cities2, htmlPreview: h2.slice(0, 500) };
  }

  // ── MK2 ────────────────────────────────────────────────────────────────────
  if (section === 'all' || section === 'mk2') {
    const { status: sm, text: hm } = await get('https://www.mk2cines.es/es/mk2-cinesur-bahia-de-cadiz/cartelera');
    sections.mk2 = { status: sm, analysis: analyzeMk2(hm), htmlSlice1: hm.slice(0, 1000), htmlSlice2: hm.slice(60000, 61000) };
  }

  // ── ARTE SIETE - BUSCAR URL CORRECTA ────────────────────────────────────────
  if (section === 'all' || section === 'artesiete') {
    const artUrls = [
      'https://bahia.artesiete.es/',
      'https://bahia.artesiete.es/Cartelera',
      'https://bahia.artesiete.es/Peliculas',
      'https://www.cinesartesiete.com/',
      'https://www.cinesartesiete.com/el-puerto-de-santa-maria',
    ];
    sections.artesiete = {};
    for (const u of artUrls) {
      try {
        const { status, text } = await get(u);
        const hasMovies = /pelicula|movie|cartel|horario|sesion/i.test(text.slice(0, 5000));
        sections.artesiete[u] = { status, bytes: text.length, hasMovies, preview: text.slice(0, 300) };
      } catch (e) {
        sections.artesiete[u] = { error: String(e) };
      }
    }
  }

  // ── YELMO POST CON CLAVES CANDIDATAS ────────────────────────────────────────
  if (section === 'all' || section === 'yelmo-post') {
    const keys = ['CADIZ', 'cadiz', 'SAN_FERNANDO', 'sanfernando', 'BAHIA_SUR', 'JEREZ', 'jerez'];
    sections.yelmo_post_keys = {};
    for (const key of keys) {
      const { status, text } = await post('https://www.yelmocines.es/now-playing.aspx/GetNowPlaying', { cityKey: key });
      try {
        const json = JSON.parse(text);
        const cinemas = json?.d?.Cinemas || [];
        const dates = json?.d?.Dates || {};
        sections.yelmo_post_keys[key] = { status, cinemasCount: cinemas.length, datesKeys: Object.keys(dates).slice(0, 5), cinemaNames: cinemas.map(c => c.Name || c.name).slice(0, 5) };
      } catch {
        sections.yelmo_post_keys[key] = { status, raw: text.slice(0, 200) };
      }
    }
  }

  return Response.json(sections, { headers: { 'Cache-Control': 'no-store' } });
}
