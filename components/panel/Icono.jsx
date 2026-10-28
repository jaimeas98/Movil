// Iconos del panel, con la misma gramática que los de la cartelera
// (components/Icono.jsx): trazo de 1,75, puntas redondas y currentColor.
// Van aparte porque el panel necesita formas que la cartelera no usa (los
// estados, la batería, el registro) y no tiene por qué cargar con ellas.

const TRAZOS = {
  resumen: <><path d="M4 5.5h16M4 12h16M4 18.5h10" /></>,
  movil: <><rect x="6.5" y="2.8" width="11" height="18.4" rx="2.2" /><path d="M10.5 18h3" /></>,
  cines: <><path d="M4 9.5h16v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><path d="m4 9.5 1.4-4.6 15 2.1L20 9.5" /><path d="m8.6 5.4 1.8 3.8M13.6 6.1l1.8 3.4" /></>,
  acciones: <><path d="M5 12h10" /><path d="m11 7 5 5-5 5" /><path d="M19.5 5v14" /></>,
  enlaces: <><path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1" /><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1" /></>,
  // El visor de LoL: un mando.
  lol: <><path d="M7.5 7h9a4.5 4.5 0 0 1 4.4 5.4l-.9 4.2a2.2 2.2 0 0 1-3.8 1L14.5 15.5h-5l-1.7 2.1a2.2 2.2 0 0 1-3.8-1l-.9-4.2A4.5 4.5 0 0 1 7.5 7z" /><path d="M8 10v3M6.5 11.5h3" /><path d="M15.5 11h.01M17.5 12.5h.01" /></>,
  avisos: <><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  actualizar: <><path d="M20 11.5A8 8 0 0 0 5.6 6.6L4 8.2" /><path d="M4 4v4.2h4.2" /><path d="M4 12.5a8 8 0 0 0 14.4 4.9l1.6-1.6" /><path d="M20 20v-4.2h-4.2" /></>,
  salir: <><path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4" /><path d="M10 8l-4 4 4 4M6 12h9" /></>,
  externo: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  lupa: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  aspa: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  abajo: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  ir: <path d="m9.5 6 6 6-6 6" />,
  // La cabina: la línea del día con su marca de "ahora".
  cabina: <><path d="M3.5 17.5h17" /><path d="M5.5 14v-3M8.5 14V8M11.5 14v-5M14.5 14v-2" /><path d="M18 5v12.5" /></>,
  candado: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" /></>,
  rayo: <path d="M13 3 6 13.5h5L10.5 21 18 10.5h-5z" />,
  copiar: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  // Estados: cada uno con su FORMA, para que se distingan sin color.
  bien: <><circle cx="12" cy="12" r="8.5" /><path d="m8.2 12.3 2.6 2.6 5-5.3" /></>,
  aviso: <><path d="M12 3.8 2.8 19.5h18.4z" /><path d="M12 10v4.2M12 16.9h.01" /></>,
  fallo: <><path d="M8.3 3.5h7.4l5.3 5.3v7.4l-5.3 5.3H8.3L3 16.2V8.8z" /><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" /></>,
  nada: <><circle cx="12" cy="12" r="8.5" strokeDasharray="2.6 3" /><path d="M8.5 12h7" /></>,
  espera: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
};

export default function Icono({ nombre, className = 'pn-ico', titulo, ...resto }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={titulo ? undefined : 'true'}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      focusable="false"
      {...resto}
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
