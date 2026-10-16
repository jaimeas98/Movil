// Vigilante del móvil: cuándo avisa, cuándo no, y que no repite ni miente.
import { anotar, prevision } from './movil/bateria.mjs';
import { evaluar, sincronizar } from './vigilante/revisar.mjs';

let fallos = 0;
const ok = (c, m) => { if (c) console.log('ok    ' + m); else { fallos++; console.log('FALLO ' + m); } };
const MIN = 60000, H = 3600000;
const ahora = Date.parse('2026-10-20T18:00:00Z');
const informe = (minAntes, bateria) => ({ vuelta: new Date(ahora - minAntes * MIN).toISOString(), bateria });

// ── Previsión de batería (en el móvil) ─────────────────────────────────────
let h = [];
for (let i = 0; i <= 8; i++) h = anotar(h, { t: ahora - (8 - i) * 15 * MIN, pct: i < 2 ? 100 : 100 - (i - 1) * 3, cargando: i < 2 });
let p = prevision(h);
ok(Math.abs(p.ritmoPorHora - 12) < 0.6, `ritmo medido desde que se desenchufó: ${p.ritmoPorHora} %/h (esperado ~12)`);
ok(p.desenchufadoDesde === new Date(ahora - 6 * 15 * MIN).toISOString(), 'sabe desde cuándo está desenchufado');
ok(Math.abs(p.horasHastaReserva - (79 - 15) / 12) < 0.3, `horas hasta el 15 %: ${p.horasHastaReserva}`);
p = prevision(anotar(h, { t: ahora + 15 * MIN, pct: 79, cargando: true }));
ok(p.ritmoPorHora === null && p.desenchufadoDesde === null, 'cargando: sin prisa ni ritmo');
p = prevision([{ t: ahora - 10 * MIN, pct: 50, cargando: false }, { t: ahora, pct: 49, cargando: false }]);
ok(p.ritmoPorHora === null, 'con menos de 20 min de datos no se inventa un ritmo');
ok(anotar(Array.from({ length: 300 }, (_, i) => ({ t: ahora - i * MIN, pct: 50, cargando: true })), { t: ahora, pct: 50, cargando: true }).length <= 200, 'el historial no crece sin límite');

// ── Cuándo avisa ───────────────────────────────────────────────────────────
const tipos = (as) => as.map((a) => `${a.tipo}/${a.nivel}`).join(',');
ok(evaluar(informe(10, { porcentaje: 97, cargando: true }), ahora).length === 0, 'todo bien: no avisa');
ok(evaluar(informe(10, { porcentaje: 60, cargando: false, ritmoPorHora: 2 }), ahora).length === 0, 'desenchufado un rato con batería de sobra: no avisa (los auriculares)');
ok(tipos(evaluar(informe(10, { porcentaje: 22, cargando: false, ritmoPorHora: 2 }), ahora)) === 'bateria/aviso', 'por debajo del 25 % sin cargar: avisa');
ok(evaluar(informe(10, { porcentaje: 22, cargando: true }), ahora).length === 0, 'baja pero cargando: no avisa');
// El caso de Jaime: un 40 % que baja deprisa avisa YA, aunque 40 no sea "bajo"
ok(tipos(evaluar(informe(10, { porcentaje: 40, cargando: false, ritmoPorHora: 12 }), ahora)) === 'bateria/aviso', 'un 40 % que baja un 12 %/h avisa antes de que sea tarde');
ok(evaluar(informe(10, { porcentaje: 40, cargando: false, ritmoPorHora: 12 }), ahora)[0].cuerpo.includes('se apagaría'), 'y dice cuánto le queda');
// Informe de hace 40 min de un móvil que bajaba deprisa: se estima la de AHORA
ok(evaluar(informe(40, { porcentaje: 30, cargando: false, ritmoPorHora: 12 }), ahora)[0].titulo.includes('22 %'), 'estima la batería de ahora, no la del informe');
ok(tipos(evaluar(informe(5, { porcentaje: 9, cargando: false, ritmoPorHora: 3 }), ahora)) === 'bateria/critico', '≤10 %: crítico');
ok(tipos(evaluar(informe(30, { porcentaje: 97, cargando: true }), ahora)) === '', 'un informe de hace 30 min aún es normal');
ok(tipos(evaluar(informe(50, { porcentaje: 97, cargando: true }), ahora)) === 'sin-senal/aviso', 'más de 45 min sin informe: sin señal');
ok(tipos(evaluar(informe(200, { porcentaje: 97, cargando: true }), ahora)) === 'sin-senal/critico', 'a las 3 h sin señal: recordatorio');
ok(evaluar(informe(120, { porcentaje: 20, cargando: false, ritmoPorHora: 12 }), ahora)[0].titulo.includes('sin batería'), 'mudo y bajaba deprisa: probablemente sin batería');
ok(evaluar(null, ahora)[0].tipo === 'sin-senal', 'sin informe ninguno: sin señal');

// ── Issues: abre una vez, escala, cierra al arreglarse, no miente ─────────
function github() {
  const issues = []; const comentarios = [];
  const api = async (m, ruta, c) => {
    if (m === 'GET') return issues.filter((i) => i.state === 'open');
    if (m === 'POST' && ruta === '/issues') { const i = { number: issues.length + 1, state: 'open', ...c, title: c.title }; issues.push(i); return i; }
    const n = Number(ruta.split('/')[2]); const i = issues.find((x) => x.number === n);
    if (m === 'POST') { comentarios.push({ n, ...c }); return {}; }
    if (m === 'PATCH') { Object.assign(i, c); return i; }
  };
  return { api, issues, comentarios };
}
const g = github(); const ctx = { api: g.api, dueño: 'jaimeas98' };
const bajo = informe(10, { porcentaje: 22, cargando: false, ritmoPorHora: 2 });
await sincronizar(evaluar(bajo, ahora), bajo, ctx);
await sincronizar(evaluar(bajo, ahora), bajo, ctx);
ok(g.issues.length === 1, 'el mismo problema no abre un aviso cada media hora');
ok(g.issues[0].assignees?.[0] === 'jaimeas98' && g.issues[0].body.includes('@jaimeas98'), 'asignado y mencionado (lo que notifica la app)');
const peor = informe(10, { porcentaje: 8, cargando: false, ritmoPorHora: 2 });
await sincronizar(evaluar(peor, ahora), peor, ctx);
ok(g.comentarios.some((c) => c.body.includes('Empeora')), 'si empeora a crítico, vuelve a avisar con un comentario');
const n = g.comentarios.length;
await sincronizar(evaluar(peor, ahora), peor, ctx);
ok(g.comentarios.length === n, 'crítico que sigue igual: no repite');
const mudo = informe(60, { porcentaje: 8, cargando: false, ritmoPorHora: 2 });
await sincronizar(evaluar(mudo, ahora), mudo, ctx);
ok(g.issues.find((i) => i.body.includes('vigilante:bateria')).state === 'open', 'si además se queda mudo, el aviso de batería NO se cierra como "resuelto"');
ok(g.issues.some((i) => i.body.includes('vigilante:sin-senal') && i.state === 'open'), 'y se abre el de sin señal');
const bien = informe(5, { porcentaje: 30, cargando: true });
await sincronizar(evaluar(bien, ahora), bien, ctx);
ok(g.issues.every((i) => i.state === 'closed'), 'cuando vuelve y carga, se cierran los dos');
ok(g.comentarios.filter((c) => /Resuelto/.test(c.body)).length === 2, 'cada cierre explica por qué');
const g2 = github();
await sincronizar(evaluar(bien, ahora, { prueba: true }), bien, { api: g2.api, dueño: 'jaimeas98' });
await sincronizar(evaluar(bien, ahora), bien, { api: g2.api, dueño: 'jaimeas98' });
ok(g2.issues.length === 1 && g2.issues[0].state === 'closed', 'el aviso de prueba se abre y se cierra solo en la siguiente revisión');

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas pasan');
process.exit(fallos ? 1 : 0);
