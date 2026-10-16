// Iconos de la casa: SVG de trazo, todos con el mismo grosor y las mismas
// puntas redondeadas, y en currentColor para que sigan al tema sin más. Nada
// de emoji ni de caracteres sueltos (✕, ↻, ★) haciendo de icono: cada sistema
// los pinta a su manera y no casan entre sí.

const TRAZOS = {
  lupa: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  aspa: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  calendario: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  actualizar: <><path d="M20 11.5A8 8 0 0 0 5.6 6.6L4 8.2" /><path d="M4 4v4.2h4.2" /><path d="M4 12.5a8 8 0 0 0 14.4 4.9l1.6-1.6" /><path d="M20 20v-4.2h-4.2" /></>,
  teclado: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9" /></>,
  generos: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  externo: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  alerta: <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2h.01" /></>,
  sinConexion: <><path d="M2.5 8.5a14 14 0 0 1 5-3M21.5 8.5a14 14 0 0 0-9.5-3.9" /><path d="M5.5 12a9.5 9.5 0 0 1 3.4-2.2M18.5 12a9.5 9.5 0 0 0-2.4-1.7" /><path d="M8.8 15.4a4.6 4.6 0 0 1 6.4 0" /><path d="M12 19h.01M3 3l18 18" /></>,
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  marca: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  abajo: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  estrella: <path d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z" />,
  luna: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  sol: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
};

export default function Icono({ nombre, className = 'ico', titulo, ...resto }) {
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
