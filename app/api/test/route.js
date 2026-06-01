// Diagnóstico v3: estructura completa de respuestas Yelmo y Arte Siete
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

async function postJson(url, body) {
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

export async function GET() {
  const result = {};

  // ── 1. YELMO: respuesta completa para cadiz ──────────────────────────────────
  try {
    const { status, text } = await postJson('https://www.yelmocines.es/now-playing.aspx/GetNowPlaying', { cityKey: 'cadiz' });
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* */ }
    const d = parsed?.d;
    // Mostrar estructura de un cine (Premium Bahía Sur) y primer día completo
    const cinemas = d?.Cinemas || [];
    const bahiaSur = cinemas.find(c => (c.key || c.Key || '').includes('bahia-sur') || (c.name || c.Name || '').toLowerCase().includes('bahia'));
    const areaSur  = cinemas.find(c => (c.key || c.Key || '').includes('area-sur')  || (c.name || c.Name || '').toLowerCase().includes('área'));
    result.yelmo_post = {
      status,
      cinemasCount: cinemas.length,
      cinemaKeys: cinemas.map(c => ({ key: c.key || c.Key, name: c.name || c.Name })),
      bahiaSurKeys: bahiaSur ? Object.keys(bahiaSur) : null,
      bahiaSurDatesKeys: bahiaSur ? Object.keys(bahiaSur.Dates || bahiaSur.dates || {}).slice(0, 7) : null,
      firstDayBahiaSur: bahiaSur
        ? JSON.stringify(Object.values(bahiaSur.Dates || bahiaSur.dates || {})[0]).slice(0, 2000)
        : null,
      areaSurDatesKeys: areaSur ? Object.keys(areaSur.Dates || areaSur.dates || {}).slice(0, 7) : null,
      firstDayAreaSur: areaSur
        ? JSON.stringify(Object.values(areaSur.Dates || areaSur.dates || {})[0]).slice(0, 2000)
        : null,
      rawPreview: text.slice(0, 500),
    };
  } catch (e) { result.yelmo_post = { error: String(e) }; }

  // ── 2. ARTE SIETE: explorar bahia.artesiete.es ──────────────────────────────
  try {
    const { status, text } = await get('https://bahia.artesiete.es/');
    // Buscar URLs internas de cartelera/horarios en el HTML
    const internalLinks = [...new Set((text.match(/href="([^"#]{3,80})"/g) || []).map(m => m.slice(6, -1)).filter(u => !u.startsWith('http') || u.includes('artesiete')))].slice(0, 30);
    const apiCalls = [...new Set((text.match(/(?:url|href|action)\s*[:=]\s*['"]([^'"]{5,80})['"]/g) || []).map(m => m.slice(0, 100)))].slice(0, 20);
    const scripts = (text.match(/<script[^>]*src="([^"]{5,80})"/g) || []).map(m => m.slice(0, 100)).slice(0, 10);
    const formActions = (text.match(/<form[^>]*action="([^"]{3,80})"/g) || []).map(m => m.slice(0, 100));
    // Extractar zona con palabras clave de película/horario
    const idx = text.search(/pelicula|horario|sesion|pase|titulo|cine/i);
    result.artesiete_home = {
      status,
      bytes: text.length,
      internalLinks,
      apiCalls: apiCalls.slice(0, 15),
      scripts,
      formActions,
      movieZonePreview: idx >= 0 ? text.slice(Math.max(0, idx - 100), idx + 600) : null,
      htmlHead: text.slice(0, 800),
    };
  } catch (e) { result.artesiete_home = { error: String(e) }; }

  // ── 3. MK2: ver si hay URL de horarios separada ─────────────────────────────
  try {
    const urls = [
      'https://www.mk2cines.es/es/mk2-cinesur-bahia-de-cadiz/horarios',
      'https://www.mk2cines.es/es/horarios?cine=mk2-cinesur-bahia-de-cadiz',
    ];
    result.mk2_horarios = {};
    for (const u of urls) {
      const { status, text } = await get(u);
      result.mk2_horarios[u] = { status, bytes: text.length, preview: text.slice(0, 400) };
    }
    // Intentar también un enlace de película individual para ver horarios
    const { text: carteleraHtml } = await get('https://www.mk2cines.es/es/mk2-cinesur-bahia-de-cadiz/cartelera');
    const movieLinks = [...carteleraHtml.matchAll(/href="(https:\/\/www\.mk2cines\.es\/es\/[a-z0-9-]+)"/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
    result.mk2_horarios.movieLinks = movieLinks;
    if (movieLinks[0]) {
      const { status, text } = await get(movieLinks[0]);
      const horariosIdx = text.search(/horario|sesion|pase|\d{2}:\d{2}/i);
      result.mk2_horarios.firstMoviePage = {
        url: movieLinks[0], status,
        horarioZone: horariosIdx >= 0 ? text.slice(Math.max(0, horariosIdx - 100), horariosIdx + 1000) : 'NO ENCONTRADO',
      };
    }
  } catch (e) { result.mk2_horarios = { error: String(e) }; }

  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
