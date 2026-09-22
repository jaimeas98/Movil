// Sondeo de Yelmo: prueba, desde el propio despliegue, cuáles de sus URLs
// públicas nos responden y cuáles corta Cloudflare.
//
// Esto NO intenta esquivar nada: se pide con nuestras cabeceras de siempre y se
// mira quién contesta. Si alguna vía pública sigue abierta, la usamos; si están
// todas cerradas, lo sabremos con certeza en vez de suponerlo.
//
// Informa además de la región desde la que corre la función, que es el dato que
// necesitamos para saber si mover el despliegue a Europa ha servido de algo.
//
//   GET /api/diag/yelmo

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const preferredRegion = 'cdg1';
export const dynamic = 'force-dynamic';

const CABECERAS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/json,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
};

const PRUEBAS = [
  {
    nombre: 'API now-playing (la que usamos)',
    url: 'https://www.yelmocines.es/now-playing.aspx/GetNowPlaying',
    metodo: 'POST',
    cuerpo: JSON.stringify({ cityKey: 'cadiz' }),
    extra: { 'Content-Type': 'application/json; charset=utf-8', 'X-Requested-With': 'XMLHttpRequest' },
  },
  { nombre: 'Portada', url: 'https://www.yelmocines.es/' },
  { nombre: 'Cartelera Bahía Sur (HTML)', url: 'https://www.yelmocines.es/cartelera/cadiz/premium-bahia-sur' },
  { nombre: 'Cartelera Jerez (HTML)', url: 'https://www.yelmocines.es/cartelera/cadiz/jerez' },
  // Subdominio de compra: es otro servicio y puede tener otras reglas.
  { nombre: 'Compra (otro subdominio)', url: 'https://compra.yelmocines.es/' },
  { nombre: 'robots.txt', url: 'https://www.yelmocines.es/robots.txt' },
];

async function probar(p) {
  const t0 = Date.now();
  try {
    const res = await fetch(p.url, {
      method: p.metodo || 'GET',
      headers: { ...CABECERAS, ...(p.extra || {}) },
      body: p.cuerpo,
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    const cuerpo = await res.text();
    const esJson = (() => { try { JSON.parse(cuerpo); return true; } catch { return false; } })();
    const bloqueado =
      res.status === 403 ||
      /Attention Required|Just a moment|cf-browser-verification/i.test(cuerpo.slice(0, 2000));

    return {
      nombre: p.nombre,
      url: p.url,
      status: res.status,
      ms: Date.now() - t0,
      servidor: res.headers.get('server'),
      tipo: res.headers.get('content-type'),
      bytes: cuerpo.length,
      esJson,
      bloqueado,
      // Solo si algo va mal: ver el principio dice si es bloqueo o error real.
      muestra: (res.ok && !bloqueado) ? undefined : cuerpo.slice(0, 300),
    };
  } catch (e) {
    return { nombre: p.nombre, url: p.url, ms: Date.now() - t0, error: String(e?.message ?? e) };
  }
}

export async function GET() {
  const resultados = await Promise.all(PRUEBAS.map(probar));
  const abiertas = resultados.filter((r) => r.status >= 200 && r.status < 400 && !r.bloqueado);

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      // Si esto no dice 'cdg1', el cambio de región no ha surtido efecto y el
      // servidor sigue saliendo por Estados Unidos.
      region: process.env.VERCEL_REGION ?? '(desconocida — ¿no es Vercel?)',
      resumen: {
        total: resultados.length,
        accesibles: abiertas.length,
        cuales: abiertas.map((r) => r.nombre),
        veredicto: abiertas.length
          ? 'Hay vías públicas abiertas: se puede reconstruir la cartelera por ahí.'
          : 'Todas las vías públicas están cortadas desde este servidor.',
      },
      pruebas: resultados,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
