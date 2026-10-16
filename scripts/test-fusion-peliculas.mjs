// La cartelera junta en una sola entrada la misma película de varios cines.
// Juntar dos películas distintas es mucho peor que dejar la misma dos veces,
// así que aquí se comprueban sobre todo los casos en los que NO debe juntar.
// Títulos sacados de la cartelera real de los cuatro cines.
import {
  esLaMismaPelicula, agruparPeliculas, ordenarPeliculas, minutosDeSesion,
  sesionesEnOrden, franjasPorHora, detallesDeSesion,
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

if (fallos) { console.log(`\n${fallos} fallo(s)`); process.exit(1); }
console.log('\ntodo bien');
