// Fuentes autoalojadas (npm, @fontsource-variable): nada de <link> a Google
// Fonts, que añadía una conexión a un tercero antes del primer pintado.
import '@fontsource-variable/big-shoulders-display';
import '@fontsource-variable/hanken-grotesk';
// Estilos por capas: tokens primero, porque todo lo demás los lee.
import './styles/tokens.css';
import './styles/base.css';
import './styles/barra.css';
import './styles/cartelera.css';
import './styles/hojas.css';

export const metadata = {
  title: 'Cartelera Cine Jaime · Bahía de Cádiz',
  description:
    'Cartelera unificada de los cines de la Bahía de Cádiz: Cinesur Bahía de Cádiz, Yelmo Bahía Sur, Yelmo Jerez y Arte Siete El Puerto. Día a día, con horarios, duración y filtros.',
  manifest: '/manifest.webmanifest',
};

export const viewport = {
  // El color de la barra del navegador sigue al tema del sistema; coincide con
  // --fondo de cada tema en app/styles/tokens.css.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0B1526' },
    { media: '(prefers-color-scheme: light)', color: '#F2F5F9' },
  ],
  width: 'device-width',
  initialScale: 1,
};

// Script que aplica el tema guardado ANTES de pintar, evitando parpadeos.
const themeInit = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    if (!t) {
      // Modo oscuro como predeterminado: se usa sobre todo de noche.
      // Si el sistema pide explícitamente claro, lo respetamos.
      t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
