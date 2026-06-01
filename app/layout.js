import './globals.css';

export const metadata = {
  title: 'Cartelera Cine Jaime · Bahía de Cádiz',
  description:
    'Cartelera unificada de los cines de la Bahía de Cádiz: Cinesur Bahía de Cádiz, Yelmo Bahía Sur, Yelmo Jerez y Arte Siete El Puerto. Día a día, con horarios, duración y filtros.',
  manifest: '/manifest.webmanifest',
};

export const viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
};

// Script que aplica el tema guardado ANTES de pintar, evitando parpadeos.
const themeInit = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    if (!t) {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
