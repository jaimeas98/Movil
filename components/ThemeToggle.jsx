'use client';

import { useEffect, useState } from 'react';
import Icono from './Icono.jsx';

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
      type="button"
      className="boton-icono"
      onClick={toggle}
      aria-label={aOscuro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      title={aOscuro ? 'Modo oscuro (T)' : 'Modo claro (T)'}
    >
      {/* Se enseña el tema al que se va, no en el que se está */}
      <Icono nombre={aOscuro ? 'luna' : 'sol'} />
    </button>
  );
}
