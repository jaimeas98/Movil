// Test endpoint: verifica la lógica del pipeline de agregación con datos mock.
// No hace peticiones HTTP a cines reales — simula distintos escenarios de respuesta
// y comprueba que los 14 días × 4 cines siempre tienen películas.
// GET /api/test-logic

import { NextResponse } from 'next/server';
import { CINEMAS } from '@/lib/cinemas/config.js';
import { mergeMoviesByTitle } from '@/lib/normalize.js';
import { buildSampleByDate } from '@/lib/cinemas/sample.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RANGE_DAYS = 14;

function madridToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function dateRange() {
  const today = madridToday();
  const out = [];
  for (let i = 0; i < RANGE_DAYS; i++) {
    const d = new Date(today + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Copia exacta de la lógica de getCinema en aggregator.js (sin imports de red)
function runAggregatorLogic(cinema, isoDates, mockFetcher) {
  let source = 'live';
  let reason = null;
  let byDate = {};

  try {
    const live = mockFetcher(cinema.id);
    if (live && Object.keys(live).length) {
      for (const [iso, movies] of Object.entries(live)) {
        byDate[iso] = mergeMoviesByTitle(movies);
      }
      const sampleFill = buildSampleByDate(cinema.id, isoDates);
      for (const iso of isoDates) {
        if (!byDate[iso]?.length) byDate[iso] = sampleFill[iso];
      }
    } else {
      throw new Error('respuesta vacía');
    }
  } catch (err) {
    source = 'sample';
    reason = String(err?.message ?? err);
    byDate = buildSampleByDate(cinema.id, isoDates);
  }

  return { id: cinema.id, source, reason, byDate };
}

function checkAllDates(result, isoDates) {
  const issues = [];
  for (const iso of isoDates) {
    const count = result.byDate[iso]?.length ?? 0;
    if (count === 0) issues.push(`${iso}: 0 películas`);
  }
  return issues;
}

// Construye películas mock mínimas para un día dado
function mockMovies(dateStr, count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `mock-movie-${i}`,
    title: `Película Mock ${i + 1}`,
    posterUrl: null,
    durationMin: 100 + i * 10,
    genre: 'Acción',
    ageRating: '+12',
    synopsis: 'Sinopsis de prueba.',
    rating: null,
    sessions: [{ time: '20:00', format: '2D', language: 'VE', room: null, buyUrl: null }],
  }));
}

export async function GET() {
  const isoDates = dateRange();
  const today = isoDates[0];
  const tomorrow = isoDates[1];
  const report = {
    generatedAt: new Date().toISOString(),
    todayMadrid: today,
    dates: isoDates,
    scenarios: [],
    summary: { passed: 0, failed: 0 },
  };

  // ── Escenario A ───────────────────────────────────────────────────────────────
  // mk2 sólo devuelve hoy. Yelmo devuelve mañana en adelante. Arte Siete falla.
  // Esperado: todos los cines deben tener 14 días con películas (sample rellena).
  {
    const mockFetchers = {
      'cinesur-bahia-cadiz': (id) => ({ [today]: mockMovies(today, 4) }),
      'yelmo-bahia-sur':     (id) => Object.fromEntries(isoDates.slice(1).map((d) => [d, mockMovies(d, 5)])),
      'yelmo-jerez':         (id) => Object.fromEntries(isoDates.slice(1).map((d) => [d, mockMovies(d, 5)])),
      'arte-siete-puerto':   (id) => { throw new Error('HTTP 403 simulado'); },
    };

    const scen = { name: 'A: mk2=hoy-only, Yelmo=mañana+, Arte7=falla', results: [], passed: true };
    for (const cinema of CINEMAS) {
      const result = runAggregatorLogic(cinema, isoDates, mockFetchers[cinema.id]);
      const issues = checkAllDates(result, isoDates);
      scen.results.push({
        cinema: cinema.id,
        source: result.source,
        reason: result.reason,
        daysWithMovies: isoDates.filter((d) => (result.byDate[d]?.length ?? 0) > 0).length,
        daysTotal: isoDates.length,
        issues,
      });
      if (issues.length) scen.passed = false;
    }
    report.scenarios.push(scen);
    if (scen.passed) report.summary.passed++; else report.summary.failed++;
  }

  // ── Escenario B ───────────────────────────────────────────────────────────────
  // Todos los adaptadores devuelven los 14 días con datos.
  // Esperado: source='live' para todos, sin necesidad de sample.
  {
    const mockFetchers = Object.fromEntries(
      CINEMAS.map((c) => [c.id, () => Object.fromEntries(isoDates.map((d) => [d, mockMovies(d, 6)]))])
    );

    const scen = { name: 'B: todos devuelven 14 días completos', results: [], passed: true };
    for (const cinema of CINEMAS) {
      const result = runAggregatorLogic(cinema, isoDates, mockFetchers[cinema.id]);
      const issues = checkAllDates(result, isoDates);
      const liveCount = isoDates.filter((d) => (result.byDate[d]?.length ?? 0) > 0).length;
      scen.results.push({
        cinema: cinema.id,
        source: result.source,
        daysWithMovies: liveCount,
        daysTotal: isoDates.length,
        issues,
      });
      if (issues.length || result.source !== 'live') scen.passed = false;
    }
    report.scenarios.push(scen);
    if (scen.passed) report.summary.passed++; else report.summary.failed++;
  }

  // ── Escenario C ───────────────────────────────────────────────────────────────
  // Todos los adaptadores fallan.
  // Esperado: source='sample' para todos, datos de ejemplo en todos los días.
  {
    const mockFetchers = Object.fromEntries(
      CINEMAS.map((c) => [c.id, () => { throw new Error('Timeout simulado'); }])
    );

    const scen = { name: 'C: todos los adaptadores fallan', results: [], passed: true };
    for (const cinema of CINEMAS) {
      const result = runAggregatorLogic(cinema, isoDates, mockFetchers[cinema.id]);
      const issues = checkAllDates(result, isoDates);
      scen.results.push({
        cinema: cinema.id,
        source: result.source,
        daysWithMovies: isoDates.filter((d) => (result.byDate[d]?.length ?? 0) > 0).length,
        daysTotal: isoDates.length,
        issues,
      });
      if (issues.length || result.source !== 'sample') scen.passed = false;
    }
    report.scenarios.push(scen);
    if (scen.passed) report.summary.passed++; else report.summary.failed++;
  }

  // ── Escenario D ───────────────────────────────────────────────────────────────
  // Adaptador devuelve array vacío [] para algunos días (bug real detectado).
  // Esperado: el aggregator rellena con sample, no deja [] sin películas.
  {
    const mockFetchers = {
      'cinesur-bahia-cadiz': (id) => {
        const r = {};
        for (const d of isoDates) r[d] = d === today ? mockMovies(d, 3) : []; // array vacío resto
        return r;
      },
      'yelmo-bahia-sur':     (id) => ({ [today]: mockMovies(today, 2), [tomorrow]: [] }),
      'yelmo-jerez':         (id) => ({ [today]: mockMovies(today, 2), [tomorrow]: [] }),
      'arte-siete-puerto':   (id) => Object.fromEntries(isoDates.map((d) => [d, []])), // todo vacío
    };

    const scen = { name: 'D: adaptadores devuelven arrays vacíos [] en días futuros', results: [], passed: true };
    for (const cinema of CINEMAS) {
      const result = runAggregatorLogic(cinema, isoDates, mockFetchers[cinema.id]);
      const issues = checkAllDates(result, isoDates);
      scen.results.push({
        cinema: cinema.id,
        source: result.source,
        daysWithMovies: isoDates.filter((d) => (result.byDate[d]?.length ?? 0) > 0).length,
        daysTotal: isoDates.length,
        issues,
      });
      if (issues.length) scen.passed = false;
    }
    report.scenarios.push(scen);
    if (scen.passed) report.summary.passed++; else report.summary.failed++;
  }

  // ── Escenario E ───────────────────────────────────────────────────────────────
  // Verificar que buildSampleByDate cubre todos los días para los 4 cines.
  {
    const scen = { name: 'E: buildSampleByDate cubre los 14 días para cada cine', results: [], passed: true };
    for (const cinema of CINEMAS) {
      const sample = buildSampleByDate(cinema.id, isoDates);
      const issues = [];
      for (const iso of isoDates) {
        const count = sample[iso]?.length ?? 0;
        if (count === 0) issues.push(`${iso}: 0 películas de muestra`);
      }
      scen.results.push({
        cinema: cinema.id,
        source: 'sample-direct',
        daysWithMovies: isoDates.filter((d) => (sample[d]?.length ?? 0) > 0).length,
        daysTotal: isoDates.length,
        issues,
      });
      if (issues.length) scen.passed = false;
    }
    report.scenarios.push(scen);
    if (scen.passed) report.summary.passed++; else report.summary.failed++;
  }

  report.allPassed = report.summary.failed === 0;
  report.verdict = report.allPassed ? '✅ TODOS LOS ESCENARIOS PASAN' : `❌ ${report.summary.failed} ESCENARIO(S) FALLANDO`;

  return NextResponse.json(report, {
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}
