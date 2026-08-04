// Endpoint de diagnóstico específico de mk2. Vuelca la ESTRUCTURA REAL del HTML
// de la cartelera para poder escribir un parser correcto sin adivinar.
//
// Motivo: el entorno de desarrollo no tiene salida a mk2cines.es, así que la
// única forma de ver el HTML real es desde el despliegue (Vercel), que sí la
// tiene. El volcado se lee a mano, por eso es compacto por defecto.
//
//   GET /api/diag/mk2                → resumen de todas las películas
//   GET /api/diag/mk2?q=elm          → sólo las que contengan "elm" en el título
//   GET /api/diag/mk2?q=elm&raw=1    → + recorte de HTML crudo de ese bloque
//   GET /api/diag/mk2?raw=1&chars=6000
//
// Lo importante que buscamos confirmar:
//  · si la cartelera trae marcadores de día (rotulo_dia / data-num) o no
//  · si un mismo bloque de película trae sesiones de fechas MUY posteriores
//  · qué atributos lleva cada <a> de sesión (¿hay fecha? ¿id de sesión?)
//  · qué se pierde al recortar la query string del href

import { NextResponse } from 'next/server';
import { fetchText } from '@/lib/cinemas/http.js';
import { fetchMk2 } from '@/lib/cinemas/mk2.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE = 'https://www.mk2cines.es';
const CARTELERA_URL = `${BASE}/es/mk2-cinesur-bahia-de-cadiz/cartelera`;
const CINEMA_SLUG = 'cinesur-bahia-de-cadiz';

function madridToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// Cualquier cosa que parezca una fecha dentro del bloque: 29/10, 29-10-2026,
// 2026-10-29, o nombres de mes en español. Nos dice si el HTML lleva la fecha
// real de la sesión en algún sitio que hoy estemos ignorando.
function findDateHints(html) {
  const hints = new Set();
  const patterns = [
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b\d{1,2}-\d{1,2}-\d{2,4}\b/g,
    /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) hints.add(m[0]);
  }
  return [...hints].slice(0, 12);
}

// Devuelve la etiqueta <a ...> de apertura completa, sin recortar, para ver
// TODOS sus atributos (data-*, href con query, etc.).
function openingTag(fullAnchor) {
  const m = fullAnchor.match(/^<a[^>]*>/);
  return m ? m[0] : fullAnchor.slice(0, 300);
}

// ¿Lleva el propio enlace la fecha de la sesión? Si la respuesta es sí, ésa es
// la fuente de verdad que debemos usar para fechar la sesión, en vez de
// deducirla por el índice del día. Aceptamos varios formatos.
function dateFromHref(href) {
  let m = href.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = href.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  m = href.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// Recuento de cada fecha que aparece en TODO el documento. Si el 29 de octubre
// está en el HTML, aquí sale — y sabremos que la fecha real está disponible.
function dateTokenCounts(html) {
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };
  for (const m of html.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)) bump(m[0]);
  for (const m of html.matchAll(/\b\d{1,2}\/\d{1,2}\/20\d{2}\b/g)) bump(m[0]);
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20)
  );
}

// Nombres de atributos data-* presentes en el documento, con su frecuencia.
// Sirve para descubrir si hay un data-fecha/data-dia que hoy ignoramos.
function dataAttrNames(html) {
  const counts = {};
  for (const m of html.matchAll(/\sdata-([a-z0-9_-]+)=/gi)) {
    const k = `data-${m[1].toLowerCase()}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25)
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const wantRaw = searchParams.get('raw') === '1';
  const chars = Math.min(Number(searchParams.get('chars')) || 4000, 20000);

  const report = {
    generatedAt: new Date().toISOString(),
    todayMadrid: madridToday(),
    url: CARTELERA_URL,
  };

  let html;
  try {
    html = await fetchText(CARTELERA_URL, { timeoutMs: 15000 });
  } catch (e) {
    report.error = String(e?.message ?? e);
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  }

  report.htmlLength = html.length;
  report.dateTokens = dateTokenCounts(html);
  report.dataAttrNames = dataAttrNames(html);

  // ── ¿Existen marcadores de día en la cartelera? ──────────────────────────────
  const markers = [];
  const markerRe = /<div[^>]*class="[^"]*rotulo_dia[^"]*"[^>]*data-num="(\d+)"[^>]*>([^<]*)</g;
  let mm;
  while ((mm = markerRe.exec(html)) !== null) {
    markers.push({ num: mm[1], text: mm[2].trim(), idx: mm.index });
  }
  report.dayMarkers = {
    count: markers.length,
    items: markers.slice(0, 20).map(({ num, text }) => ({ num, text })),
    // Si es 0, splitDaySegments() no separa nada y TODO cae en "hoy".
    note: markers.length === 0
      ? 'SIN marcadores de día en la cartelera: todo el HTML se trata como un único día.'
      : 'Hay marcadores de día; comprobar que el texto del rótulo coincide con la fecha asignada.',
  };

  // ── Bloques de película ─────────────────────────────────────────────────────
  const blocks = html.split('<div class="film-list-item">').slice(1);
  report.filmBlockCount = blocks.length;

  const films = [];
  let rawSnippet = null;

  for (const block of blocks) {
    const linkM = block.match(/href="https:\/\/www\.mk2cines\.es\/es\/([a-z0-9-]+)"[^>]*class="negro"[^>]*>([^<]+)<\/a>/);
    const title = linkM ? linkM[2].trim() : null;
    const slug = linkM ? linkM[1] : null;

    if (q && !(title || '').toLowerCase().includes(q.toLowerCase())) continue;

    const horariosBlocks = block.split('<div class="horarios">').slice(1);
    const bahiaBlocks = horariosBlocks.filter((b) => b.includes(CINEMA_SLUG));

    const sessions = [];
    for (const hb of bahiaBlocks) {
      for (const a of hb.matchAll(
        /<a[^>]+href="([^"]*cinesur-bahia-de-cadiz[^"]*)"[^>]*>([\s\S]*?)<\/a>/g
      )) {
        const hrefFull = a[1].replace(/&amp;/g, '&');
        sessions.push({
          // etiqueta <a> completa: aquí se ve si hay fecha o id de sesión
          tag: openingTag(a[0]),
          text: a[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
          hrefFull,
          dateInHref: dateFromHref(hrefFull),
        });
      }
    }

    films.push({
      title,
      slug,
      horariosBlocks: horariosBlocks.length,
      bahiaBlocks: bahiaBlocks.length,
      sessionCount: sessions.length,
      dateHints: findDateHints(block),
      sessions: sessions.slice(0, 6),
    });

    if (wantRaw && rawSnippet === null) {
      rawSnippet = block.slice(0, chars);
    }
  }

  report.films = films;
  if (rawSnippet !== null) report.rawSnippet = rawSnippet;

  // Resumen rápido: cuántas películas tienen sesiones y cuántas pistas de fecha
  // lejana aparecen. Sirve para ver de un vistazo si la cartelera mezcla días.
  report.summary = {
    filmsWithSessions: films.filter((f) => f.sessionCount > 0).length,
    filmsWithoutSessions: films.filter((f) => f.sessionCount === 0).length,
    totalSessions: films.reduce((n, f) => n + f.sessionCount, 0),
  };

  // ── Lo que produce REALMENTE el adaptador ───────────────────────────────────
  // La comparación decisiva: si aquí salen 25 títulos bajo la fecha de hoy
  // (incluidos los de cine antiguo), el bug es de atribución de fecha, no de
  // extracción. Además, para cada sesión comprobamos si la fecha que lleva su
  // propio enlace coincide con el día bajo el que la estamos colocando.
  try {
    const byDate = await fetchMk2();
    const parser = {};
    const mismatches = [];
    for (const [iso, movies] of Object.entries(byDate)) {
      parser[iso] = {
        count: movies.length,
        titles: movies.map((m) => m.title),
      };
      for (const m of movies) {
        for (const s of m.sessions || []) {
          const d = dateFromHref(s.buyUrl || '');
          if (d && d !== iso && mismatches.length < 12) {
            mismatches.push({ title: m.title, assignedIso: iso, dateInHref: d, buyUrl: s.buyUrl });
          }
        }
      }
    }
    report.parserOutput = parser;
    report.mismatches = { count: mismatches.length, sample: mismatches };
  } catch (e) {
    report.parserError = String(e?.message ?? e);
  }

  return NextResponse.json(report, {
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}
