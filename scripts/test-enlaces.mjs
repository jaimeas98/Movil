// Comprueba los enlaces de compra con plantilla (lib/cinemas/enlaces.js):
//
//  · cada adaptador da a sus sesiones los campos justos (enlaceCampos)
//  · una plantilla guardada manda sobre el formato del adaptador, y si a una
//    sesión le falta un campo se queda con el enlace de siempre
//  · la DEDUCCIÓN: con los campos de una sesión y su enlace bueno pegado,
//    sale la plantilla, y aplicada a esa sesión da exactamente ese enlace.
//    Con el formato real de Arte Siete, uno nuevo plausible, Yelmo y mk2.
//  · las peticiones de comprobación no sirven para llamar a sitios internos
//  · la web pública no carga con los campos
//
// Y las regresiones de la revisión de seguridad del 17-10-2026:
//  H1 una plantilla (o un campo) no puede mandar los enlaces a otra web
//  M1 ninguna petición de prueba sale de los dominios del cine (SSRF)
//  M3 un `javascript:` de un cine nunca llega a ser un enlace
//  L2 "constructor", "__proto__"… no valen como cine ni como filtro
//  L6 la respuesta pública no lleva de dónde salen los datos de cada cine
//
//   node scripts/test-enlaces.mjs
import {
  aplicarPlantillas, analizarPlantilla, camposDeEnlace, camposMk2, comprobarEnlace, deducirPlantilla, ORIGINALES,
  enlaceDelCine, hostDelCine, HOSTS_POR_CINE, plantillaDe, renderizar, sinCamposDeEnlace, usarPlantillas, validarPlantilla,
} from '../lib/cinemas/enlaces.js';
import { leerInstantanea } from '../lib/cinemas/yelmo.js';
import { leerDatosEnlaces, escribirDatosEnlaces, sesionesDe } from '../lib/panel/enlaces.js';

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'FALLO'} ${m}`); if (!c) fallos++; };
const igual = (a, b, m) => ok(a === b, `${m}${a === b ? '' : `\n        esperaba ${b}\n        y sale   ${a}`}`);

// ── Campos de cada adaptador ──────────────────────────────────────────────
// Arte Siete: el HTML de verdad trae las sesiones en un atributo.
const sesionAS = {
  diacompleto: '17/10/2026', Hora: '15:50:00', Titulo: 'BOIUNA. LA LEYENDA DEL AMAZONAS', ID_Pase: 38064,
  ID_Espectaculo: 19390, NombreFormato: 'Laser', NombreSala: 'Sala 01', Duracion: 96,
};
const otraAS = { ...sesionAS, Hora: '18:00:00', Titulo: 'LA BOLA NEGRA', ID_Pase: 38070, ID_Espectaculo: 19401 };
const html = `<div fullsessionsinfo='${JSON.stringify([sesionAS, otraAS]).replace(/"/g, '&quot;')}'></div>`;
const fetchReal = globalThis.fetch;
globalThis.fetch = async () => new Response(html, { status: 200 });
const { fetchArteSiete } = await import('../lib/cinemas/artesiete.js');
const as = await fetchArteSiete();
globalThis.fetch = fetchReal;
const s0 = as['2026-10-17'].find((m) => m.title.startsWith('Boiuna')).sessions[0];
ok(JSON.stringify(s0.enlaceCampos) === JSON.stringify({ pase: '38064', espectaculo: '19390', titulo: 'BOIUNA. LA LEYENDA DEL AMAZONAS' }),
  `Arte Siete: campos pase, espectaculo y título tal cual (${JSON.stringify(s0.enlaceCampos)})`);
const enlaceAS = 'https://bahia.artesiete.es/Session/33/ARTESIETE%20BAHIA/38064/BOIUNA.%20LA%20LEYENDA%20DEL%20AMAZONAS/19390';
igual(s0.buyUrl, enlaceAS, 'Arte Siete: el enlace del adaptador no cambia');
igual(renderizar(ORIGINALES['arte-siete-puerto'], s0.enlaceCampos), enlaceAS, 'Arte Siete: su formato escrito como plantilla da lo mismo que el adaptador');

// Yelmo: la instantánea del móvil.
const instantanea = {
  generatedAt: new Date().toISOString(),
  cines: { 'yelmo-bahia-sur': { VistaId: 1340, Dates: [{ Movies: [{ Title: 'Peli', Formats: [{ Name: '2D', Language: 'Español',
    Showtimes: [{ Time: '20:00', ShowtimeId: '23454', TimeFilter: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid' }).format(new Date()) + ' 22:30:00' }] }] }] }] } },
};
const y = leerInstantanea('yelmo-bahia-sur', instantanea);
const sy = Object.values(y)[0][0].sessions[0];
ok(sy.enlaceCampos?.sesion === '23454' && sy.enlaceCampos?.cineVista === '1340', `Yelmo: campos sesion y cineVista (${JSON.stringify(sy.enlaceCampos)})`);
igual(renderizar(ORIGINALES['yelmo-bahia-sur'], sy.enlaceCampos), sy.buyUrl, 'Yelmo: su formato como plantilla da lo mismo que el adaptador');
ok(y.origen === 'movil' && Number.isFinite(y.datosDe) && !Object.keys(y).includes('origen'), 'Yelmo: la instantánea dice que viene del móvil (sin ensuciar los días)');

// mk2: los ids van dentro de su enlace.
const enlaceMk2 = 'https://cine.entradas.com/cine/cadiz/cinesur-bahia-de-cadiz/evento/111777/la-bola-negra';
ok(JSON.stringify(camposMk2(enlaceMk2)) === '{"evento":"111777","pelicula":"la-bola-negra"}', 'mk2: evento y película sacados de su enlace');
ok(JSON.stringify(camposMk2('https://www.mk2cines.es/es/comprar?x=1')) === '{"enlace":"https://www.mk2cines.es/es/comprar?x=1"}', 'mk2: sin ids, el enlace entero');
igual(renderizar(ORIGINALES['cinesur-bahia-cadiz'], camposMk2(enlaceMk2)), enlaceMk2, 'mk2: su formato como plantilla da lo mismo');

// ── Plantillas ────────────────────────────────────────────────────────────
igual(renderizar('https://x.es/{titulo|slug}/{titulo|mayus|url}?q={titulo|url+}', { titulo: 'La Bola Negra' }),
  'https://x.es/la-bola-negra/LA%20BOLA%20NEGRA?q=La+Bola+Negra', 'filtros slug, mayus|url y url+');
ok(renderizar('https://x.es/{pase}/{falta}', { pase: '1' }) === null, 'a una sesión le falta un campo: no hay enlace con esa plantilla');
ok(analizarPlantilla('https://x.es/{pase|raro}').error?.includes('raro'), 'un filtro desconocido se rechaza');
ok(analizarPlantilla('https://x.es/{pase}}').error, 'una llave suelta se rechaza');
ok(!validarPlantilla('https://x.es/{sesion}', 'arte-siete-puerto').ok, 'un campo de otro cine no vale');
ok(!validarPlantilla('javascript:alert({pase})', 'arte-siete-puerto').ok, 'javascript: no vale');
ok(!validarPlantilla('{pase}', 'arte-siete-puerto').ok, 'tiene que empezar por https:// y un dominio');
ok(!validarPlantilla('https://bahia.artesiete.es/"{pase}', 'arte-siete-puerto').ok, 'sin comillas ni espacios');
ok(!validarPlantilla('https://bahia.artesiete.es/' + 'a'.repeat(1000), 'arte-siete-puerto').ok, 'con longitud máxima');
ok(!validarPlantilla('https://bahia.artesiete.es/{pase}', 'cine-inventado').ok, 'cine desconocido');
ok(validarPlantilla('https://entradas.artesiete.es/bahia/{pase}', 'arte-siete-puerto').ok, 'un subdominio del cine sí (por si cambia de formato)');

// H1: a ninguna otra web, ni por la plantilla ni por un campo.
for (const [cine, p] of [
  ['arte-siete-puerto', 'https://pago-entradas-artesiete.example/checkout?s={pase}&t={titulo|url}'],
  ['arte-siete-puerto', 'https://bahia.artesiete.es@evil.example/{pase}'],
  ['arte-siete-puerto', 'https://bahia.artesiete.es{titulo}'],
  ['arte-siete-puerto', 'https://bahia.artesiete.es.evil.example/{pase}'],
  ['arte-siete-puerto', 'https://bahia.artesiete.es:8443/{pase}'],
  ['arte-siete-puerto', 'https://falsoartesiete.es/{pase}'],
  ['arte-siete-puerto', 'http://bahia.artesiete.es/{pase}'],
  ['arte-siete-puerto', 'https://x{pase}'],
  ['arte-siete-puerto', 'https://compra.yelmocines.es/{pase}'],
  ['cinesur-bahia-cadiz', '{enlace}'],
  ['cinesur-bahia-cadiz', '{enlace|minus}'],
  ['cinesur-bahia-cadiz', '{enlace}?ref=x'],
  ['cinesur-bahia-cadiz', 'javascript:alert({evento})'],
]) {
  if (validarPlantilla(p, cine).ok) ok(false, `H1: acepta ${p} para ${cine}`);
}
ok(true, 'H1: plantillas a otra web, con usuario, sin barra, con puerto, http, otro cine o empezando por un hueco: no');
ok(!enlaceDelCine('https://bahia.artesiete.es@evil.example/x', 'arte-siete-puerto') && !enlaceDelCine('https://bahia.artesiete.es./x', 'arte-siete-puerto')
  && !enlaceDelCine('https://bahia.artesiete.es\\@evil.example/', 'arte-siete-puerto') && !enlaceDelCine('https://bahia.artesiete.es/a b', 'arte-siete-puerto')
  && enlaceDelCine('https://bahia.artesiete.es/Session/1', 'arte-siete-puerto') && enlaceDelCine('https://cine.entradas.com/x', 'cinesur-bahia-cadiz')
  && !enlaceDelCine('https://cine.entradas.com/x', 'arte-siete-puerto'), 'H1: enlaceDelCine solo deja https a un dominio del propio cine');
ok(HOSTS_POR_CINE['cinesur-bahia-cadiz'].includes('entradas.com') && hostDelCine('cine.entradas.com', 'cinesur-bahia-cadiz')
  && hostDelCine('bahia.artesiete.es', 'arte-siete-puerto') && hostDelCine('compra.yelmocines.es', 'yelmo-jerez'), 'los dominios de hoy (de los enlaces reales) están en la lista');

// Aplicar a una cartelera: manda la plantilla; si falta un campo, la de siempre.
const plantillaNueva = 'https://bahia.artesiete.es/compra/sesion/{pase}?pelicula={titulo|slug}&e={espectaculo}';
usarPlantillas({ plantillas: { 'arte-siete-puerto': { plantilla: plantillaNueva } } });
const sinTitulo = { time: '22:00', buyUrl: 'https://bahia.artesiete.es/viejo/1', enlaceCampos: { pase: '1', espectaculo: '2' } };
const sinCampos = { time: '23:00', buyUrl: 'https://bahia.artesiete.es/viejo/2' };
const byDate = { '2026-10-17': [{ id: 'boiuna', sessions: [s0, sinTitulo, sinCampos] }] };
aplicarPlantillas('arte-siete-puerto', byDate);
igual(s0.buyUrl, 'https://bahia.artesiete.es/compra/sesion/38064?pelicula=boiuna-la-leyenda-del-amazonas&e=19390', 'con plantilla guardada, la cartelera usa la nueva');
igual(s0.enlaceAdaptador, enlaceAS, 'y guarda el del adaptador para poder volver');
igual(sinTitulo.buyUrl, 'https://bahia.artesiete.es/viejo/1', 'a una sesión que no tiene todos los campos no se le estropea el enlace');
igual(sinCampos.buyUrl, 'https://bahia.artesiete.es/viejo/2', 'ni a una sin campos');
aplicarPlantillas('arte-siete-puerto', byDate);
igual(s0.buyUrl, 'https://bahia.artesiete.es/compra/sesion/38064?pelicula=boiuna-la-leyenda-del-amazonas&e=19390', 'aplicarla dos veces da lo mismo');
usarPlantillas({ plantillas: {} });
aplicarPlantillas('arte-siete-puerto', byDate);
igual(s0.buyUrl, enlaceAS, 'sin plantilla, vuelve al formato original');
usarPlantillas({ plantillas: { 'arte-siete-puerto': { plantilla: 'javascript:{pase}' } } });
ok(plantillaDe('arte-siete-puerto') === null, 'una plantilla guardada que no valida se ignora');
usarPlantillas(null);

// H1: un CAMPO tampoco puede cambiar a dónde lleva. Con una plantilla buena,
// un título que traiga "@evil.example/" o lo que sea se queda en la ruta, y
// si aun así el resultado no fuera de la web del cine, se usa el del adaptador.
usarPlantillas({ plantillas: { 'arte-siete-puerto': { plantilla: 'https://bahia.artesiete.es/c/{titulo}' } } });
const trampa = { time: '20:00', buyUrl: enlaceAS, enlaceCampos: { titulo: '@evil.example/x', pase: '1', espectaculo: '2' } };
const trampa2 = { time: '21:00', buyUrl: enlaceAS, enlaceCampos: { titulo: '../\\evil', pase: '1', espectaculo: '2' } };
aplicarPlantillas('arte-siete-puerto', { d: [{ id: 'x', sessions: [trampa, trampa2] }] });
ok(new URL(trampa.buyUrl).hostname === 'bahia.artesiete.es' && new URL(trampa2.buyUrl).hostname === 'bahia.artesiete.es', `H1: un campo no cambia el dominio (${trampa.buyUrl} · ${trampa2.buyUrl})`);
// Y una plantilla que se colara en data/enlaces.js sin validar: la de fuera no sale.
const fuera = { time: '20:00', buyUrl: enlaceAS, enlaceCampos: { pase: '1' } };
aplicarPlantillas('arte-siete-puerto', { d: [{ id: 'x', sessions: [fuera] }] }, { plantillas: { 'arte-siete-puerto': { plantilla: 'https://evil.example/{pase}' } } });
igual(fuera.buyUrl, enlaceAS, 'H1: una plantilla a otra web guardada a mano se ignora');
usarPlantillas(null);

// M3: un href `javascript:` de la web de mk2 (con el nombre del cine dentro).
const js = 'javascript:fetch(`/api/panel/orden`)//cinesur-bahia-de-cadiz';
ok(camposMk2(js) === null, 'M3: un javascript: no da campos (ni {enlace})');
const ses = { time: '20:00', buyUrl: js, enlaceCampos: { enlace: js } };
const ses2 = { time: '21:00', buyUrl: 'http://cine.entradas.com/evento/1/x' };
aplicarPlantillas('cinesur-bahia-cadiz', { d: [{ id: 'x', sessions: [ses, ses2] }] }, { plantillas: { 'cinesur-bahia-cadiz': { plantilla: '{enlace}' } } });
ok(ses.buyUrl === null && ses2.buyUrl === null, 'M3: ni con una plantilla {enlace}: un enlace que no es https de su taquilla no sale en la web');

// L2: claves heredadas.
for (const c of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
  if (validarPlantilla('https://bahia.artesiete.es/{pase}', c).ok || plantillaDe(c, { plantillas: {} }) !== null) ok(false, `L2: acepta el cine ${c}`);
}
ok(analizarPlantilla('https://bahia.artesiete.es/{pase|constructor}').error && analizarPlantilla('https://bahia.artesiete.es/{pase|toString}').error, 'L2: ni como filtro');
ok(renderizar('https://bahia.artesiete.es/{constructor}', {}) === null, 'L2: ni como campo');
const leidos = leerDatosEnlaces('export default {"plantillas":{"constructor":{"plantilla":"https://evil.example/"},"__proto__":{"plantilla":"x"},"arte-siete-puerto":{"plantilla":"https://bahia.artesiete.es/{pase}"}}};').plantillas;
ok(!Object.hasOwn(leidos, 'constructor') && !Object.hasOwn(leidos, '__proto__') && leidos['arte-siete-puerto']?.plantilla, 'L2: data/enlaces.js no conserva cines inventados');

// Una copia vieja del móvil (sin campos): se sacan del enlace de siempre.
usarPlantillas({ plantillas: { 'arte-siete-puerto': { plantilla: plantillaNueva } } });
const vieja = { time: '19:00', buyUrl: enlaceAS };
aplicarPlantillas('arte-siete-puerto', { d: [{ id: 'x', sessions: [vieja] }] });
igual(vieja.buyUrl, 'https://bahia.artesiete.es/compra/sesion/38064?pelicula=boiuna-la-leyenda-del-amazonas&e=19390',
  'una sesión de una copia vieja (sin campos) también usa la plantilla: los campos salen de su enlace');
ok(JSON.stringify(camposDeEnlace('yelmo-jerez', 'https://compra.yelmocines.es/?cinemaVistaId=803&showtimeVistaId=32455')) === '{"sesion":"32455","cineVista":"803"}', 'lo mismo con Yelmo');
ok(camposDeEnlace('arte-siete-puerto', 'https://otra.web/x') === null, 'y un enlace con otra forma no da campos');
usarPlantillas(null);

const publico = JSON.parse(JSON.stringify({ cinemas: [{ id: 'arte-siete-puerto', liveDates: [], origen: 'movil', datosDe: 1, diasCompletados: 2, byDate }] }, sinCamposDeEnlace));
const sp = publico.cinemas[0].byDate['2026-10-17'][0].sessions[0];
ok(sp.buyUrl && !('enlaceCampos' in sp) && !('enlaceAdaptador' in sp), 'la respuesta pública de la cartelera no lleva los campos');
const c0 = publico.cinemas[0];
ok(!('origen' in c0) && !('datosDe' in c0) && !('diasCompletados' in c0) && c0.id === 'arte-siete-puerto', 'L6: ni de dónde salen los datos de cada cine');
ok(JSON.parse(JSON.stringify({ x: { origen: 'otro' } }, sinCamposDeEnlace)).x.origen === 'otro', 'L6: un «origen» que no es del cine no se toca');

// ── Deducción ─────────────────────────────────────────────────────────────
const camposAS = s0.enlaceCampos;
const ordenAS = ['pase', 'espectaculo', 'titulo'];
function deduce(m, enlace, campos, orden, esperada) {
  const r = deducirPlantilla(enlace, campos, orden);
  ok(r.plantilla === esperada && r.igual && r.renderizado === enlace,
    `${m}\n        ${r.plantilla}${r.plantilla === esperada ? '' : `\n        esperaba ${esperada}`}`);
  return r;
}
deduce('Arte Siete, formato de hoy: sale exactamente su plantilla original', enlaceAS, camposAS, ordenAS, ORIGINALES['arte-siete-puerto']);
deduce('Arte Siete, un formato nuevo plausible (slug y parámetros)',
  'https://bahia.artesiete.es/compra/sesion/38064?pelicula=boiuna-la-leyenda-del-amazonas&e=19390', camposAS, ordenAS, plantillaNueva);
deduce('Arte Siete, otro: título en minúsculas codificado y espacios como +',
  'https://entradas.artesiete.es/bahia/38064/19390?t=boiuna.+la+leyenda+del+amazonas', camposAS, ordenAS,
  'https://entradas.artesiete.es/bahia/{pase}/{espectaculo}?t={titulo|minus|url+}');
const r33 = deduce('Arte Siete: el 33 del centro no se confunde con nada, y lo que no sale en el enlace se avisa',
  'https://bahia.artesiete.es/Session/33/38064', camposAS, ordenAS, 'https://bahia.artesiete.es/Session/33/{pase}');
ok(r33.sinUsar.join() === 'espectaculo,titulo' && r33.avisos.some((a) => a.includes('No aparece')), `  avisos: ${r33.avisos.join(' | ')}`);
const camposY = { sesion: '23454', cineVista: '1340' };
deduce('Yelmo, formato de hoy', 'https://compra.yelmocines.es/?cinemaVistaId=1340&showtimeVistaId=23454', camposY, ['sesion', 'cineVista'],
  ORIGINALES['yelmo-bahia-sur']);
deduce('Yelmo, uno nuevo con la sesión en la ruta', 'https://compra.yelmocines.es/sesion/23454/butacas?cine=1340', camposY, ['sesion', 'cineVista'],
  'https://compra.yelmocines.es/sesion/{sesion}/butacas?cine={cineVista}');
deduce('mk2, formato de hoy', enlaceMk2, camposMk2(enlaceMk2), ['evento', 'pelicula', 'enlace'], ORIGINALES['cinesur-bahia-cadiz']);
deduce('mk2, si su taquilla cambia de sitio', 'https://www.mk2cines.es/es/entradas?evento=111777&slug=la-bola-negra', camposMk2(enlaceMk2),
  ['evento', 'pelicula', 'enlace'], 'https://www.mk2cines.es/es/entradas?evento={evento}&slug={pelicula}');
deduce('mk2 sin ids: el enlace entero como campo', 'https://www.mk2cines.es/es/comprar?x=1&utm=panel', { enlace: 'https://www.mk2cines.es/es/comprar?x=1' },
  ['evento', 'pelicula', 'enlace'], '{enlace}&utm=panel');
ok(!validarPlantilla('{enlace}&utm=panel', 'cinesur-bahia-cadiz').ok, '  …pero esa plantilla no se puede guardar: no empieza por https://<dominio>/ (H1)');
const nada = deducirPlantilla('https://bahia.artesiete.es/', camposAS, ordenAS);
ok(nada.plantilla === 'https://bahia.artesiete.es/' && nada.avisos.some((a) => a.includes('ningún campo')), 'un enlace sin ningún campo se avisa (todas irían al mismo sitio)');
const corto = deducirPlantilla('https://x.es/a/12345/b', { pase: '1234', espectaculo: '12345' }, ['pase', 'espectaculo']);
igual(corto.plantilla, 'https://x.es/a/{espectaculo}/b', 'un número corto no se come un trozo de otro más largo');
const borde = deducirPlantilla('https://x.es/a/9381/b?id=38', { pase: '38', espectaculo: '1' }, ['pase', 'espectaculo']);
igual(borde.plantilla, 'https://x.es/a/9381/b?id={pase}', 'ni se busca dentro de otro número');
ok(deducirPlantilla('https://x.es/{a}', camposAS).error, 'un enlace con llaves no se usa');

// ── Comprobar enlaces: solo a la web del cine (M1) ────────────────────────
const respuesta = (status, headers = {}) => ({ status, headers: new Headers(headers), body: null });
let pedidas = [];
const simulado = (mapa) => async (url) => {
  pedidas.push(url);
  const r = mapa[url];
  if (!r) throw new Error('sin red');
  return r;
};
const AS = 'arte-siete-puerto';
const URL1 = 'https://bahia.artesiete.es/Session/1';
for (const malo of ['http://localhost./', 'http://127.0.0.1.nip.io/', 'http://169.254.169.254.nip.io/latest/meta-data/', 'http://0x7f000001/',
  'http://2130706433/', 'http://[::1]/', 'http://metadata.google.internal./', 'https://localtest.me/', 'http://interno.atacante-rebind.example/x',
  'https://bahia.artesiete.es.nip.io/', 'https://bahia.artesiete.es@127.0.0.1/', 'https://bahia.artesiete.es:8443/', 'http://bahia.artesiete.es/', 'javascript:alert(1)']) {
  const r = await comprobarEnlace(malo, { cineId: AS, fetchImpl: simulado({}) });
  if (r.ok !== false || !/no se pide/.test(r.motivo)) ok(false, `M1: pide ${malo}`);
}
const sinCine = await comprobarEnlace(URL1, { fetchImpl: simulado({}) });
ok(pedidas.length === 0 && sinCine.ok === false, 'M1: nip.io, localhost., metadatos, rebinding, IPs, puertos, http o sin decir el cine: no se pide nada');
let c = await comprobarEnlace(URL1, { cineId: AS, fetchImpl: simulado({ [URL1]: respuesta(200) }) });
ok(c.ok === true && c.estado === 200, 'un 200 es un enlace bueno');
c = await comprobarEnlace(URL1, { cineId: AS, fetchImpl: simulado({ [URL1]: respuesta(302, { location: '/' }), 'https://bahia.artesiete.es/': respuesta(200) }) });
ok(c.ok === false && c.motivo === 'redirige a la portada' && c.final === 'https://bahia.artesiete.es/', 'mandar a la portada es un enlace roto aunque acabe en 200');
c = await comprobarEnlace(URL1, { cineId: AS, fetchImpl: simulado({ [URL1]: respuesta(301, { location: 'https://entradas.artesiete.es/compra/1' }), 'https://entradas.artesiete.es/compra/1': respuesta(200) }) });
ok(c.ok === true && c.final === 'https://entradas.artesiete.es/compra/1', 'sigue redirecciones dentro de la web del cine');
pedidas = [];
c = await comprobarEnlace(URL1, { cineId: AS, fetchImpl: simulado({ [URL1]: respuesta(302, { location: 'http://127.0.0.1/admin' }) }) });
ok(c.ok === false && /fuera de la web del cine/.test(c.motivo) && pedidas.length === 1, 'M1: una redirección hacia dentro no se sigue');
pedidas = [];
c = await comprobarEnlace(URL1, { cineId: AS, fetchImpl: simulado({ [URL1]: respuesta(302, { location: 'https://otra-web.example/' }) }) });
ok(c.ok === false && pedidas.length === 1, 'M1: ni hacia otra web cualquiera');
const bucle = Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`https://bahia.artesiete.es/r${i}`, respuesta(302, { location: `/r${i + 1}` })]));
pedidas = [];
c = await comprobarEnlace('https://bahia.artesiete.es/r0', { cineId: AS, fetchImpl: simulado(bucle) });
ok(c.motivo === 'demasiadas redirecciones' && pedidas.length === 4, `M1: como mucho 3 redirecciones (${pedidas.length} peticiones)`);
c = await comprobarEnlace(URL1, { cineId: AS, fetchImpl: simulado({ [URL1]: respuesta(404) }) });
ok(c.ok === false && c.motivo === 'HTTP 404', 'un 404 es roto');
c = await comprobarEnlace(URL1, { cineId: AS, fetchImpl: simulado({ [URL1]: respuesta(403, { server: 'cloudflare' }) }) });
ok(c.ok === null && /Cloudflare/.test(c.motivo), 'un bloqueo de Cloudflare no se da ni por bueno ni por malo');
c = await comprobarEnlace(URL1, { cineId: AS, tiempoMs: 200, fetchImpl: async (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('abort')))) });
ok(c.ok === false && /no responde/.test(c.motivo), 'una web que no contesta se corta a tiempo');

// ── data/enlaces.js ida y vuelta, y elegir sesiones ───────────────────────
const datos = { plantillas: { 'arte-siete-puerto': { plantilla: plantillaNueva, guardada: '2026-10-17T10:00:00.000Z' } } };
ok(JSON.stringify(leerDatosEnlaces(escribirDatosEnlaces(datos))) === JSON.stringify(datos), 'data/enlaces.js se escribe y se vuelve a leer igual');
ok(JSON.stringify(leerDatosEnlaces('basura')) === '{"plantillas":{}}', 'un data/enlaces.js roto se lee como vacío');
const mod = await import('../data/enlaces.js');
ok(mod.default && typeof mod.default.plantillas === 'object', 'el data/enlaces.js del repositorio se importa');
const cine = { id: 'arte-siete-puerto', byDate: { '2026-10-17': [
  { id: 'a', title: 'A', sessions: [{ time: '16:00', buyUrl: 'u1', enlaceCampos: { pase: '1' } }, { time: '18:00', buyUrl: 'u2', enlaceCampos: { pase: '2' } }] },
  { id: 'b', title: 'B', sessions: [{ time: '17:00', buyUrl: 'u3', enlaceCampos: { pase: '3' } }] },
] } };
const elegidas = sesionesDe(cine, { max: 3 });
ok(elegidas.map((s) => s.campos.pase).join() === '1,3,2', 'para probar se eligen primero películas distintas');
ok(new Set(elegidas.map((s) => s.clave)).size === 3, 'cada sesión tiene su clave');

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas pasan');
process.exit(fallos ? 1 : 0);
