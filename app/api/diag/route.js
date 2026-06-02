// Endpoint de diagnóstico: ejecuta todos los adaptadores y devuelve un
// informe detallado. Útil para depurar sin necesidad de que el usuario
// compruebe la interfaz. GET /api/diag  (o /api/diag?cinema=yelmo-bahia-sur)
//
// IMPORTANTE: solo accesible en desarrollo (NODE_ENV !== 'production').

import { NextResponse } from 'next/server';
import { fetchMk2 } from '@/lib/cinemas/mk2.js';
import { fetchYelmo } from '@/lib/cinemas/yelmo.js';
import { fetchArteSiete } from '@/lib/cinemas/artesiete.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADAPTERS = {
  'cinesur-bahia-cadiz': { name: 'mk2 Cinesur Bahía', fn: fetchMk2 },
  'yelmo-bahia-sur':     { name: 'Yelmo Bahía Sur',   fn: () => fetchYelmo('yelmo-bahia-sur') },
  'yelmo-jerez':         { name: 'Yelmo Jerez',        fn: () => fetchYelmo('yelmo-jerez') },
  'arte-siete-puerto':   { name: 'Arte Siete',         fn: fetchArteSiete },
};

function madridToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function dateRange(n = 7) {
  const today = madridToday();
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(today + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('cinema'); // opcional
  const dates = dateRange(7);
  const report = { generatedAt: new Date().toISOString(), dates, cinemas: [] };

  for (const [id, { name, fn }] of Object.entries(ADAPTERS)) {
    if (filter && !id.includes(filter)) continue;

    const entry = { id, name, status: 'ok', error: null, byDate: {}, issues: [] };

    try {
      const byDate = await fn();
      entry.byDate = summarize(byDate, dates, entry.issues);
    } catch (err) {
      entry.status = 'error';
      entry.error = String(err?.message ?? err);
      entry.issues.push(`FETCH_ERROR: ${entry.error}`);
    }

    report.cinemas.push(entry);
  }

  // Resumen global de issues
  report.totalIssues = report.cinemas.flatMap((c) => c.issues).length;
  report.healthy = report.totalIssues === 0;

  return NextResponse.json(report, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

function summarize(byDate, dates, issues) {
  const out = {};
  for (const iso of dates) {
    const movies = byDate[iso] || [];
    out[iso] = {
      count: movies.length,
      movies: movies.map((m) => {
        const mIssues = [];
        if (!m.genre)       mIssues.push('NO_GENRE');
        if (!m.posterUrl)   mIssues.push('NO_POSTER');
        if (!m.durationMin) mIssues.push('NO_DURATION');
        if (!m.sessions?.length) mIssues.push('NO_SESSIONS');
        const badSessions = (m.sessions || []).filter((s) => !s.time || s.time.length < 4);
        if (badSessions.length) mIssues.push(`BAD_TIMES(${badSessions.length})`);

        if (mIssues.length) {
          issues.push(`[${iso}] ${m.title}: ${mIssues.join(', ')}`);
        }

        return {
          title: m.title,
          genre: m.genre ?? null,
          durationMin: m.durationMin ?? null,
          ageRating: m.ageRating ?? null,
          hasPoster: !!m.posterUrl,
          synopsis: m.synopsis ? m.synopsis.slice(0, 80) + '…' : null,
          sessions: (m.sessions || []).map((s) => ({
            time: s.time,
            format: s.format,
            language: s.language,
            room: s.room ?? null,
          })),
          issues: mIssues,
        };
      }),
    };

    if (!movies.length) {
      issues.push(`[${iso}] ${byDate[iso] === undefined ? 'MISSING_DATE' : 'EMPTY'}`);
    }
  }
  return out;
}
