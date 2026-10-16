'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { goma, crearVelocimetro, movimientoReducido } from '@/lib/gestos.js';
import { animarMuelle, proyectar } from '@/lib/muelle.js';
import { bloquearScroll, desbloquearScroll } from '@/lib/bloqueoScroll.js';
import Icono from './Icono.jsx';

// La hoja: el envoltorio común de la ficha, Próximas y los atajos. Una sola
// gramática para las tres, que se aprende una vez:
//
//  · Móvil (< 900 px): hoja que sube desde abajo, con tirador. Se arrastra 1:1
//    con el dedo, se cierra por distancia O por velocidad (mirando adónde va,
//    no dónde está), vuelve a su sitio con un muelle y, si se arrastra hacia
//    arriba, cede con goma en vez de chocar con una pared.
//  · Escritorio: panel lateral que entra por la derecha y deja ver la
//    cartelera a la izquierda (ver hojas.css para el porqué).
//  · En los dos: diálogo modal de verdad (aria-modal, foco atrapado, Escape
//    cierra, el foco vuelve a quien la abrió).
//
// Todo el gesto vive en refs y estilos en línea: con el arrastre en el estado
// de React, cada píxel de dedo volvería a pintar la ficha entera.

// ── Muelles (ver lib/muelle.js) ───────────────────────────────────────────────
// Críticos por defecto. Solo rebota (ζ 0,8, el de las hojas de iOS) cuando la
// vuelta a su sitio viene de un lanzamiento: el rebote es la inercia del
// gesto, y sin gesto no hay inercia que lo justifique (apple-design §4).
const MUELLE_ENTRADA = { amortiguamiento: 1, respuesta: 0.3 };
const MUELLE_VUELTA = { amortiguamiento: 1, respuesta: 0.3 };
const MUELLE_VUELTA_LANZADA = { amortiguamiento: 0.8, respuesta: 0.32 };
// Salir es más rápido que entrar: cuando cierras ya has decidido.
const MUELLE_SALIDA = { amortiguamiento: 1, respuesta: 0.26 };

// ── Umbrales del gesto ────────────────────────────────────────────────────────
const HOLGURA = 4;            // px antes de decidir de quién es el gesto
const LANZAMIENTO = 0.3;      // px/ms (300 px/s): a partir de aquí, "lo ha lanzado"
const SUBIENDO = -0.05;       // px/ms: soltar subiendo nunca cierra
const MINIMO_CERRAR = 8;      // px: un temblor del dedo no es un gesto
const REDUCIDO_CERRAR = 90;   // px: con movimiento reducido no hay inercia que medir

const PANEL = '(min-width: 900px)';
const esPanel = () => typeof window !== 'undefined' && window.matchMedia(PANEL).matches;
const limitar = (v) => Math.max(0, Math.min(1, v));

const FOCOS = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Props:
//   variante       'ficha' | 'proximas' | 'atajos' (estilo y nombres de la
//                  View Transition)
//   etiquetadaPor  id del título (aria-labelledby); o `etiqueta` en texto
//   onCerrar       quitarla ya (el padre la desmonta)
//   salida         opcional: () => boolean. Si devuelve true, el cierre lo
//                  anima otro (la View Transition del cartel) y la hoja no
//                  hace nada. No se usa para el gesto: ese cierre ya va en
//                  marcha con el dedo y lo termina la propia hoja.
//   focoAlCerrar   adónde devolver el foco (por defecto, a quien lo tenía)
//   instantanea    sin animación de entrada ni de salida (abierta con
//                  teclado: lo que se hace con atajos no se anima)
export default function Hoja({
  variante, etiquetadaPor, etiqueta, onCerrar, salida, focoAlCerrar, instantanea = false, children,
}) {
  const veloRef = useRef(null);
  const hojaRef = useRef(null);
  const cuerpoRef = useRef(null);
  const pedirRef = useRef(() => {});

  // Los callbacks del padre llegan nuevos en cada render: en refs, para que el
  // efecto del gesto no se vuelva a montar a mitad de un arrastre.
  const props = useRef({ onCerrar, salida, focoAlCerrar, instantanea });
  useEffect(() => { props.current = { onCerrar, salida, focoAlCerrar, instantanea }; });

  // ── Foco, teclado y bloqueo del documento ───────────────────────────────────
  useEffect(() => {
    const hoja = hojaRef.current;
    const anterior = document.activeElement;
    bloquearScroll();
    // Sin esto el foco se quedaba en el cartel de detrás y el tabulador
    // paseaba por una página que ya no se ve.
    hoja?.focus({ preventScroll: true });

    // En captura y cortando: Escape cierra la hoja y no debe llegar al atajo
    // global de la página, que borraría la búsqueda por detrás.
    const alTeclear = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        pedirRef.current('tecla');
        return;
      }
      if (e.key !== 'Tab' || !hoja) return;
      const focos = [...hoja.querySelectorAll(FOCOS)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!focos.length) { e.preventDefault(); return; }
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      const dentro = hoja.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === hoja || !dentro)) {
        e.preventDefault(); ultimo.focus();
      } else if (!e.shiftKey && (document.activeElement === ultimo || !dentro)) {
        e.preventDefault(); primero.focus();
      }
    };
    document.addEventListener('keydown', alTeclear, true);
    return () => {
      document.removeEventListener('keydown', alTeclear, true);
      desbloquearScroll();                       // primero devolver el scroll…
      const destino = props.current.focoAlCerrar;
      (destino?.isConnected ? destino : anterior)?.focus?.({ preventScroll: true });   // …y luego el foco
    };
  }, []);

  // ── Movimiento: entrada, salida y arrastre ──────────────────────────────────
  // useLayoutEffect: la entrada tiene que estar puesta ANTES del primer pintado,
  // o se vería un fotograma de la hoja ya colocada.
  useLayoutEffect(() => {
    const hoja = hojaRef.current;
    const velo = veloRef.current;
    const cuerpo = cuerpoRef.current;
    if (!hoja || !velo || !cuerpo) return;

    const reducido = movimientoReducido();
    let anim = null;          // muelle en curso (lib/muelle.js)
    let fundido = null;       // fundido en curso (movimiento reducido)
    let cerrando = false;

    // Hasta dónde hay que llevarla para que no se vea: su alto en el móvil,
    // su ancho en el panel de escritorio.
    const fuera = () => (esPanel() ? hoja.offsetWidth : hoja.offsetHeight) || window.innerHeight;
    const transformada = (v, panel) => (panel ? `translate3d(${v}px, 0, 0)` : `translate3d(0, ${v}px, 0)`);

    const enReposo = () => {
      hoja.style.transform = '';
      hoja.style.willChange = '';
      velo.style.opacity = '';
    };

    // La hoja SOLO se desplaza; lo que se atenúa es el velo, a la par. Escalar
    // o difuminar la propia hoja la despega del dedo y delata la animación.
    const mover = (desde, hasta, velocidad, params, cortarSi) => {
      anim?.parar();
      const panel = esPanel();
      const recorrido = fuera();
      const a = animarMuelle(hoja, {
        desde, hasta, velocidad, ...params, cortarSi,
        aplicar: (v) => ({ transform: transformada(v, panel) }),
        acompanantes: [{ el: velo, aplicar: (v) => ({ opacity: String(limitar(1 - v / recorrido)) }) }],
      });
      anim = a;
      return a.terminado.then((ok) => { if (anim === a) anim = null; return ok; });
    };

    // Con movimiento reducido: un fundido corto, sin desplazamiento.
    const fundir = (de, a, ms) => {
      fundido?.forEach((x) => x.cancel());
      const op = { duration: ms, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards' };
      fundido = [hoja.animate([{ opacity: de }, { opacity: a }], op), velo.animate([{ opacity: de }, { opacity: a }], op)];
      return fundido[0].finished.then(() => true, () => false);
    };

    const cerrarYa = () => props.current.onCerrar?.();

    // ── Salir ─────────────────────────────────────────────────────────────────
    // `desde` y `velocidad` llegan del dedo; si no, se sale desde donde esté.
    const salir = ({ motivo, desde, velocidad = 0 }) => {
      if (cerrando && motivo !== 'gesto') return;
      // El cartel vuelve a la lista con la View Transition: se encarga ella.
      if (motivo !== 'gesto' && props.current.salida?.()) { cerrando = true; return; }
      cerrando = true;
      if (props.current.instantanea && motivo !== 'gesto') { cerrarYa(); return; }
      if (reducido) { fundir(1, 0, 140).then((ok) => ok && cerrarYa()); return; }
      const actual = desde ?? (anim ? anim.parar().valor : 0);
      const lejos = fuera();
      mover(actual, lejos, velocidad, MUELLE_SALIDA, (v) => v >= lejos - 1)
        .then((ok) => { if (ok) cerrarYa(); });
    };
    pedirRef.current = (motivo) => salir({ motivo });

    // ── Entrar ────────────────────────────────────────────────────────────────
    // Si la abre la View Transition del cartel, la entrada ya la está pintando
    // el navegador (ver lib/transicionCartel.js) y aquí no se hace nada.
    const porTransicion = document.documentElement.dataset.vt === 'abrir';
    if (!props.current.instantanea && !porTransicion) {
      if (reducido) fundir(0, 1, 180);
      else mover(fuera(), 0, 0, MUELLE_ENTRADA).then((ok) => ok && enReposo());
    }

    // ── Arrastrar (solo la hoja del móvil) ────────────────────────────────────
    let tocando = false;
    let dedo = null;          // identificador del primer dedo: los demás no cuentan
    let decidido = 0;         // 0 sin decidir · 1 la hoja · 2 el scroll interno · -1 horizontal
    let y0 = 0, x0 = 0, yAnterior = 0;
    let base = 0, pos = 0, alto = 0;
    let enTirador = false;
    let raf = 0;
    let finArrastre = 0;
    const vel = crearVelocimetro();

    // Un solo escritor de estilos, dentro de rAF: escribir el transform en cada
    // touchmove encola varios estilos por fotograma y la hoja va con retraso.
    const pintar = () => {
      raf = 0;
      hoja.style.transform = transformada(pos, false);
      velo.style.opacity = String(limitar(1 - pos / (alto || 1)));
    };

    const empezarArrastre = () => {
      // will-change solo mientras dura: dejarlo fijo reservaría una capa de
      // composición todo el rato que la ficha está abierta.
      hoja.style.willChange = 'transform';
      // Mientras el dedo lleva la hoja, el contenido no se desplaza por debajo.
      cuerpo.style.overflowY = 'hidden';
      hoja.dataset.arrastrando = '';
    };

    const tocar = (e) => [...e.touches].find((t) => t.identifier === dedo);

    const alEmpezar = (e) => {
      if (esPanel()) return;
      // Un segundo dedo no reinicia nada: si no, cambiar de dedo a medias
      // haría saltar la hoja a la posición del nuevo.
      if (tocando) return;
      const t = e.touches[0];
      if (!t) return;
      tocando = true;
      dedo = t.identifier;
      x0 = t.clientX;
      y0 = yAnterior = t.clientY;
      alto = hoja.offsetHeight;
      enTirador = !!e.target.closest?.('[data-tirador]');
      vel.limpiar();
      base = 0; pos = 0; decidido = 0;

      // ¿Estaba moviéndose? Se agarra donde esté (su valor EN PANTALLA, no su
      // destino) y desde ahí la lleva el dedo: abrir, cerrar o volver a su
      // sitio se pueden interrumpir en cualquier instante.
      if (anim) {
        const { valor } = anim.parar();
        anim = null;
        cerrando = false;
        if (Math.abs(valor) > 2) {
          base = pos = valor;
          decidido = 1;
          empezarArrastre();
        } else {
          enReposo();
        }
      }
      vel.anotar(pos);
    };

    const alMover = (e) => {
      if (!tocando) return;
      const t = tocar(e);
      if (!t) return;
      const y = t.clientY;
      const dy = y - y0;
      const dx = t.clientX - x0;
      const bajando = y > yAnterior;
      yAnterior = y;

      if (decidido === 0) {
        const arriba = cuerpo.scrollTop <= 0;
        if (Math.abs(dy) < HOLGURA && Math.abs(dx) < HOLGURA) {
          // Estos primeros píxeles se bloquean mientras se decide, pero solo
          // si el contenido está arriba (o en el tirador): es justo la ventana
          // en la que iOS se compromete con el "tirar para recargar".
          if ((enTirador || arriba) && e.cancelable) e.preventDefault();
          return;
        }
        if (Math.abs(dx) > Math.abs(dy)) { decidido = -1; return; }
        if (enTirador || (dy > 0 && arriba)) {
          decidido = 1;
          empezarArrastre();
        } else {
          decidido = 2;   // es para leer: el scroll interno sigue a lo suyo
          return;
        }
      }

      if (decidido === 2) {
        // Relevo del scroll al arrastre: ibas subiendo el contenido y has
        // llegado arriba del todo. A partir de aquí, el mismo dedo se lleva la
        // hoja, sin soltar y volver a tocar (como en iOS).
        if (bajando && cuerpo.scrollTop <= 0) {
          decidido = 1;
          y0 = y; base = 0; pos = 0;
          vel.limpiar(); vel.anotar(0);
          empezarArrastre();
        } else return;
      }
      if (decidido !== 1) return;

      // Ya es nuestro: la garantía real contra el "tirar para recargar".
      if (e.cancelable) e.preventDefault();
      const crudo = base + (y - y0);
      // Hacia abajo, 1:1. Hacia arriba no hay nada más que enseñar: cede con
      // goma, cada vez menos, en vez de pararse en seco.
      pos = crudo >= 0 ? crudo : goma(crudo, window.innerHeight * 0.12);
      if (reducido) return;   // mismo gesto, sin seguir al dedo
      vel.anotar(pos);
      if (!raf) raf = requestAnimationFrame(pintar);
    };

    const alSoltar = (e) => {
      if (!tocando) return;
      if (tocar(e)) return;           // el primer dedo sigue puesto
      tocando = false;
      dedo = null;
      cuerpo.style.overflowY = '';
      const eraNuestro = decidido === 1;
      decidido = 0;
      if (!eraNuestro) return;
      delete hoja.dataset.arrastrando;
      if (raf) { cancelAnimationFrame(raf); raf = 0; if (!reducido) pintar(); }
      finArrastre = performance.now();

      if (reducido) {
        if (pos > REDUCIDO_CERRAR) salir({ motivo: 'gesto', desde: 0 });
        return;
      }

      const v = vel.valor();   // px/ms; > 0 hacia abajo
      // Distancia O velocidad, juntas en una sola cuenta: adónde llegaría la
      // hoja si la soltaras con esta inercia (proyección de Apple). Un
      // lanzamiento corto y rápido proyecta lejos y cierra; arrastrarla
      // despacio hasta la mitad también. Soltarla subiendo nunca cierra,
      // aunque esté muy abajo: el último movimiento del dedo es la intención.
      const umbral = Math.min(alto * 0.5, window.innerHeight * 0.3);
      const cerrar = v > SUBIENDO && pos > MINIMO_CERRAR && pos + proyectar(v) > umbral;
      if (cerrar) {
        salir({ motivo: 'gesto', desde: pos, velocidad: v });
      } else {
        // Vuelta con la velocidad del dedo (sin costura entre arrastre y
        // animación). Solo rebota si se lanzó: ver MUELLE_VUELTA_LANZADA.
        const params = Math.abs(v) > LANZAMIENTO ? MUELLE_VUELTA_LANZADA : MUELLE_VUELTA;
        mover(pos, 0, v, params).then((ok) => ok && enReposo());
      }
    };

    // Si ha habido arrastre, el toque no debe contar como clic: sin esto,
    // soltar sobre una sesión abría la web del cine.
    const alClic = (e) => {
      if (performance.now() - finArrastre < 350) {
        e.stopPropagation();
        e.preventDefault();
        finArrastre = 0;
      }
    };

    // passive:false SOLO en touchmove, el único que llama a preventDefault.
    // React registra los suyos como pasivos: tiene que ser aquí, no en el JSX.
    hoja.addEventListener('touchstart', alEmpezar, { passive: true });
    hoja.addEventListener('touchmove', alMover, { passive: false });
    hoja.addEventListener('touchend', alSoltar, { passive: true });
    hoja.addEventListener('touchcancel', alSoltar, { passive: true });
    document.addEventListener('click', alClic, true);

    return () => {
      hoja.removeEventListener('touchstart', alEmpezar);
      hoja.removeEventListener('touchmove', alMover);
      hoja.removeEventListener('touchend', alSoltar);
      hoja.removeEventListener('touchcancel', alSoltar);
      document.removeEventListener('click', alClic, true);
      if (raf) cancelAnimationFrame(raf);
      anim?.parar();
      fundido?.forEach((x) => x.cancel());
      enReposo();
      hoja.style.opacity = '';
      cuerpo.style.overflowY = '';
    };
  }, []);

  return (
    <div className="hoja-capa" data-variante={variante}>
      {/* El velo no es el diálogo: solo oscurece y, al tocarlo, cierra. */}
      <div className="hoja-velo" ref={veloRef} onClick={() => pedirRef.current('velo')} aria-hidden="true" />
      <div
        className="hoja"
        ref={hojaRef}
        data-variante={variante}
        role="dialog"
        aria-modal="true"
        aria-labelledby={etiquetadaPor}
        aria-label={etiquetadaPor ? undefined : etiqueta}
        tabIndex={-1}
      >
        {/* Zona de agarre que nunca hace scroll: desde aquí siempre se puede
            arrastrar, aunque el contenido esté desplazado. */}
        <div className="hoja-tirador" data-tirador aria-hidden="true" />
        <button type="button" className="hoja-cerrar boton-icono" onClick={() => pedirRef.current('boton')} aria-label="Cerrar">
          <Icono nombre="aspa" />
        </button>
        <div className="hoja-cuerpo" ref={cuerpoRef}>{children}</div>
      </div>
    </div>
  );
}
