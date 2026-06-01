// Diagnóstico v5: buscar sesiones en mk2 y Arte Siete (zonas específicas)
export const dynamic = 'force-dynamic';

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/json,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Referer': 'https://www.google.es/',
};

async function get(url) {
  const res = await fetch(url, { headers: H, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const text = await res.text().catch(() => '');
  return { status: res.status, text };
}

export async function GET() {
  const result = {};

  // ── MK2: buscar sesiones en página de película y en la cartelera ──────────
  try {
    // 1. Página de película individual: zonas 15000-35000 donde estarían los horarios
    const { text: movieHtml } = await get('https://www.mk2cines.es/es/toy-story-5');
    result.mk2_movie_zones = {
      bytes: movieHtml.length,
      zone15k: movieHtml.slice(15000, 17000),
      zone20k: movieHtml.slice(20000, 22000),
      zone25k: movieHtml.slice(25000, 27000),
      zone30k: movieHtml.slice(30000, 32000),
      // Buscar data-ho (clave de sesiones en mk2)
      dataHoMatches: (movieHtml.match(/data-ho="([^"]+)"/g) || []).slice(0, 20),
      metricaLinks: (movieHtml.match(/<a[^>]+metrica[^>]+>[^<]*<\/a>/g) || []).slice(0, 15),
      // Buscar hora en formato HH:MM
      timePattern: (movieHtml.match(/\b\d{2}:\d{2}\b/g) || []).slice(0, 20),
      // Buscar mk2-cinesur-bahia o similar
      bahiaMatches: (movieHtml.match(/.{0,100}(?:bahia|cinesur|mk2.cinesur).{0,200}/gi) || []).slice(0, 5),
    };

    // 2. Cartelera: zonas finales donde podrían estar sesiones
    const { text: cartHtml } = await get('https://www.mk2cines.es/es/mk2-cinesur-bahia-de-cadiz/cartelera');
    result.mk2_cartelera_end = {
      zone80k: cartHtml.slice(80000, 82000),
      zone100k: cartHtml.slice(100000, 102000),
      zone110k: cartHtml.slice(110000, 112000),
      zone120k: cartHtml.slice(120000, cartHtml.length),
      dataHoMatches: (cartHtml.match(/data-ho="([^"]+)"/g) || []).slice(0, 20),
      timePattern: (cartHtml.match(/\b\d{2}:\d{2}\b/g) || []).slice(0, 30),
    };
  } catch (e) { result.mk2 = { error: String(e) }; }

  // ── ARTE SIETE: página de cine específico + zonas del home ─────────────────
  try {
    // 1. Página específica del cine Bahía (ID 33)
    const { status: s1, text: cineHtml } = await get('https://bahia.artesiete.es/Cine/33/Artesiete-Bahia');
    result.artesiete_cine33 = {
      status: s1,
      bytes: cineHtml.length,
      zone0: cineHtml.slice(0, 600),
      zone5k: cineHtml.slice(5000, 7000),
      zone15k: cineHtml.slice(15000, 17000),
      zone25k: cineHtml.slice(25000, 27000),
      timePattern: (cineHtml.match(/\b\d{2}:\d{2}\b/g) || []).slice(0, 30),
      dataHoMatches: (cineHtml.match(/data-ho="([^"]+)"/g) || []).slice(0, 20),
      // Buscar URLs de API internas en el JS
      apiUrls: [...new Set((cineHtml.match(/['"`](\/(?:api|sesiones|horarios|cartelera|Sesiones|Horarios)[^'"`\s]{0,80})['"`]/g) || []).map(m => m.slice(1, -1)))].slice(0, 20),
    };

    // 2. Zonas medias del home (60k-100k) que no hemos visto
    const { text: homeHtml } = await get('https://bahia.artesiete.es/');
    result.artesiete_home_zones = {
      zone60k: homeHtml.slice(60000, 62000),
      zone70k: homeHtml.slice(70000, 72000),
      zone80k: homeHtml.slice(80000, 82000),
      zone90k: homeHtml.slice(90000, 92000),
      zone100k: homeHtml.slice(100000, 102000),
      timePattern: (homeHtml.match(/\b\d{2}:\d{2}\b/g) || []).slice(0, 30),
      // Buscar JSON con ID_Centro 33 (el cine Bahía)
      centro33: (homeHtml.match(/.{0,20}ID_Centro.{0,5}33.{0,500}/g) || []).slice(0, 5),
      // Buscar Livewire component names
      livewireComponents: (homeHtml.match(/livewire:name="([^"]+)"/g) || []).slice(0, 10),
    };

    // 3. Probar URL con fecha
    const today = new Date().toISOString().slice(0, 10);
    const { status: s3, text: t3 } = await get(`https://bahia.artesiete.es/Cine/33/Artesiete-Bahia?fecha=${today}`);
    result.artesiete_cine33_fecha = {
      status: s3,
      bytes: t3.length,
      preview: t3.slice(0, 500),
      timePattern: (t3.match(/\b\d{2}:\d{2}\b/g) || []).slice(0, 20),
    };
  } catch (e) { result.artesiete = { error: String(e) }; }

  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
