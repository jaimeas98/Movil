// Diagnóstico v9: contar sesiones Arte Siete por fecha + estructura día mk2
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

  // ── Arte Siete: extraer JSON y contar sesiones por fecha ─────────────────────
  try {
    const { text } = await get('https://bahia.artesiete.es/Cine/33/Artesiete-Bahia');
    const marker = '&quot;diacompleto&quot;:';
    const markerPos = text.indexOf(marker);
    const arrayStart = text.lastIndexOf('[{', markerPos);
    let closePos = text.indexOf("}]'", markerPos);
    if (closePos < 0) closePos = text.indexOf('}]"', markerPos);

    result.a7_json_range = { markerPos, arrayStart, closePos, totalBytes: text.length };

    if (arrayStart >= 0 && closePos >= 0) {
      const encoded = text.slice(arrayStart, closePos + 2);
      const decoded = encoded
        .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

      try {
        const sessions = JSON.parse(decoded);
        const byDate = {};
        const moviesByDate = {};
        for (const s of sessions) {
          const dc = s.diacompleto || '?';
          byDate[dc] = (byDate[dc] || 0) + 1;
          if (!moviesByDate[dc]) moviesByDate[dc] = new Set();
          moviesByDate[dc].add(s.Titulo);
        }
        // Convert Sets to arrays for JSON output
        const moviesArr = {};
        for (const [d, set] of Object.entries(moviesByDate)) moviesArr[d] = [...set];

        result.a7_total = sessions.length;
        result.a7_by_date = byDate;
        result.a7_movies_by_date = moviesArr;
      } catch(e) {
        result.a7_parse_error = String(e);
        result.a7_encoded_end500 = encoded.slice(-500);
        result.a7_decoded_sample = decoded.slice(0, 300);
      }
    }
  } catch(e) { result.a7_error = String(e); }

  // ── mk2: estructura HTML entre bloques de días + JavaScript de sesiones ───────
  try {
    const { text: html } = await get('https://www.mk2cines.es/es/el-drama');

    // Scripts inline que mencionen horarios / dias / rotulo
    const scripts = [];
    for (const m of html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)) {
      const s = m[1].trim();
      if (s.length > 50 && /hor|dia|rotulo|cambiar|data-ho|ho_dia/i.test(s)) {
        scripts.push(s.slice(0, 3000));
      }
    }
    result.mk2_scripts = scripts.slice(0, 4);

    // Qué hay ENTRE bloques consecutivos de "mk2 Bahía De Cádiz Premium"
    // (revelará el separador de días)
    const logoToken = 'mk2_bahia_de_cadiz_premium';
    const parts = html.split(logoToken);
    result.mk2_between_bahia_blocks = parts.slice(1, 5).map((p, i) => ({
      blockIndex: i + 1,
      preview: p.slice(0, 500), // 500 chars tras cada logo del cine
    }));

    // Todos los data-ho del HTML en orden, con su tiempo visible
    const hoArr = [];
    for (const m of html.matchAll(/data-ho="(\d+)"[^>]*>([^<]*(?:<span>[^<]*<\/span>)?[^<]*)<\/a>/g)) {
      hoArr.push({ ho: parseInt(m[1]), txt: m[2].replace(/<[^>]+>/g, '').trim() });
    }
    result.mk2_all_ho = hoArr.slice(0, 60);

    // Buscar containers con data-num (día)
    result.mk2_data_num = (html.match(/data-num="(\d+)"[^>]*>([^<]{0,50})</g) || []).slice(0, 20);

    // Buscar id/class de containers de día
    result.mk2_day_containers = (html.match(/(?:id|class)="[^"]*(?:dia|day|horario)[^"]*"/gi) || []).slice(0, 20);

  } catch(e) { result.mk2_error = String(e); }

  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
