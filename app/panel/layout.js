// Todo lo de /panel: sus estilos y unos metadatos que no dicen nada.
//
// El layout raíz pone el título y la descripción de la cartelera y el
// manifest de la PWA; aquí se pisan los tres para que ni la pestaña, ni un
// buscador, ni "añadir a la pantalla de inicio" delaten qué hay detrás (y la
// cabecera X-Robots-Tag de middleware.js dice lo mismo que estos robots).
import './panel.css';

export const metadata = {
  title: 'Panel',
  description: null,
  manifest: null,
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  referrer: 'no-referrer',
};

export default function LayoutPanel({ children }) {
  return children;
}
