import { NextResponse } from 'next/server';
import { getShowtimes, clearShowtimesCache } from '@/lib/cinemas/aggregator.js';

// Se ejecuta en el servidor (sin CORS). Devuelve TODA la cartelera (todos los
// días) en una sola respuesta; el cliente filtra por día en memoria.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';
// Ejecutar en Europa y no en Washington, que es el valor por defecto de Vercel.
// Tiene dos motivos y ninguno es esquivar nada: es absurdo que una web de cines
// españoles consulte webs españolas dando la vuelta por Estados Unidos, y las
// protecciones antibot puntúan mucho peor a un servidor estadounidense pidiendo
// la cartelera de Cádiz que a uno europeo. Si el bloqueo de Yelmo es por
// reputación de origen, esto lo resuelve sin disfrazar quiénes somos.
// (Una sola región: en el plan Hobby de Vercel no se admiten varias.)
export const preferredRegion = 'cdg1';
export const maxDuration = 60; // segundos — evita el corte a 10s del plan Hobby de Vercel

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
