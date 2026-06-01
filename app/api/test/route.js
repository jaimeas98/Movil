// Endpoint de diagnóstico: prueba si Vercel puede acceder a las webs de los cines.
// Visita /api/test en el navegador para ver los resultados.
export const dynamic = 'force-dynamic';

const TESTS = [
  { label: 'Yelmo Bahía Sur (cartelera)', url: 'https://www.yelmocines.es/cartelera/cadiz/premium-bahia-sur' },
  { label: 'Yelmo Jerez (cartelera)', url: 'https://www.yelmocines.es/cartelera/cadiz/jerez' },
  { label: 'mk2 Cinesur (cartelera)', url: 'https://www.mk2cines.es/es/mk2-cinesur-bahia-de-cadiz/cartelera' },
  { label: 'Arte Siete (subdomain)', url: 'https://bahia.artesiete.es/Cartelera/33' },
  { label: 'Arte Siete (corp)', url: 'https://www.cinesartesiete.com/cartelera/el-puerto' },
  { label: 'Yelmo POST API', url: 'https://www.yelmocines.es/now-playing.aspx/GetNowPlaying', method: 'POST', body: '{"cityKey":"CADIZ"}' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/json,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Referer': 'https://www.google.es/',
};

async function probe(test) {
  const start = Date.now();
  try {
    const opts = {
      method: test.method || 'GET',
      headers: { ...HEADERS, ...(test.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    };
    if (test.body) opts.body = test.body;

    const res = await fetch(test.url, opts);
    const text = await res.text().catch(() => '');
    const ms = Date.now() - start;

    const hasNextData = text.includes('__NEXT_DATA__');
    const hasCities = text.includes('var cities');
    const hasMovies = /pelicula|movie|film|cartelera/i.test(text.slice(0, 5000));
    const preview = text.slice(0, 300).replace(/\s+/g, ' ');

    return {
      label: test.label,
      status: res.status,
      ok: res.ok,
      ms,
      contentType: res.headers.get('content-type') || '',
      bytes: text.length,
      hasNextData,
      hasCities,
      hasMovies,
      preview,
    };
  } catch (e) {
    return { label: test.label, error: String(e), ms: Date.now() - start };
  }
}

export async function GET() {
  const results = await Promise.all(TESTS.map(probe));

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Diagnóstico de cines</title>
  <style>
    body { font-family: sans-serif; padding: 16px; background: #0b0d13; color: #e2e8f0; }
    h1 { font-size: 18px; margin-bottom: 16px; }
    .card { background: #1a1d27; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .label { font-weight: bold; font-size: 14px; margin-bottom: 6px; }
    .ok { color: #34d399; } .fail { color: #f87171; } .warn { color: #fbbf24; }
    .row { font-size: 12px; margin: 2px 0; color: #94a3b8; }
    .preview { font-size: 11px; background: #0b0d13; padding: 6px; border-radius: 4px; margin-top: 6px; word-break: break-all; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>🔍 Diagnóstico de acceso a cines</h1>
  ${results.map((r) => {
    if (r.error) {
      return `<div class="card">
        <div class="label fail">❌ ${r.label}</div>
        <div class="row">Error: ${r.error}</div>
        <div class="row">${r.ms}ms</div>
      </div>`;
    }
    const cls = r.ok ? 'ok' : 'fail';
    const icon = r.ok ? '✅' : '❌';
    return `<div class="card">
      <div class="label ${cls}">${icon} ${r.label} — HTTP ${r.status} (${r.ms}ms)</div>
      <div class="row">Bytes: ${r.bytes} · Content-Type: ${r.contentType}</div>
      <div class="row">__NEXT_DATA__: ${r.hasNextData ? '✅ sí' : '❌ no'} · var cities: ${r.hasCities ? '✅ sí' : '❌ no'} · keywords película: ${r.hasMovies ? '✅ sí' : '❌ no'}</div>
      <div class="preview">${r.preview.replace(/</g, '&lt;')}</div>
    </div>`;
  }).join('')}
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
