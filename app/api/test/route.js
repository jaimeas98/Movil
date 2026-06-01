// Diagnóstico v7: Arte Siete - estructura HTML de películas/sesiones
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

  // La página del cine tiene 767KB. Los datos de config están en 0-40k.
  // Los bloques de películas deberían estar en 40k-200k.
  try {
    const { text, status } = await get('https://bahia.artesiete.es/Cine/33/Artesiete-Bahia');
    result.meta = { status, bytes: text.length };

    // Buscar los patrones de bloques de película
    // Buscar clases CSS que contengan "pelicula", "movie", "film", "cartelera", "sesion"
    const classPatterns = [...new Set(
      (text.match(/class="([^"]*(?:pelicula|movie|film|sesion|horario|pase|titulo|poster)[^"]*)"/gi) || [])
    )].slice(0, 30);

    // Buscar IDs HTML con keywords relevantes
    const idPatterns = [...new Set(
      (text.match(/id="([^"]*(?:pelicula|movie|film|sesion|horario|pase|cartelera)[^"]*)"/gi) || [])
    )].slice(0, 20);

    result.htmlPatterns = { classPatterns, idPatterns };

    // Zonas donde probablemente están los bloques de película
    result.zone40k = text.slice(40000, 43000);
    result.zone50k = text.slice(50000, 53000);
    result.zone60k = text.slice(60000, 63000);
    result.zone80k = text.slice(80000, 83000);
    result.zone100k = text.slice(100000, 103000);
    result.zone120k = text.slice(120000, 123000);
    result.zone150k = text.slice(150000, 153000);

    // Buscar bloques con horarios (HH:MM) y lo que les rodea
    const sessionContexts = [];
    for (const m of text.matchAll(/(.{0,300}\b\d{2}:\d{2}\b.{0,300})/g)) {
      const ctx = m[1];
      // Solo incluir si parece HTML de sesión (tiene tags, horarios de tarde/noche)
      if (/<[a-z]/.test(ctx) && /\b(?:1[6-9]|2[0-2]):\d{2}\b/.test(ctx)) {
        sessionContexts.push(ctx.slice(0, 400));
      }
    }
    result.sessionContexts = sessionContexts.slice(0, 8);

    // Buscar div/section con horarios encadenados (patrón de pases)
    const sessionBlocks = (text.match(/<[^>]+>(?:\s*\d{2}:\d{2}\s*<\/[^>]+>\s*){2,}/g) || []).slice(0, 5);
    result.sessionBlocks = sessionBlocks;

    // Buscar URLs de compra de entradas dentro del cine
    const buyUrls = [...new Set(
      (text.match(/href="([^"]*(?:comprar|entradas|ticket|buy|sesion|pase)[^"]*)"[^>]*>/gi) || [])
        .map(m => m.match(/href="([^"]+)"/)?.[1])
        .filter(Boolean)
    )].slice(0, 15);
    result.buyUrls = buyUrls;

    // Buscar patrones de nombre de película (h2/h3/strong con texto > 3 chars)
    const titleCandidates = (text.match(/<(?:h[1-4]|strong)[^>]*>([^<]{3,60})<\/(?:h[1-4]|strong)>/gi) || [])
      .map(m => m.replace(/<[^>]+>/g, '').trim())
      .filter(t => t.length > 3 && !/^\d/.test(t))
      .slice(0, 20);
    result.titleCandidates = titleCandidates;

    // Buscar patrones de imágenes de póster
    const posterUrls = [...new Set(
      (text.match(/(?:src|href)="([^"]*(?:Poster|poster|cartel|img)[^"]*\.(?:jpg|png|webp|jpeg))[^"]*"/gi) || [])
        .map(m => m.match(/["'](https?:\/\/[^"']+|\/[^"']+)/)?.[1])
        .filter(Boolean)
    )].slice(0, 15);
    result.posterUrls = posterUrls;

  } catch(e) { result.error = String(e); }

  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
