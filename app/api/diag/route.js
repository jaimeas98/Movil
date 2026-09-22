// Endpoint de diagnóstico: ejecuta todos los adaptadores y devuelve un
// informe detallado. GET /api/diag  (o /api/diag?cinema=yelmo-bahia-sur)
// También incluye una sección "raw" con las claves Yelmo disponibles y
// el conteo de sesiones Arte Siete para detectar problemas de datos.

import { NextResponse } from 'next/server';
import { fetchMk2 } from '@/lib/cinemas/mk2.js';
import { fetchYelmo } from '@/lib/cinemas/yelmo.js';
import { fetchArteSiete, fetchArteSieteRawSample } from '@/lib/cinemas/artesiete.js';

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

// Réplica de la lógica de fechas del adaptador de Yelmo, para poder comparar
// lado a lado lo que devuelve el API con la fecha que nosotros deducimos.
function isoDesdeTimeFilter(tf) {
  const dm = String(tf).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
  const ms = Number((String(tf).match(/\/Date\((\d+)\)\//) || [])[1]);
  if (!isNaN(ms) && ms > 0) {
    return new Date(ms - 6 * 3600 * 1000).toISOString().slice(0, 10);
  }
  return null;
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
    // El filtro acepta tanto el id interno ('cinesur-bahia-cadiz') como algo
    // del nombre visible ('mk2'), que es lo que uno escribe de memoria.
    const f = (filter || '').toLowerCase();
    if (f && !id.includes(f) && !name.toLowerCase().includes(f)) continue;

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

  // Sección raw: claves de cine disponibles en el API de Yelmo + conteo Arte Siete
  report.raw = {};
  try {
    const H = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept-Language': 'es-ES,es;q=0.9',
    };
    const res = await fetch('https://www.yelmocines.es/now-playing.aspx/GetNowPlaying', {
      method: 'POST', headers: H, body: JSON.stringify({ cityKey: 'cadiz' }),
      signal: AbortSignal.timeout(12000), cache: 'no-store',
    });

    report.raw.yelmo_http = {
      status: res.status,
      contentType: res.headers.get('content-type'),
      // Si un día Yelmo empieza a filtrar por bot, la respuesta llega con 200
      // y un HTML de desafío en vez de JSON. Sin ver estas cabeceras no hay
      // forma de distinguir "han cambiado el API" de "nos están bloqueando".
      server: res.headers.get('server'),
      cfRay: res.headers.get('cf-ray'),
      cfMitigated: res.headers.get('cf-mitigated'),
    };

    const cuerpo = await res.text();
    report.raw.yelmo_bytes = cuerpo.length;

    let data = null;
    try {
      data = JSON.parse(cuerpo);
    } catch {
      // No es JSON: enseñamos el principio del cuerpo, que es donde se ve si
      // es una página de bloqueo, un error de .NET o un mantenimiento.
      report.raw.yelmo_error = 'La respuesta no es JSON';
      report.raw.yelmo_cuerpo = cuerpo.slice(0, 600);
    }

    if (data) {
      const cinemas = data?.d?.Cinemas ?? [];
      report.raw.yelmo_keys = cinemas.map((c) => c.Key);
      if (!cinemas.length) {
        // JSON válido pero sin cines: el API ha cambiado de forma. Volcamos las
        // claves de primer nivel para ver dónde han movido los datos.
        report.raw.yelmo_forma = {
          clavesRaiz: Object.keys(data || {}),
          clavesD: data?.d && typeof data.d === 'object' ? Object.keys(data.d) : null,
          muestra: JSON.stringify(data).slice(0, 500),
        };
      }
      // Para cada cine, mostrar vistaId (para construir URLs de compra) y datos de fechas
      report.raw.yelmo_dates = cinemas.map((c) => ({
        key: c.Key,
        vistaId: c.VistaId ?? c.CinemaVistaId ?? c.Id ?? null,
        firstShowtimeId: c.Dates?.[0]?.Movies?.[0]?.Formats?.[0]?.Showtimes?.[0]?.ShowtimeId ?? null,
        dates: (c.Dates ?? []).slice(0, 10).map((d, i) => ({
          idx: i,
          movies: d.Movies?.length ?? 0,
          firstTimeFilter: d.Movies?.[0]?.Formats?.[0]?.Showtimes?.[0]?.TimeFilter ?? null,
          // La fecha que DEDUCE nuestro código a partir de ese TimeFilter: si
          // el API cambia el formato, aquí se ve el desajuste de inmediato.
          isoDeducido: isoDesdeTimeFilter(
            d.Movies?.[0]?.Formats?.[0]?.Showtimes?.[0]?.TimeFilter ?? ''
          ),
        })),
      }));
    }
  } catch (e) {
    report.raw.yelmo_error = String(e?.message ?? e);
  }

  // Muestra de sesiones RAW de Arte Siete (sin procesar) — para verificar los
  // nombres de campo reales del ID de sesión/espectáculo usados en la URL de compra.
  // ?titulo=backrooms filtra la muestra a sesiones de esa película.
  try {
    const tituloFilter = searchParams.get('titulo');
    const { stats, sample } = await fetchArteSieteRawSample(5, tituloFilter);
    report.raw.artesiete_stats = stats;
    report.raw.artesiete_sample = sample;
  } catch (e) {
    report.raw.artesiete_error = String(e?.message ?? e);
  }

  // El volcado estructural de mk2 vive en su propia ruta: /api/diag/mk2

  // Verificación de claves de valoraciones y prueba con una película conocida
  const tmdbToken = process.env.TMDB_READ_TOKEN;
  const tmdbKey   = process.env.TMDB_API_KEY;
  const omdbKey   = process.env.OMDB_API_KEY;
  const tmdbAuth  = tmdbToken || tmdbKey;
  report.ratings_keys = {
    tmdb: tmdbAuth ? '✅ configurada' : '❌ falta TMDB_READ_TOKEN (o TMDB_API_KEY)',
    omdb: omdbKey ? '✅ configurada' : '⚠️  falta OMDB_API_KEY (opcional pero da RT y Metacritic)',
  };
  if (tmdbAuth) {
    try {
      const isJwt = tmdbAuth.startsWith('eyJ');
      const base = `https://api.themoviedb.org/3/search/movie?query=Avengers&language=es-ES&page=1`;
      const testUrl = isJwt ? base : `${base}&api_key=${tmdbAuth}`;
      const testHeaders = isJwt ? { Authorization: `Bearer ${tmdbAuth}` } : {};
      const testRes = await fetch(testUrl, {
        headers: testHeaders,
        signal: AbortSignal.timeout(6000),
      });
      const testData = await testRes.json();
      report.ratings_keys.tmdb_test = testData.results?.length
        ? `✅ TMDB responde — ${testData.results.length} resultados para "Avengers"`
        : `⚠️  TMDB responde pero sin resultados`;
    } catch (e) {
      report.ratings_keys.tmdb_test = `❌ Error TMDB: ${e.message}`;
    }
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
            buyUrl: s.buyUrl ?? null,
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
