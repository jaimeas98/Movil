// Utilidades de fechas para el selector de días (lado cliente).

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const WEEKDAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Convierte un Date a 'YYYY-MM-DD' usando la hora local del navegador.
export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Construye los próximos `count` días a partir de hoy.
export function buildDayList(count = 14) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      iso: toISODate(d),
      weekday: WEEKDAYS[d.getDay()],
      weekdayLong: WEEKDAYS_LONG[d.getDay()],
      day: d.getDate(),
      month: MONTHS[d.getMonth()],
      isToday: i === 0,
      isTomorrow: i === 1,
    });
  }
  return days;
}

// Etiqueta larga y legible: "Domingo 1 de junio".
export function longLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS_LONG[date.getDay()]} ${d} de ${MONTHS_LONG[m - 1]}`;
}
