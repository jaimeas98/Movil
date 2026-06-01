// Diagnóstico v6: Arte Siete - buscar API de Livewire y estructura de datos
export const dynamic = 'force-dynamic';

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/json,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Referer': 'https://www.google.es/',
};

async function get(url, extraHeaders = {}) {
  const res = await fetch(url, { headers: { ...H, ...extraHeaders }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const text = await res.text().catch(() => '');
  return { status: res.status, text, headers: Object.fromEntries(res.headers.entries()) };
}

async function post(url, body, extraHeaders = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json', 'X-Livewire': 'true', ...extraHeaders },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, text };
}

export async function GET() {
  const result = {};
  const today = new Date().toISOString().slice(0, 10);

  // ── Arte Siete: analizar página del cine para extraer componentes Livewire ──
  try {
    const { text: cineHtml, status: s1 } = await get('https://bahia.artesiete.es/Cine/33/Artesiete-Bahia');

    // Extraer estado inicial de componentes Livewire (está en JSON embebido)
    const livewireData = [];
    for (const m of cineHtml.matchAll(/wire:initial-data="([^"]+)"/g)) {
      try {
        const decoded = m[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
        livewireData.push(JSON.parse(decoded));
      } catch { livewireData.push({ raw: m[1].slice(0, 200) }); }
    }

    // Buscar token CSRF y Livewire token
    const csrfM = cineHtml.match(/csrf[_-]token["\s:=]+["']([a-zA-Z0-9+/=]{20,})/i);
    const lvTokenM = cineHtml.match(/livewire[^{]*fingerprint[^{]*{[^}]*token[^}]*}/i);
    const allScriptUrls = (cineHtml.match(/src="([^"]*\.js[^"]*)"/g) || []).map(m => m.slice(5, -1)).slice(0, 15);

    result.artesiete_cine = {
      status: s1,
      bytes: cineHtml.length,
      csrfToken: csrfM ? csrfM[1].slice(0, 40) : null,
      livewireComponentCount: livewireData.length,
      livewireData: livewireData.slice(0, 5),
      scriptUrls: allScriptUrls,
      // Buscar IDs de películas en el HTML
      peliculaIds: (cineHtml.match(/id_pelicula["\s:=]+["']?(\d+)/gi) || []).slice(0, 10),
      sesionIds: (cineHtml.match(/id_sesion["\s:=]+["']?(\d+)/gi) || []).slice(0, 10),
      // Horarios en formato HH:MM
      timePattern: (cineHtml.match(/\b\d{2}:\d{2}\b/g) || []).slice(0, 30),
      // Buscar wire:model y wire:click para entender qué hace Livewire
      wireModels: (cineHtml.match(/wire:[a-z]+="[^"]+"/g) || []).slice(0, 30),
      // Zonas clave del HTML
      zone0: cineHtml.slice(0, 2000),
      zone10k: cineHtml.slice(10000, 13000),
      zone20k: cineHtml.slice(20000, 23000),
      zone30k: cineHtml.slice(30000, 33000),
    };
  } catch(e) { result.artesiete_cine = { error: String(e) }; }

  // ── Arte Siete: probar página de cartelera directamente ─────────────────────
  try {
    const urls = [
      `https://bahia.artesiete.es/Cartelera`,
      `https://bahia.artesiete.es/`,
      `https://bahia.artesiete.es/api/cartelera`,
      `https://bahia.artesiete.es/api/sesiones`,
    ];
    result.artesiete_urls = {};
    for (const url of urls) {
      try {
        const { status, text } = await get(url);
        result.artesiete_urls[url] = {
          status,
          bytes: text.length,
          preview: text.slice(0, 300),
          timePattern: (text.match(/\b\d{2}:\d{2}\b/g) || []).slice(0, 10),
        };
      } catch(e) {
        result.artesiete_urls[url] = { error: String(e) };
      }
    }
  } catch(e) { result.artesiete_urls = { error: String(e) }; }

  // ── Arte Siete: probar endpoint Livewire /livewire/message ──────────────────
  try {
    // Obtener CSRF token primero
    const { text: homeHtml } = await get('https://bahia.artesiete.es/');
    const csrfM = homeHtml.match(/name="csrf-token"\s+content="([^"]+)"/);
    const csrf = csrfM ? csrfM[1] : '';

    const { status: lvStatus, text: lvText } = await post(
      'https://bahia.artesiete.es/livewire/message/cartelera',
      { fingerprint: {}, serverMemo: {}, updates: [] },
      { 'X-CSRF-TOKEN': csrf, 'X-Livewire': '1' }
    );
    result.artesiete_livewire_msg = {
      status: lvStatus,
      preview: lvText.slice(0, 500),
    };
  } catch(e) { result.artesiete_livewire_msg = { error: String(e) }; }

  // ── Arte Siete home: buscar rutas de API en el JS ───────────────────────────
  try {
    const { text: homeHtml } = await get('https://bahia.artesiete.es/');

    // Buscar todas las rutas de API en scripts inline
    const apiRoutes = [...new Set([
      ...(homeHtml.match(/['"`](\/(?:api|livewire|sesion|horario|cartelera|pelicula)[^'"`\s<]{0,100})['"`]/g) || []),
    ])].map(m => m.slice(1, -1)).slice(0, 30);

    // Buscar URLs absolutas de la misma web
    const absUrls = [...new Set(
      (homeHtml.match(/https?:\/\/(?:bahia\.artesiete\.es|cinesartesiete\.com)[^"'\s<]{0,100}/g) || [])
    )].slice(0, 20);

    // Buscar JSON con estructura de películas/sesiones
    const jsonBlocks = [];
    for (const m of homeHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
      const s = m[1].trim();
      if (s.length > 100 && (s.includes('pelicula') || s.includes('sesion') || s.includes('horario') || s.includes('Titulo'))) {
        jsonBlocks.push(s.slice(0, 500));
      }
    }

    result.artesiete_home_api = {
      bytes: homeHtml.length,
      apiRoutes,
      absUrls,
      jsonBlocks: jsonBlocks.slice(0, 5),
      livewireComponents: (homeHtml.match(/livewire:name="([^"]+)"/g) || []).slice(0, 10),
      // Buscar window. variables con datos
      windowVars: (homeHtml.match(/window\.[a-zA-Z_][a-zA-Z0-9_]*\s*=/g) || []).slice(0, 20),
    };
  } catch(e) { result.artesiete_home_api = { error: String(e) }; }

  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
