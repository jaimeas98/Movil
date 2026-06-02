// Endpoint de estado rápido: llama al agregador y devuelve cuántas películas
// hay por cine×día + info de fuente. GET /api/status
// Útil para diagnosticar desde el navegador qué días tienen datos reales vs. muestra.

import { NextResponse } from 'next/server';
import { getShowtimes, clearShowtimesCache } from '@/lib/cinemas/aggregator.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('refresh') === '1') clearShowtimesCache();

  try {
    const data = await getShowtimes();
    const today = data.dates[0];

    const summary = data.cinemas.map((c) => ({
      id: c.id,
      name: c.name,
      source: c.source,
      reason: c.reason ?? null,
      today: { date: today, movies: c.byDate[today]?.length ?? 0 },
      allDates: data.dates.map((iso) => ({
        iso,
        count: c.byDate[iso]?.length ?? 0,
      })),
    }));

    const zeros = summary.flatMap((c) =>
      c.allDates.filter((d) => d.count === 0).map((d) => `${c.id} @ ${d.iso}`)
    );

    return NextResponse.json({
      generatedAt: data.generatedAt,
      todayMadrid: today,
      mode: data.mode,
      healthy: zeros.length === 0,
      zeros,
      cinemas: summary,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
