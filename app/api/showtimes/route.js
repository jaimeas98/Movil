import { NextResponse } from 'next/server';
import { getShowtimes } from '@/lib/cinemas/aggregator.js';

// Esta ruta se ejecuta en el servidor (sin límites de CORS) y siempre fresca.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function todayInMadrid() {
  // Fecha actual en formato YYYY-MM-DD según la zona horaria de España.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let date = searchParams.get('date');
  if (!date || !DATE_RE.test(date)) {
    date = todayInMadrid();
  }

  try {
    const data = await getShowtimes(date);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'No se pudo obtener la cartelera', detail: String(err) },
      { status: 500 }
    );
  }
}
