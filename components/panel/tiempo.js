// Horas del panel: relativas para leer de un vistazo ("hace 3 min") y la
// absoluta al lado para no tener que hacer cuentas ("· 18:30"). Siempre en la
// hora de Madrid, que es la del móvil y la de los cines, aunque el portátil
// esté en otra zona.

const ZONA = 'Europe/Madrid';

const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDia = new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, weekday: 'short', day: 'numeric' });
const fmtCompleta = new Intl.DateTimeFormat('es-ES', {
  timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const fmtClave = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });

// Acepta ISO, milisegundos o segundos (lo que venga del móvil o del servidor).
export function aFecha(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    return new Date(v < 1e11 ? v * 1000 : v); // < 1e11 → segundos de época
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const diaClave = (d) => fmtClave.format(d);

// "hoy 18:30", "ayer 07:04", "vie 16, 20:03"
export function absoluta(v, ahora = Date.now()) {
  const d = aFecha(v);
  if (!d) return '';
  const hoy = diaClave(new Date(ahora));
  const ayer = diaClave(new Date(ahora - 864e5));
  const manana = diaClave(new Date(ahora + 864e5));
  const k = diaClave(d);
  const h = fmtHora.format(d);
  if (k === hoy) return h;
  if (k === ayer) return `ayer ${h}`;
  if (k === manana) return `mañana ${h}`;
  return `${fmtDia.format(d).replace('.', '')}, ${h}`;
}

export const completa = (v) => {
  const d = aFecha(v);
  return d ? fmtCompleta.format(d) : '';
};

// Una duración en palabras cortas: "45 s", "12 min", "3 h 10 min", "2 días".
export function duracion(ms, { segundos = true } = {}) {
  if (ms == null || !Number.isFinite(ms)) return '';
  const s = Math.round(Math.abs(ms) / 1000);
  if (s < 60) return segundos ? `${s} s` : 'menos de 1 min';
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  if (h < 24) return resto && h < 10 ? `${h} h ${resto} min` : `${h} h`;
  const dias = Math.round(h / 24);
  return dias === 1 ? '1 día' : `${dias} días`;
}

// "ahora mismo", "hace 3 min", "dentro de 2 h"
export function relativa(v, ahora = Date.now()) {
  const d = aFecha(v);
  if (!d) return '';
  const dif = d.getTime() - ahora;
  if (Math.abs(dif) < 45000) return 'ahora mismo';
  const texto = duracion(dif, { segundos: false });
  return dif < 0 ? `hace ${texto}` : `dentro de ${texto}`;
}

export const edadMs = (v, ahora = Date.now()) => {
  const d = aFecha(v);
  return d ? ahora - d.getTime() : null;
};
