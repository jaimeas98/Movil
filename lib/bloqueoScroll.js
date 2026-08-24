'use client';

// Bloqueo del scroll del documento mientras hay una capa modal abierta.
//
// El `document.body.style.overflow = 'hidden'` que había antes NO funciona en
// iOS Safari: WebKit deja que el viewport siga haciendo rebote elástico sobre
// el documento, y desde iOS 15 ese rebote es exactamente lo que dispara el
// "tirar para recargar" que el usuario se encontraba sin querer. El único
// bloqueo portable es sacar al documento de la ecuación con position:fixed y
// devolverlo a su sitio después.
//
// Contador de profundidad en vez de un booleano: con reactStrictMode activado
// React monta, desmonta y vuelve a montar en desarrollo, y un booleano dejaría
// el estado descuadrado en el segundo montaje.

let profundidad = 0;
let scrollGuardado = 0;
let previo = null;

export function bloquearScroll() {
  profundidad += 1;
  if (profundidad > 1) return;

  scrollGuardado = window.scrollY || document.documentElement.scrollTop || 0;
  const b = document.body;
  previo = {
    position: b.style.position, top: b.style.top, left: b.style.left,
    right: b.style.right, width: b.style.width,
    overflow: b.style.overflow, paddingRight: b.style.paddingRight,
  };

  // En escritorio, quitar la barra de scroll ensancha el contenido y la página
  // da un salto. Se compensa con un relleno del mismo ancho.
  const barra = window.innerWidth - document.documentElement.clientWidth;

  b.style.position = 'fixed';
  b.style.top = `-${scrollGuardado}px`;
  b.style.left = '0';
  b.style.right = '0';
  b.style.width = '100%';
  b.style.overflow = 'hidden';
  if (barra > 0) b.style.paddingRight = `${barra}px`;
}

export function desbloquearScroll() {
  profundidad = Math.max(0, profundidad - 1);
  if (profundidad > 0) return;

  const b = document.body;
  if (previo) Object.assign(b.style, previo);
  previo = null;
  // 'instant' explícito: con scroll-behavior:smooth en <html>, sin esto la
  // vuelta a la posición original se animaría y se vería la página aterrizando.
  window.scrollTo({ top: scrollGuardado, left: 0, behavior: 'instant' });
}
