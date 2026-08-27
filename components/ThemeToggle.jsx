'use client';

import { useEffect, useState } from 'react';

// El tema real vive en el atributo data-theme del <html>, que pone un script
// en la cabecera antes de pintar. Este botón NO decide a partir de su propio
// estado de React: lo lee del DOM en el momento de pulsar.
//
// Antes sí decidía por su estado, que arrancaba en "claro" por defecto. Si al
// entrar el tema era oscuro y el estado aún no se había sincronizado, la
// primera pulsación calculaba "de claro paso a oscuro": cambiaba el icono pero
// no el tema, porque ya estaba en oscuro. De ahí que la primera vez no hiciera
// nada y a partir de la segunda fuera bien.
function temaActual() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    setTheme(temaActual());

    // El atajo de teclado "T" también cambia el tema, y sin observar el
    // atributo el icono se quedaba mostrando lo contrario de lo que hay.
    const obs = new MutationObserver(() => setTheme(temaActual()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  function toggle() {
    const next = temaActual() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
    setTheme(next);
  }

  const aOscuro = theme !== 'dark';
  return (
    <button
      className="btn btn-icon"
      onClick={toggle}
      aria-label={aOscuro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      title={aOscuro ? 'Modo oscuro' : 'Modo claro'}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
           style={{ width: 17, height: 17 }}>
        {aOscuro
          ? <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          : <>
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
            </>}
      </svg>
    </button>
  );
}
