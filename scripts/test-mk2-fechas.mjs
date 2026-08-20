// Prueba del fechado de sesiones de mk2 con HTML calcado del real
// (tomado del volcado de producción de /api/diag/mk2 del 2026-08-20).
import { extractSessionsByDateFromMoviePage, isoFromSegment } from '../lib/cinemas/mk2.js';

const HOY = '2026-08-20'; // jueves

const horariosBahia = (hora, vose = false) => `
<div class="horarios">	<div class="cine"><img alt="mk2 Bahía De Cádiz Premium" /></div>
<div class="horas"><div class="w100 pull-left"><div class="rotulo_sala_premium">SALA CONFORT</div></div>
<a class="btn btn-default metrica" href="https://cine.entradas.com/cine/cadiz/cinesur-bahia-de-cadiz/evento/109891/x?mode=widget&amp;change=0" data-ho="39027" target="_blank">${vose ? '<span>VOSE</span>' : ''}${hora}</a>	</div></div>`;

// Bloque de otro cine, que NO debe colarse como sesión de Bahía.
const horariosOtroCine = (hora) => `
<div class="horarios">	<div class="cine"><img alt="mk2 Nervión Plaza" /></div>
<div class="horas"><a class="btn btn-default metrica" href="https://cine.entradas.com/cine/sevilla/cinesur-nervion-plaza/evento/257092/x?mode=widget" data-ho="38907" target="_blank">${hora}</a>	</div></div>`;

const rotulo = (num, texto, left) =>
  `<div class="rotulo_dia ${num === 0 ? ' activo' : ''} rotulo_dia${num} cambiar-dia" data-num="${num}" data-med="px" data-ei="30" style="left:${left}px">${texto}</div>`;

// Pie de página real: contiene el slug del cine pero sin hora — no es sesión.
const PIE = `<div class="horarios"><a id="footerl-220" href="es/mk2-cinesur-bahia-de-cadiz">Bahía de Cádiz Premium (Cádiz)</a></div>`;

// ── Caso 1: clásico con un ÚNICO día ("Pesadilla en Elm Street") ──────────────
const pesadilla =
  rotulo(0, 'Jueves 29/10', 30) +
  '<div class="contenedor_cines cines_ficha clearfix cines-0">' +
  horariosOtroCine('20:00') + horariosBahia('20:00', true) +
  '</div>' + PIE;

// ── Caso 2: estreno con rótulo relativo "Mañana" ("Toy Story 5") ─────────────
const toyStory =
  rotulo(0, 'Mañana', 30) + '<div class="cines-0">' + horariosBahia('16:40') + '</div>' +
  rotulo(1, 'Sábado 22/08', 166) + '<div class="cines-1">' + horariosBahia('16:40') + '</div>' +
  rotulo(2, 'Domingo 23/08', 302) + '<div class="cines-2">' + horariosBahia('18:50') + '</div>' +
  PIE;

// ── Caso 3: rótulo "Hoy" ─────────────────────────────────────────────────────
const conHoy = rotulo(0, 'Hoy', 30) + '<div class="cines-0">' + horariosBahia('22:15') + '</div>' + PIE;

// ── Caso 4: ciclo que cruza el fin de año (enero, sin año en el HTML) ────────
const eneroSinAnio = rotulo(0, 'Viernes 09/01', 30) + '<div class="cines-0">' + horariosBahia('20:00') + '</div>' + PIE;

// ── Caso 5: ficha sin ningún rótulo de día → no inventamos fecha ─────────────
const sinRotulos = horariosBahia('20:00') + PIE;

// ── Caso 6: película que no se proyecta en Bahía → sin sesiones ──────────────
const soloOtroCine = rotulo(0, 'Jueves 29/10', 30) + '<div class="cines-0">' + horariosOtroCine('20:00') + '</div>' + PIE;

let fallos = 0;
function comprobar(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) {
    fallos++;
    console.log(`FALLO  ${nombre}\n  obtenido: ${JSON.stringify(real)}\n  esperado: ${JSON.stringify(esperado)}`);
  } else {
    console.log(`ok     ${nombre} → ${JSON.stringify(real)}`);
  }
}

const fechas = (html) =>
  Object.fromEntries(
    Object.entries(extractSessionsByDateFromMoviePage(html, HOY))
      .map(([iso, s]) => [iso, s.map((x) => x.time)])
  );

comprobar('clásico de un solo día se fecha el 29/10, no hoy', fechas(pesadilla), { '2026-10-29': ['20:00'] });
comprobar('"Mañana" es el 21, y los rótulos con fecha mandan', fechas(toyStory), {
  '2026-08-21': ['16:40'], '2026-08-22': ['16:40'], '2026-08-23': ['18:50'],
});
comprobar('"Hoy" se fecha hoy', fechas(conHoy), { '2026-08-20': ['22:15'] });
comprobar('enero sin año pasa al año siguiente', fechas(eneroSinAnio), { '2027-01-09': ['20:00'] });
comprobar('sin rótulo de día no se inventa fecha', fechas(sinRotulos), {});
comprobar('sesiones de otros cines no cuentan', fechas(soloOtroCine), {});

// isoFromSegment aislado
comprobar('rótulo "Sábado 22/08"', isoFromSegment(rotulo(1, 'Sábado 22/08', 0), HOY), '2026-08-22');
comprobar('rótulo "Mañana"', isoFromSegment(rotulo(0, 'Mañana', 0), HOY), '2026-08-21');
comprobar('rótulo "Manana" sin eñe', isoFromSegment(rotulo(0, 'Manana', 0), HOY), '2026-08-21');
comprobar('rótulo sin fecha reconocible', isoFromSegment(rotulo(0, 'Próximamente', 0), HOY), null);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas las comprobaciones pasan');
process.exit(fallos ? 1 : 0);
