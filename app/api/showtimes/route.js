import { NextResponse } from 'next/server';
import { getShowtimes, clearShowtimesCache } from '@/lib/cinemas/aggregator.js';

// Se ejecuta en el servidor (sin CORS). Devuelve TODA la cartelera (todos los
// días) en una sola respuesta; el cliente filtra por día en memoria.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('refresh') === '1') clearShowtimesCache();

  try {
    const data = await getShowtimes();
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      { error: 'No se pudo obtener la cartelera', detail: String(err) },
      { status: 500 }
    );
  }
}
