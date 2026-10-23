// La conversión del API nuevo de Yelmo (cineyelmo.com, desde el 23-10-2026)
// al formato de la web antigua, que es el que lee lib/cinemas/yelmo.js.
//
// Las películas y los cines son respuestas REALES del API, recogidas por el
// móvil (scripts/datos-prueba/yelmo-api-real.json). De los horarios (Billboard)
// aún no se ha visto ninguna respuesta —todas daban 401 en la exploración—,
// así que van con la forma exacta de la consulta de su web y valores
// razonables; cuando el móvil traiga una de verdad, conviene copiarla aquí.
import { readFileSync } from 'node:fs';
import {
  aFormatoAntiguo, cabecerasCopiables, CINES, diaDe, enMadrid, esVOSE, fichaAntigua, fusionar, nombreFormato, respuestaGraphQL,
} from './movil/recolector-navegador.mjs';
import { leerInstantanea } from '../lib/cinemas/yelmo.js';

let fallos = 0;
const ok = (m) => console.log('ok    ' + m);
const mal = (m) => { fallos++; console.log('FALLO ' + m); };
const es = (cond, m, detalle = '') => (cond ? ok(m) : mal(`${m}${detalle ? ` — ${detalle}` : ''}`));

const real = JSON.parse(readFileSync(new URL('./datos-prueba/yelmo-api-real.json', import.meta.url), 'utf8'));
const pelis = Object.fromEntries([...real.moviesNowPlaying.nodos, ...real.moviesComingSoon.nodos].map((n) => [n.id, n]));
const dia = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(Date.now() + n * 86400000));
const dma = (iso) => iso.split('-').reverse().join('/');

// ── Nuestros cines, según la respuesta real de Cities ─────────────────────
for (const [id, c] of Object.entries(CINES)) {
  const r = real.ciudadCadiz.cinemas.find((x) => x.id === c.api);
  es(r && r.vistaId === c.vista, `${id} es «${c.api}» (Vista ${c.vista}) en el API nuevo`, JSON.stringify(r));
}

// ── Ficha de película, desde un nodo real de Movies ────────────────────────
const clay = fichaAntigua(pelis.clayface, '2026-10-23');
es(clay.Title === 'Clayface' && clay.RunTime === '108' && clay.Rating === 'M-16' && clay.Gender === 'TERROR',
  'ficha: título, duración (de "108 min"), calificación y primer género', JSON.stringify(clay).slice(0, 200));
es(/^https:\/\/pimcore-content\.cinepolis\.com\/assets\/Espa%C3%B1a\/Tickets\/Movies\/Clayface\/Es\/720x1022/.test(clay.Poster ?? ''),
  'ficha: el cartel es el "poster" grande (720×1022), con la URL codificada', clay.Poster);
es(clay.Synopsis?.startsWith('El descenso espeluznante'), 'ficha: sinopsis');
es(clay.Status === 'Estreno' && fichaAntigua(pelis.clayface, '2026-11-10').Status === '',
  'ficha: «Estreno» la semana de su estreno (22-10), y después ya no');
es(fichaAntigua(pelis['bts-world-tour-arirang-in-buenos-aires-live-viewing'], '2026-10-23').Status === 'Venta Anticipada',
  'ficha: una con la etiqueta «Preventa» que aún no se ha estrenado es «Venta Anticipada»');

// ── Fechas y horas ────────────────────────────────────────────────────────
const em = (v) => JSON.stringify(enMadrid(v));
es(em('2026-10-23T18:15:00') === '{"dia":"2026-10-23","hora":"18:15"}', 'hora sin zona: tal cual (se pide con timezone Europe/Madrid)');
es(em('2026-10-23T16:15:00Z') === '{"dia":"2026-10-23","hora":"18:15"}', 'hora en UTC: a la de Madrid (verano, +2)', em('2026-10-23T16:15:00Z'));
es(em('2026-11-02T23:30:00Z') === '{"dia":"2026-11-03","hora":"00:30"}', 'hora en UTC que en Madrid ya es el día siguiente (invierno, +1)');
es(em('2026-10-23T18:15:00+02:00') === '{"dia":"2026-10-23","hora":"18:15"}' && em('23/10/2026 18:15') === '{"dia":"2026-10-23","hora":"18:15"}',
  'también con desfase explícito y en DD/MM/AAAA');
es(enMadrid('2026-10-23')?.dia === '2026-10-23' && enMadrid('') === null && enMadrid('mañana') === null, 'un día suelto vale; lo que no se entiende, null');

// ── Formatos e idiomas ────────────────────────────────────────────────────
const f = (a, b) => nombreFormato(a && { name: a }, b && { name: b });
es(f('2D', 'PREM') === 'PREMIUM' && f('3D', 'PREM') === '3D PREMIUM' && f('2D', null) === '2D' && f('2D', '2D') === '2D'
  && f('3D', null) === '3D' && f('2D', 'DolbyAtmos') === 'DOLBY ATMOS' && f(null, null) === '2D' && f('2D', '4DE') === '4DE',
  'formato como en la web antigua: "PREMIUM", "3D PREMIUM", "2D"…', [f('2D', 'PREM'), f('3D', 'PREM'), f('2D', 'DolbyAtmos')].join(' / '));
es(esVOSE('SUB ESP', 'SUB ESP') && esVOSE('COR', 'COR') && esVOSE('en', 'Inglés subtitulado') && esVOSE('es', 'VOSE') && esVOSE('ja', '') && esVOSE('', 'Versión original')
  && !esVOSE('es', 'Español') && !esVOSE('', 'Castellano') && !esVOSE('ca', 'Català') && !esVOSE('', ''),
  'VOSE: por el texto o por un idioma que no es español; el doblaje, no');

// ── Cabeceras: se copian las de la web, nunca las del navegador ───────────
const c = cabecerasCopiables({ 'Content-Type': 'application/json', 'x-api-key': 'k', authorization: 'Bearer t', accept: '*/*',
  cookie: 'a=b', 'user-agent': 'x', 'sec-ch-ua': 'y', 'content-length': '9', host: 'h', origin: 'o', referer: 'r', 'accept-language': 'es',
  'x-rara': 'con\nsalto' });
es(JSON.stringify(Object.keys(c).sort()) === '["accept","authorization","content-type","x-api-key"]',
  'cabeceras: las propias de la web sí; cookies, User-Agent, sec-*, longitud, host, origen… no', Object.keys(c).join(', '));

// ── Respuestas del API ────────────────────────────────────────────────────
const falla = (r) => { try { respuestaGraphQL(r, 'x'); return null; } catch (e) { return e; } };
const e401 = falla({ status: 401, texto: '{ "message":"Unauthorized access.", "internal_status_code":1 }' });
const e403 = falla({ status: 403, texto: '<title>Attention Required! | Cloudflare</title>' });
es(e401?.estado === 401 && e403?.estado === 403 && /Cloudflare/.test(e403.message), '401 y 403 se distinguen; el 403 dice Cloudflare');
es(falla({ status: 200, texto: '{"errors":[{"message":"Cinema not found"}],"data":{"billboard":null}}' })?.message.includes('Cinema not found')
  && respuestaGraphQL({ status: 200, texto: '{"data":{"billboard":{"dates":[]}}}' }).billboard,
  'un error de GraphQL sin datos es un fallo; con datos, se usan');

// ── Horarios → formato antiguo → lo que enseña la web ─────────────────────
const HOY = dia(0), MANANA = dia(1);
const sesion = (id, cuando, extra = {}) => ({ format: { icon: '', name: '2D' }, sessionId: id, datetime: cuando, screen: '7',
  experience: null, movieVistaId: 'HO00001717', cinemaVistaId: '1340', alerts: [], availability: 'Available', isAllocatedSeating: true, ...extra });
const horarios = [
  { movieId: 'clayface', billboard: { dates: [HOY, MANANA], schedules: [
    { cinemaId: 'premium-bahia-sur-cadiz', cityId: 'cadiz', movieId: 'clayface', dates: [
      { date: HOY, languages: [
        { language: 'es', displayLanguage: 'Español', showtimes: [
          sesion('24219', `${HOY}T22:45:00`, { experience: { icon: '', name: 'PREM' } }),
          sesion('24217', `${HOY}T18:15:00`, { experience: { icon: '', name: 'PREM' } }),
          // De madrugada: sigue en el día en que la anuncia el cine.
          sesion('24299', `${MANANA}T00:30:00`, { experience: { icon: '', name: 'PREM' } }),
        ] },
        { language: 'en', displayLanguage: 'Inglés subtitulado', showtimes: [
          sesion('24230', `${HOY}T20:00:00`, { experience: { icon: '', name: 'PREM' }, screen: '3' })] },
      ] },
      { date: MANANA, languages: [{ language: 'es', displayLanguage: 'Español', showtimes: [
        sesion('24310', `${MANANA}T17:00:00`, { format: { icon: '', name: '3D' }, experience: { icon: '', name: 'PREM' } })] }] },
    ] },
    { cinemaId: 'area-sur-cadiz', cityId: 'cadiz', movieId: 'clayface', dates: [
      { date: HOY, languages: [{ language: 'es', displayLanguage: 'Español', showtimes: [
        sesion('37952', `${HOY}T18:45:00`, { cinemaVistaId: '803', screen: '8' }), sesion('roto', 'cuando sea')] }] },
    ] },
    { cinemaId: 'premium-puerta-europa-cadiz', cityId: 'cadiz', movieId: 'clayface', dates: [] },
  ] } },
  { movieId: 'superthings-la-pelicula', billboard: { dates: [HOY], schedules: [
    { cinemaId: 'area-sur-cadiz', cityId: 'cadiz', movieId: 'superthings-la-pelicula', dates: [
      { date: HOY, languages: [{ language: 'es', displayLanguage: 'Español', showtimes: [
        sesion('37960', `${HOY}T16:00:00`, { cinemaVistaId: '803', screen: '2' })] }] }] },
  ] } },
];
const { cines, vistos } = aFormatoAntiguo(pelis, horarios);
const bs = cines['yelmo-bahia-sur'], j = cines['yelmo-jerez'];
es(bs?.VistaId === '1340' && j?.VistaId === '803' && bs.Key === 'premium-bahia-sur-cadiz', 'cada cine con su número de Vista');
es(bs?.Dates.map(diaDe).join() === `${HOY},${MANANA}` && j?.Dates.map(diaDe).join() === HOY,
  'un bloque por día de cartelera, y diaDe() (el de la fusión) lo entiende', bs?.Dates.map(diaDe).join());
const pase = bs.Dates[0].Movies[0].Formats.find((x) => x.Language === 'ESPAÑOL').Showtimes;
es(pase.map((s) => s.Time).join() === '18:15,22:45,00:30' && pase[2].TimeFilter === `${dma(HOY)} 00:30:00`,
  'sesiones en orden, y la de madrugada se queda en su día de cartelera', pase.map((s) => `${s.Time} ${s.TimeFilter}`).join(' | '));
es(pase[0].ShowtimeId === '24217' && pase[0].Screen === 7 && pase[0].TimeFilter === `${dma(HOY)} 18:15:00`,
  'cada sesión: su id de Vista (para comprar), la sala y el TimeFilter de siempre');
es(vistos.sesiones === 7 && vistos.descartadas === 1 && vistos.ajenas === 1,
  'se apunta lo descartado (una hora que no se entiende, un cine que no es nuestro)', JSON.stringify({ ...vistos, idiomas: 0, formatos: 0 }));
es(j.Dates[0].Movies.map((m) => m.Title).join() === 'Clayface,Superthings: La película',
  'las películas de cada día, en el orden de la cartelera de Yelmo');

// Y lo que hace la web con ello (lib/cinemas/yelmo.js, sin tocar).
const web = leerInstantanea('yelmo-bahia-sur', { generatedAt: new Date().toISOString(), cines });
const hoyWeb = web?.[HOY]?.[0];
es(hoyWeb?.title === 'Clayface' && hoyWeb.durationMin === 108 && hoyWeb.ageRating === 'M-16' && hoyWeb.genre === 'TERROR'
  && hoyWeb.posterUrl === clay.Poster && hoyWeb.synopsis?.startsWith('El descenso'),
  'la web lee la ficha: título, duración, edad, género, cartel y sinopsis', JSON.stringify(hoyWeb ?? null).slice(0, 200));
const s1815 = hoyWeb?.sessions.find((s) => s.time === '18:15');
es(s1815?.format === 'PREMIUM' && s1815.language === 'VE' && s1815.room === '7'
  && s1815.buyUrl === 'https://compra.yelmocines.es/?cinemaVistaId=1340&showtimeVistaId=24217'
  && JSON.stringify(s1815.enlaceCampos) === '{"sesion":"24217","cineVista":"1340"}',
  'la web lee la sesión: formato, idioma, sala y enlace de compra', JSON.stringify(s1815));
es(hoyWeb?.sessions.find((s) => s.time === '20:00')?.language === 'VOSE', 'la web marca la VOSE');
es(web?.[MANANA]?.[0]?.sessions[0]?.format === '3D PREMIUM', 'y el 3D');
const jw = leerInstantanea('yelmo-jerez', { generatedAt: new Date().toISOString(), cines });
es(jw?.[HOY]?.find((m) => m.title === 'Clayface')?.sessions[0]?.buyUrl === 'https://compra.yelmocines.es/?cinemaVistaId=803&showtimeVistaId=37952',
  'Área Sur con su propio número de Vista en el enlace');

// La fusión con una instantánea de la web ANTIGUA (la que hay publicada el
// día del cambio): los días que la nueva trae mandan, los demás se conservan.
const vieja = { generatedAt: new Date(Date.now() - 3600e3).toISOString(), cines: { 'yelmo-bahia-sur': { Key: 'premium-bahia-sur', VistaId: '1340', Id: 74, Dates: [
  { Movies: [{ Title: 'Vieja de hoy', Formats: [{ Name: 'PREMIUM', Language: 'ESPAÑOL', Showtimes: [{ Time: '17:00', ShowtimeId: '1', TimeFilter: `${dma(HOY)} 22:30:00` }] }] }] },
  { Movies: [{ Title: 'Vieja de pasado mañana', Formats: [{ Name: 'PREMIUM', Language: 'ESPAÑOL', Showtimes: [{ Time: '17:00', ShowtimeId: '2', TimeFilter: `${dma(dia(2))} 22:30:00` }] }] }] },
] } } };
const fus = fusionar(vieja, { cines }).cines['yelmo-bahia-sur'];
es(fus.Dates.map(diaDe).join() === `${HOY},${MANANA},${dia(2)}` && fus.Dates[0].Movies[0].Title === 'Clayface'
  && fus.Dates[2].Movies[0].Title === 'Vieja de pasado mañana' && fus.VistaId === '1340',
  'fusión con la instantánea antigua: manda lo nuevo y se conserva el día que no trae', fus.Dates.map((d) => `${diaDe(d)}:${d.Movies[0].Title}`).join(' | '));

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
