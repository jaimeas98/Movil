// Diagnóstico v8: ver hrefs reales de sesiones mk2 para filtrar por fecha
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
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  result.today = today;

  // ── mk2: ver estructura real de sesiones en páginas de película ─────────────
  // Probamos con "el-drama" (5 sesiones según usuario) y "toy-story-5"
  for (const slug of ['el-drama', 'toy-story-5']) {
    try {
      const { text: html } = await get(`https://www.mk2cines.es/es/${slug}`);

      // Todos los hrefs con cinesur-bahia-de-cadiz (URL COMPLETA con query params)
      const hrefs = [];
      for (const m of html.matchAll(/<a[^>]+href="([^"]*cinesur-bahia-de-cadiz[^"]*)"/g)) {
        hrefs.push(m[1]);
      }

      // Contexto HTML: 1500 chars antes y después del primer match
      const firstIdx = html.indexOf('cinesur-bahia-de-cadiz');
      const context = firstIdx >= 0
        ? html.slice(Math.max(0, firstIdx - 1200), firstIdx + 1500)
        : 'NO ENCONTRADO';

      // Buscar headers de fecha en el HTML
      const dateHeaders = (html.match(/<[^>]*>(?:\s*(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo|lun|mar|mié|jue|vie|sáb|dom)\b[^<]{0,30})<\/[^>]+>/gi) || []).slice(0, 15);

      // Buscar data-date o data-dia attributes
      const dataAttrs = (html.match(/data-(?:date|dia|fecha)="([^"]+)"/gi) || []).slice(0, 20);

      result[`mk2_${slug}`] = {
        bytes: html.length,
        totalHrefs: hrefs.length,
        hrefs: hrefs.slice(0, 20), // URLs COMPLETAS para ver si tienen fecha
        dateHeaders,
        dataAttrs,
        context, // HTML alrededor del primer enlace de sesión
      };
    } catch(e) {
      result[`mk2_${slug}`] = { error: String(e) };
    }
  }

  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
