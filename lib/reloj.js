'use client';

// Reloj de minutos en hora de Madrid, compartido por toda la página.
//
// Las sesiones de hoy cambian de estado con el tiempo (apagadas cuando ya han
// empezado, encendidas en ámbar en la hora previa, "en 25 min"). Si el minuto
// viviera en el estado de Page, cada tic re-renderizaría la cartelera entera
// para cambiar, como mucho, un par de entradas. Aquí hay un único temporizador
// y cada pieza se suscribe con un SELECTOR: React solo la vuelve a pintar
// cuando cambia lo que esa pieza saca del minuto (su estado), no el minuto.

import { useSyncExternalStore } from 'react';

const ZONA = 'Europe/Madrid';

const formatoHora = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  : null;
const formatoFecha = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' })
  : null;

// 'YYYY-MM-DD' del día en Madrid, sea cual sea la zona del dispositivo.
export function fechaMadrid(d = new Date()) {
  return formatoFecha.format(d);
}

// Minuto del día en Madrid (0–1439).
export function minutosMadrid(d = new Date()) {
  const [h, m] = formatoHora.format(d).split(':').map(Number);
  return (h % 24) * 60 + m;
}

let actual = null;          // { fecha, minuto } o null antes de arrancar
const oyentes = new Set();
let reloj = 0;

function leer() {
  const ahora = new Date();
  return { fecha: fechaMadrid(ahora), minuto: minutosMadrid(ahora) };
}

function avisar() {
  const nuevo = leer();
  if (actual && nuevo.fecha === actual.fecha && nuevo.minuto === actual.minuto) return;
  actual = nuevo;
  for (const o of oyentes) o();
}

// Se programa al SIGUIENTE cambio de minuto, no cada 60 s desde que se abrió
// la página: si no, el "en 25 min" iría hasta un minuto por detrás del reloj
// del móvil, justo el que uno mira para saber si llega.
function programar() {
  clearTimeout(reloj);
  const ms = 60000 - (Date.now() % 60000) + 50;
  reloj = setTimeout(() => { avisar(); programar(); }, ms);
}

// Al volver a la pestaña (o desbloquear el móvil) los temporizadores pueden
// haberse quedado dormidos: se corrige al momento.
function alVolver() {
  if (document.visibilityState === 'visible') { avisar(); programar(); }
}

function suscribir(cb) {
  oyentes.add(cb);
  if (oyentes.size === 1) {
    actual = leer();
    programar();
    document.addEventListener('visibilitychange', alVolver);
  }
  return () => {
    oyentes.delete(cb);
    if (oyentes.size === 0) {
      clearTimeout(reloj);
      document.removeEventListener('visibilitychange', alVolver);
    }
  };
}

function instantanea() {
  if (!actual) actual = leer();
  return actual;
}

// `selector(ahora)` recibe { fecha, minuto } (o null en el servidor) y debe
// devolver un valor primitivo: con eso React compara y decide si repinta.
export function useAhora(selector) {
  return useSyncExternalStore(
    suscribir,
    () => selector(instantanea()),
    () => selector(null)
  );
}

// Estado de una sesión respecto a ahora. Solo tiene sentido el día de hoy.
//   'pasada'   ya ha empezado
//   'pronto:N' empieza en N minutos (0–60)
//   ''         nada especial
export const VENTANA_PRONTO = 60;
export function estadoDeSesion(minutoSesion, ahora, fechaDelDia) {
  if (!ahora || ahora.fecha !== fechaDelDia || minutoSesion == null) return '';
  const falta = minutoSesion - ahora.minuto;
  if (falta < 0) return 'pasada';
  if (falta <= VENTANA_PRONTO) return `pronto:${falta}`;
  return '';
}
