// Sondeo de FUENTES ALTERNATIVAS para los horarios de Yelmo.
//
// Yelmo bloquea a cualquier servidor: probado desde Washington y desde París,
// y caen las seis vías, hasta el robots.txt. Pero sus horarios no son secretos:
// los publican también las webs de cartelera españolas, que son otro sitio
// distinto, con sus propias reglas y sin ninguna relación con ese bloqueo.
//
// Esto solo mira quién nos responde y quién tiene los cines que buscamos. No
// hay disfraz ninguno: si una de estas webs también nos cierra la puerta, se
// respeta igual y se descarta.
//
//   GET /api/diag/fuentes

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const preferredRegion = 'cdg1';
export const dynamic = 'force-dynamic';

const CABECERAS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
};

// Lo que buscamos en el HTML: que la página hable de nuestros cines.
const PISTAS = ['yelmo', 'bahía sur', 'bahia sur', 'área sur', 'area sur', 'jerez'];

const FUENTES = [
  { sitio: 'SensaCine', nombre: 'Cines de Cádiz',     url: 'https://www.sensacine.com/cines/cines-en-provincia-de-cadiz/' },
  { sitio: 'SensaCine', nombre: 'Búsqueda "yelmo"',   url: 'https://www.sensacine.com/buscar/?q=yelmo' },
  { sitio: 'eCartelera', nombre: 'Cines de Cádiz',    url: 'https://www.ecartelera.com/cines/cadiz/' },
  { sitio: 'eCartelera', nombre: 'Portada cines',     url: 'https://www.ecartelera.com/cines/' },
  { sitio: 'FilmAffinity', nombre: 'Cines',           url: 'https://www.filmaffinity.com/es/theaters.php' },
  { sitio: 'Cinesa/otros', nombre: 'Cartelera Cádiz', url: 'https://www.cartelera.com/cadiz/' },
  { sitio: 'Yelmo', nombre: 'Control: su API',        url: 'https://www.yelmocines.es/robots.txt' },
];

async function probar(f) {
  const t0 = Date.now();
  try {
    const res = await fetch(f.url, {
      headers: CABECERAS,
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
      redirect: 'follow',
    });
    const cuerpo = await res.text();
    const bajo = cuerpo.toLowerCase();
    const bloqueado =
      res.status === 403 ||
      /Attention Required|Just a moment|cf-browser-verification/i.test(cuerpo.slice(0, 2000));

    return {
      sitio: f.sitio,
      nombre: f.nombre,
      url: f.url,
      status: res.status,
      ms: Date.now() - t0,
      servidor: res.headers.get('server'),
      bytes: cuerpo.length,
      bloqueado,
      // Qué pistas de nuestros cines aparecen: si no sale ninguna, la página
      // responderá, pero no nos sirve.
      pistas: PISTAS.filter((p) => bajo.includes(p)),
      muestra: (res.ok && !bloqueado) ? undefined : cuerpo.slice(0, 200),
    };
  } catch (e) {
    return { sitio: f.sitio, nombre: f.nombre, url: f.url, ms: Date.now() - t0, error: String(e?.message ?? e) };
  }
}

export async function GET() {
  const resultados = await Promise.all(FUENTES.map(probar));
  const utiles = resultados.filter(
    (r) => r.status >= 200 && r.status < 400 && !r.bloqueado && (r.pistas?.length ?? 0) > 0
  );

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      region: process.env.VERCEL_REGION ?? '(desconocida)',
      resumen: {
        accesiblesConDatos: utiles.map((r) => `${r.sitio} — ${r.nombre}`),
        veredicto: utiles.length
          ? 'Hay al menos una fuente pública alternativa que nos responde y menciona los cines.'
          : 'Ninguna fuente alternativa sirve desde este servidor.',
      },
      pruebas: resultados,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
