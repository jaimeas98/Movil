// La cartelera junta en una sola entrada la misma película de varios cines.
// Juntar dos películas distintas es mucho peor que dejar la misma dos veces,
// así que aquí se comprueban sobre todo los casos en los que NO debe juntar.
// Títulos sacados de la cartelera real de los cuatro cines.
import {
  esLaMismaPelicula, agruparPeliculas, ordenarPeliculas, minutosDeSesion,
  sesionesEnOrden, franjasPorHora, detallesDeSesion,
  soloEnCines, comunesDelCine, propiosDeSesion, huecosPorMinuto, edadDe,
} from '../lib/cartelera.js';

let fallos = 0;
const ok = (m) => console.log('ok    ' + m);
const mal = (m) => { fallos++; console.log('FALLO ' + m); };
const si = (a, b, extra = {}) =>
  esLaMismaPelicula({ title: a, ...extra.a }, { title: b, ...extra.b })
    ? ok(`junta "${a}" con "${b}"`) : mal(`debería juntar "${a}" con "${b}"`);
const no = (a, b, extra = {}) =>
  !esLaMismaPelicula({ title: a, ...extra.a }, { title: b, ...extra.b })
    ? ok(`separa "${a}" de "${b}"`) : mal(`NO debería juntar "${a}" con "${b}"`);

// Mismo título escrito distinto en cada cine
si('Dune: Parte Tres', 'DUNE: PARTE TRES');
si('Minions & Monsters', 'Minions and Monsters');
si('La invitación.', 'La invitación');
si('Toy Story 5', 'Toy Story 5: La despedida');

// Reestrenos y pases especiales: no son la película nueva
no('Cars 20º Aniversario', 'Cars');
no('The Fast & The Furious 25 aniversario', 'The Fast & The Furious');
no('El apartamento 4K', 'El apartamento');
no('Vengadores: Doomsday (Infinity Vision)', 'Vengadores: Doomsday');
no('Toy Story 5 VOSE', 'Toy Story 5');
// Sagas: otro número es otra película
no('Padre No Hay Más Que Uno 4', 'Padre No Hay Más Que Uno 5');
no('Gladiator III', 'Gladiator II');
no('Misión Imposible: El Capítulo Final', 'Misión Imposible: Sentencia Final');
no('Insidious: Fuera del más allá', 'Insidious');
no('Pesadilla antes de Navidad', 'Pesadilla en Elm Street');
// Mismo título, duraciones incompatibles: montajes distintos
si('Superman: Legado', 'Superman: Legado', { a: { durationMin: 129 }, b: { durationMin: 200 } });
no('Superman Legado', 'Superman: Legado (Montaje del director)', { a: { durationMin: 129 }, b: { durationMin: 180 } });

// ── Agrupado ────────────────────────────────────────────────────────────────
const sesion = (time, extra = {}) => ({ time, format: '2D', language: 'VE', room: 'Sala 1', buyUrl: null, ...extra });
const cines = [
  { id: 'a', short: 'A', movies: [
    { id: 'dune', title: 'DUNE: PARTE TRES', durationMin: 166, sessions: [sesion('22:00'), sesion('17:00')] },
    { id: 'cars', title: 'Cars 20º Aniversario', sessions: [sesion('16:00')] },
    { id: 'tarde', title: 'Noche', sessions: [sesion('00:30')] },
  ] },
  { id: 'b', short: 'B', movies: [
    { id: 'dune', title: 'Dune: Parte Tres', durationMin: 165, genre: 'Ciencia ficción', sessions: [sesion('18:30', { language: 'VOSE' })] },
    { id: 'cars2', title: 'Cars', sessions: [sesion('12:00')] },
    { id: 'vacia', title: 'Sin sesiones', sessions: [] },
  ] },
];
const g = agruparPeliculas(cines);
const dune = g.find((p) => p.clave === 'dune parte tres');
dune && dune.cines.length === 2 ? ok('Dune junta sus dos cines') : mal('Dune debería estar en dos cines');
dune?.title === 'Dune: Parte Tres' ? ok('se enseña el título que no va en mayúsculas') : mal(`título elegido: ${dune?.title}`);
dune?.genre === 'Ciencia ficción' ? ok('completa el género con el de otro cine') : mal('género sin completar');
JSON.stringify(dune?.cines[0].sessions.map((s) => s.time)) === '["17:00","22:00"]' ? ok('sesiones ordenadas por hora') : mal('sesiones sin ordenar');
g.filter((p) => /cars/.test(p.clave)).length === 2 ? ok('el reestreno de Cars queda aparte') : mal('Cars aniversario se ha juntado');
!g.some((p) => p.title === 'Sin sesiones') ? ok('una película sin sesiones no sale') : mal('sale una película sin sesiones');

minutosDeSesion('00:30') === 24 * 60 + 30 ? ok('la madrugada cuenta tras las 24:00') : mal('00:30 debería ir tras las 23:59');
minutosDeSesion('17:05') === 17 * 60 + 5 ? ok('minutos de una hora normal') : mal('minutos mal calculados');

// Orden: otro día, por la primera sesión
const otroDia = ordenarPeliculas(g, null).porDelante.map((p) => p.title);
JSON.stringify(otroDia) === '["Cars","Cars 20º Aniversario","Dune: Parte Tres","Noche"]'
  ? ok('otro día: por la primera sesión, la madrugada al final') : mal(`orden otro día: ${otroDia}`);
// Hoy a las 17:30: Dune sigue (18:30), Cars ya ha pasado
const hoy = ordenarPeliculas(g, 17 * 60 + 30);
JSON.stringify(hoy.porDelante.map((p) => p.title)) === '["Dune: Parte Tres","Noche"]'
  ? ok('hoy: por la próxima sesión que no ha empezado') : mal(`orden hoy: ${hoy.porDelante.map((p) => p.title)}`);
hoy.empezadas.length === 2 ? ok('hoy: las que ya no tienen sesiones van aparte') : mal('empezadas mal separadas');

const filas = sesionesEnOrden(g);
filas.map((f) => f.sesion.time).join(' ') === '12:00 16:00 17:00 18:30 22:00 00:30'
  ? ok('horario: todas las sesiones en orden') : mal(`horario: ${filas.map((f) => f.sesion.time)}`);
franjasPorHora(filas).map((f) => f.etiqueta).join(' ') === '12:00 16:00 17:00 18:00 22:00 00:00'
  ? ok('franjas por hora en punto') : mal('franjas mal');

const d = detallesDeSesion({ language: 'VOSE', format: '3D', room: '7' });
JSON.stringify(d) === '{"etiquetas":["VOSE","3D"],"sala":"Sala 7"}' ? ok('detalles de la sesión') : mal(JSON.stringify(d));
const p = detallesDeSesion({ language: 'VE', format: 'PREMIUM', room: 'PREMIUM' });
p.sala === '' && p.etiquetas[0] === 'PREMIUM' ? ok('no repite el formato en la sala') : mal(JSON.stringify(p));

// ── Lo común de un cine se escribe una vez ───────────────────────────────────
// Todas las sesiones en "Sala Premium": la sala va junto al cine y no en cada
// entrada. Si una es distinta, cada una lleva la suya.
const premium = [sesion('17:15', { room: 'Sala Premium' }), sesion('19:00', { room: 'Sala Premium' }), sesion('21:10', { room: 'Sala Premium' })];
const comunP = comunesDelCine(premium);
comunP.sala === 'Sala Premium' && comunP.etiquetas.length === 0
  ? ok('lo común: la sala que comparten todas se saca una vez') : mal(`comunes: ${JSON.stringify(comunP)}`);
premium.every((x) => propiosDeSesion(x, comunP).sala === '')
  ? ok('lo común: las entradas ya no repiten la sala') : mal('las entradas siguen repitiendo la sala común');
const mezcla = [sesion('17:00', { language: 'VOSE', format: '4K Laser Atmos', room: '3' }), sesion('20:00', { language: 'VOSE', format: '4K Laser Atmos', room: '5' })];
const comunM = comunesDelCine(mezcla);
JSON.stringify(comunM) === '{"etiquetas":["VOSE","4K Laser Atmos"],"sala":""}'
  ? ok('lo común: VOSE y formato compartidos, salas distintas se quedan en su entrada') : mal(`comunes mezcla: ${JSON.stringify(comunM)}`);
propiosDeSesion(mezcla[1], comunM).sala === 'Sala 5' && propiosDeSesion(mezcla[1], comunM).etiquetas.length === 0
  ? ok('lo común: cada entrada enseña solo lo que la distingue') : mal(JSON.stringify(propiosDeSesion(mezcla[1], comunM)));
// Con una sola sesión, lo suyo también va junto al cine: en la entrada no
// cabía ("4K Laser Atmos Sala 06") y, en ámbar, la sala cedía ante "en 20 min".
const unaSola = comunesDelCine([sesion('20:00', { language: 'VOSE', format: '4K Laser Atmos', room: '06' })]);
JSON.stringify(unaSola) === '{"etiquetas":["VOSE","4K Laser Atmos"],"sala":"Sala 06"}'
  ? ok('lo común: con una sola sesión, lo suyo va junto al cine') : mal(`una sesión sola: ${JSON.stringify(unaSola)}`);
const propiosUna = propiosDeSesion(sesion('20:00', { language: 'VOSE', format: '4K Laser Atmos', room: '06' }), unaSola);
!propiosUna.sala && !propiosUna.etiquetas.length
  ? ok('lo común: y su entrada lleva la hora sola') : mal(`entrada de una sola: ${JSON.stringify(propiosUna)}`);
JSON.stringify(comunesDelCine([])) === '{"etiquetas":[],"sala":""}' ? ok('lo común: sin sesiones, nada') : mal('sin sesiones debería ser vacío');
JSON.stringify(comunesDelCine([sesion('17:00', { language: 'VOSE' }), sesion('20:00')]).etiquetas) === '[]'
  ? ok('lo común: si una no es VOSE, no se saca como común') : mal('VOSE de una sola se ha sacado como común');

// ── Horario: una fila por película dentro de cada minuto ─────────────────────
const tresCines = [
  { id: 'a', short: 'A', movies: [{ id: 'sf', title: 'Street Fighter', sessions: [sesion('20:00')] }, { id: 'x', title: 'Otra', sessions: [sesion('20:00')] }] },
  { id: 'b', short: 'B', movies: [{ id: 'sf', title: 'STREET FIGHTER', sessions: [sesion('20:00', { language: 'VOSE' })] }] },
  { id: 'c', short: 'C', movies: [{ id: 'sf', title: 'Street Fighter', sessions: [sesion('20:00'), sesion('22:30')] }] },
];
const huecos = huecosPorMinuto(sesionesEnOrden(agruparPeliculas(tresCines)));
const a20 = huecos.find((h) => h.minuto === 20 * 60);
const sf = a20?.pelis.find((x) => x.pelicula.title === 'Street Fighter');
a20?.pelis.length === 2 ? ok('horario: a las 20:00, dos filas (Street Fighter y Otra), no cuatro') : mal(`horario 20:00: ${a20?.pelis.map((x) => x.pelicula.title)}`);
sf?.pases.map((x) => x.cine.id).join(',') === 'a,b,c'
  ? ok('horario: Street Fighter una vez, con sus tres cines (cada uno su enlace)') : mal(`pases: ${sf?.pases.map((x) => x.cine.id)}`);
huecos.map((h) => h.minuto).join(',') === `${20 * 60},${22 * 60 + 30}` ? ok('horario: un hueco por minuto de inicio') : mal(`huecos: ${huecos.map((h) => h.minuto)}`);

// ── Filtro de cine: los datos de la película no dependen del filtro ──────────
const dosDuraciones = [
  { id: 'a', short: 'A', movies: [{ id: 'bn', title: 'La bola negra', durationMin: 155, ageRating: '+16', sessions: [sesion('19:00')] }] },
  { id: 'b', short: 'B', movies: [{ id: 'bn', title: 'La bola negra', durationMin: 159, ageRating: 'M-16', sessions: [sesion('17:00')] }] },
];
const todas = agruparPeliculas(dosDuraciones);
const soloB = soloEnCines(todas, ['b']);
soloB[0]?.durationMin === todas[0].durationMin && soloB[0]?.ageRating === todas[0].ageRating
  ? ok('filtro de cine: duración y edad no cambian al filtrar') : mal(`con filtro: ${soloB[0]?.durationMin} ${soloB[0]?.ageRating}`);
soloB[0]?.cines.length === 1 && soloB[0].primera === 17 * 60
  ? ok('filtro de cine: solo quedan sus sesiones y el orden se recalcula') : mal(JSON.stringify(soloB[0]?.cines.map((c) => c.cine.id)));
soloEnCines(todas, ['z']).length === 0 ? ok('filtro de cine: sin sesiones en el cine elegido, no sale') : mal('sale una película sin sesiones en el cine elegido');
soloEnCines(todas, []) === todas ? ok('filtro de cine: vacío = todos') : mal('sin filtro debería devolver la misma lista');

// ── La edad, escrita igual venga del cine que venga ──────────────────────────
// Casos reales de los datos: la misma cartelera mezclaba "+16", "M-16" y "No
// Recomendada para Menores de 16 años" (que partía en tres líneas en negrita).
const edades = [
  ['+16', '+16'], ['M-16', '+16'], ['No Recomendada para Menores de 16 años', '+16'],
  ['Mayores de 7 años, Esp Recomendada Infancia', '+7'], ['M-7', '+7'], ['18', '+18'],
  ['TP', 'TP'], ['Todos los públicos', 'TP'], ['Especialmente recomendada para la infancia', 'TP'],
  ['PDC', null], ['Pendiente de calificación', null], ['Sin calificación', null], [null, null], ['', null],
];
const malas = edades.filter(([e, esperado]) => edadDe(e) !== esperado);
!malas.length ? ok('edad: +N, TP o nada, venga como venga') : mal(`edad: ${malas.map(([e]) => `${e} → ${edadDe(e)}`).join(' · ')}`);
// Un "PDC" de un cine no tapa el "+16" de otro
const pdc = agruparPeliculas([
  { id: 'a', short: 'A', movies: [{ id: 'm', title: 'Macbeth', ageRating: 'PDC', sessions: [sesion('19:00')] }] },
  { id: 'b', short: 'B', movies: [{ id: 'm', title: 'Macbeth', ageRating: 'No Recomendada para Menores de 12 años', sessions: [sesion('20:00')] }] },
]);
pdc[0]?.ageRating === '+12' ? ok('edad: la primera que dice algo, ya normalizada') : mal(`edad juntada: ${pdc[0]?.ageRating}`);
todas[0].ageRating === '+16' ? ok('edad: "+16" y "M-16" son la misma') : mal(`edad: ${todas[0].ageRating}`);

if (fallos) { console.log(`\n${fallos} fallo(s)`); process.exit(1); }
console.log('\ntodo bien');
