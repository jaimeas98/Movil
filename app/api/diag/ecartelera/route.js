// Tercer sondeo: bajar hasta las fichas de NUESTROS dos cines en eCartelera.
//
// Por qué solo eCartelera: su robots.txt permite /cines/ (solo prohíbe /ajax/,
// /admin/, /cron/, /cines/comprar/ y las fotos originales). SensaCine, en
// cambio, prohíbe /buscar/ — que era justo la ruta por la que yo había
// entrado—, así que se deja de usar. Y FilmAffinity respondió con el desafío
// de Cloudflare. Cuando una web dice que no, se respeta y punto.
//
// El sondeo anterior solo miró el índice, y ahí salen ciudades y algún cine
// suelto. Los nuestros están un nivel más abajo: índice → ciudad → cine.
//
//   GET /api/diag/ecartelera
//   GET /api/diag/ecartelera?abrir=<url>   para inspeccionar una ficha concreta

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const preferredRegion = 'cdg1';
export const dynamic = 'force-dynamic';

const BASE = 'https://www.ecartelera.com';
const CABECERAS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
};

// Rutas que su robots.txt nos pide no tocar. Se comprueba antes de cada
// petición, no como un trámite: si un enlace cae aquí, no se pide.
const PROHIBIDO = [/^\/u\//, /^\/admin/, /^\/cron\//, /^\/robots\//, /^\/ajax\//, /^\/cines\/comprar\//, /^\/fotos\/.*\/original\//];
const permitido = (url) => {
  try { return !PROHIBIDO.some((re) => re.test(new URL(url).pathname)); }
  catch { return false; }
};

const sinTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function pedir(url) {
  if (!permitido(url)) return { saltado: 'ruta excluida por su robots.txt' };
  const res = await fetch(url, {
    headers: CABECERAS, signal: AbortSignal.timeout(14000), cache: 'no-store', redirect: 'follow',
  });
  const cuerpo = await res.text();
  return { status: res.status, cuerpo, bloqueado: res.status === 403 };
}

// Enlaces de /cines/ cuyo texto case con lo que le pidamos.
function enlaces(html, filtro) {
  const vistos = new Map();
  for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const texto = sinTags(m[2]);
    if (!texto || !filtro.test(texto)) continue;
    const href = m[1];
    if (!/\/cines\//.test(href)) continue;
    const abs = href.startsWith('http') ? href : BASE + (href.startsWith('/') ? '' : '/') + href;
    if (permitido(abs) && !vistos.has(abs)) vistos.set(abs, texto.slice(0, 70));
  }
  return [...vistos.entries()].map(([url, texto]) => ({ url, texto })).slice(0, 15);
}

function describir(html) {
  const horas = [...html.matchAll(/\b([01]?\d|2[0-3]):[0-5]\d\b/g)].map((m) => m[0]);
  const i = html.search(/\b(1[0-9]|2[0-3]):[0-5]\d\b/); // horas de cine, no 00:00 de scripts
  return {
    bytes: html.length,
    horasEncontradas: horas.length,
    primerasHoras: [...new Set(horas)].slice(0, 15),
    fechas: [...new Set([...html.matchAll(/\b\d{1,2}\s+de\s+\w+|\b20\d{2}-\d{2}-\d{2}\b/gi)].map((m) => m[0]))].slice(0, 10),
    tieneJsonLd: /application\/ld\+json/.test(html),
    // El trozo alrededor del primer horario de tarde es donde se ve el patrón.
    contexto: i > -1 ? html.slice(Math.max(0, i - 900), i + 900) : null,
  };
}

export async function GET(request) {
  const abrir = new URL(request.url).searchParams.get('abrir');
  const informe = { generatedAt: new Date().toISOString(), region: process.env.VERCEL_REGION ?? '?' };

  if (abrir) {
    const r = await pedir(abrir);
    informe.pagina = r.saltado
      ? { url: abrir, saltado: r.saltado }
      : { url: abrir, status: r.status, ...describir(r.cuerpo), enlacesCine: enlaces(r.cuerpo, /yelmo|cine|multicines/i) };
    return NextResponse.json(informe, { headers: { 'Cache-Control': 'no-store' } });
  }

  // 1. Índice → páginas de nuestras ciudades
  const indice = await pedir(`${BASE}/cines/`);
  informe.ciudades = enlaces(indice.cuerpo || '', /jerez|c[áa]diz|san\s*fernando/i);

  // 2. Cada ciudad → fichas de cine que sean Yelmo
  informe.cines = [];
  for (const ciudad of informe.ciudades.slice(0, 4)) {
    const r = await pedir(ciudad.url);
    if (r.saltado || !r.cuerpo) continue;
    const encontrados = enlaces(r.cuerpo, /yelmo/i);
    informe.cines.push({ ciudad: ciudad.texto, url: ciudad.url, yelmo: encontrados });
  }

  // 3. Abrir la primera ficha de Yelmo y ver cómo publica los horarios
  const primera = informe.cines.flatMap((c) => c.yelmo)[0];
  if (primera) {
    const r = await pedir(primera.url);
    informe.muestraFicha = r.saltado
      ? { url: primera.url, saltado: r.saltado }
      : { url: primera.url, texto: primera.texto, status: r.status, ...describir(r.cuerpo) };
  } else {
    informe.muestraFicha = null;
    informe.nota = 'No se han encontrado fichas de Yelmo en las páginas de ciudad. Usa ?abrir=<url> con una página de ciudad para ver todos sus enlaces de cine.';
  }

  return NextResponse.json(informe, { headers: { 'Cache-Control': 'no-store' } });
}
