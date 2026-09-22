// Segundo sondeo: localizar las páginas de NUESTROS dos cines en las fuentes
// que sí nos responden, y ver cómo publican los horarios.
//
// Hace tres cosas en una sola pasada:
//  1. lee el robots.txt de cada fuente y enseña sus reglas — si una web pide
//     que no entremos a esa ruta, se respeta y se descarta, igual que se ha
//     hecho con FilmAffinity en cuanto ha dicho que no;
//  2. busca en sus índices los enlaces que apuntan a Yelmo Bahía Sur y Área Sur;
//  3. abre los mejores candidatos y describe su estructura, para poder escribir
//     el lector sin adivinar.
//
//   GET /api/diag/fuentes2

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

const INDICES = [
  { sitio: 'SensaCine',  base: 'https://www.sensacine.com',  url: 'https://www.sensacine.com/buscar/?q=yelmo' },
  { sitio: 'eCartelera', base: 'https://www.ecartelera.com', url: 'https://www.ecartelera.com/cines/' },
];

// Nuestros cines: Yelmo Premium Bahía Sur (San Fernando) y Yelmo Área Sur (Jerez)
const OBJETIVOS = /bah[ií]a\s*sur|[áa]rea\s*sur|jerez|san\s*fernando/i;

const sinTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function pedir(url) {
  const res = await fetch(url, {
    headers: CABECERAS, signal: AbortSignal.timeout(14000), cache: 'no-store', redirect: 'follow',
  });
  const cuerpo = await res.text();
  const bloqueado = res.status === 403 || /Just a moment|Attention Required/i.test(cuerpo.slice(0, 1500));
  return { status: res.status, cuerpo, bloqueado };
}

// Enlaces cuyo texto o destino mencionen nuestros cines.
function candidatos(html, base) {
  const vistos = new Map();
  for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,180}?)<\/a>/gi)) {
    const href = m[1];
    const texto = sinTags(m[2]);
    if (!OBJETIVOS.test(texto) && !OBJETIVOS.test(href)) continue;
    if (!/yelmo|cine/i.test(texto + href)) continue;
    const abs = href.startsWith('http') ? href : base + (href.startsWith('/') ? '' : '/') + href;
    if (!vistos.has(abs)) vistos.set(abs, texto.slice(0, 80));
  }
  return [...vistos.entries()].map(([url, texto]) => ({ url, texto })).slice(0, 12);
}

// ¿Cómo publica esta página los horarios? Lo que necesito saber para el lector.
function describir(html) {
  const horas = [...html.matchAll(/\b([01]?\d|2[0-3]):[0-5]\d\b/g)].map((m) => m[0]);
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]{0,400}?)<\/script>/gi)]
    .map((m) => m[1].trim().slice(0, 200)).slice(0, 3);
  const i = html.search(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
  return {
    bytes: html.length,
    horasEncontradas: horas.length,
    primerasHoras: [...new Set(horas)].slice(0, 12),
    tieneNextData: /id="__NEXT_DATA__"/.test(html),
    tieneJsonLd: jsonLd.length > 0,
    jsonLd,
    fechasIso: [...new Set([...html.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)].map((m) => m[0]))].slice(0, 10),
    // Trozo alrededor del primer horario: ahí se ve el patrón a parsear.
    contexto: i > -1 ? html.slice(Math.max(0, i - 700), i + 700) : null,
  };
}

export async function GET(request) {
  const abrir = new URL(request.url).searchParams.get('abrir'); // URL concreta a inspeccionar
  const informe = { generatedAt: new Date().toISOString(), region: process.env.VERCEL_REGION ?? '?' };

  if (abrir) {
    try {
      const r = await pedir(abrir);
      informe.pagina = { url: abrir, status: r.status, bloqueado: r.bloqueado, ...describir(r.cuerpo) };
    } catch (e) {
      informe.pagina = { url: abrir, error: String(e?.message ?? e) };
    }
    return NextResponse.json(informe, { headers: { 'Cache-Control': 'no-store' } });
  }

  informe.fuentes = [];
  for (const f of INDICES) {
    const entrada = { sitio: f.sitio };

    // 1. Sus reglas primero
    try {
      const r = await pedir(`${f.base}/robots.txt`);
      const lineas = r.cuerpo.split('\n').map((l) => l.trim());
      const iAll = lineas.findIndex((l) => /^user-agent:\s*\*/i.test(l));
      entrada.robots = {
        status: r.status,
        // Bloque de "User-agent: *": lo que nos aplica a nosotros
        reglasParaTodos: iAll > -1
          ? lineas.slice(iAll, iAll + 30).filter((l) => l && !l.startsWith('#')).slice(0, 25)
          : '(sin bloque para User-agent: *)',
      };
    } catch (e) {
      entrada.robots = { error: String(e?.message ?? e) };
    }

    // 2. Enlaces a nuestros cines
    try {
      const r = await pedir(f.url);
      entrada.indice = { url: f.url, status: r.status, bloqueado: r.bloqueado, bytes: r.cuerpo.length };
      entrada.candidatos = r.bloqueado ? [] : candidatos(r.cuerpo, f.base);
    } catch (e) {
      entrada.indice = { url: f.url, error: String(e?.message ?? e) };
      entrada.candidatos = [];
    }

    // 3. Abrir el primer candidato para ver cómo publica los horarios
    const primero = entrada.candidatos?.[0];
    if (primero) {
      try {
        const r = await pedir(primero.url);
        entrada.muestraPagina = { url: primero.url, status: r.status, bloqueado: r.bloqueado, ...describir(r.cuerpo) };
      } catch (e) {
        entrada.muestraPagina = { url: primero.url, error: String(e?.message ?? e) };
      }
    }

    informe.fuentes.push(entrada);
  }

  return NextResponse.json(informe, { headers: { 'Cache-Control': 'no-store' } });
}
