'use client';

import { useEffect, useRef, useState } from 'react';
import { minutesToHuman } from '@/lib/normalize.js';
import { fechaCorta, mesDe } from '@/lib/proximas.js';
import { goma, crearVelocimetro, movimientoReducido, alTerminarTransicion } from '@/lib/gestos.js';
import { bloquearScroll, desbloquearScroll } from '@/lib/bloqueoScroll.js';

// Panel de "Próximas". Reutiliza la misma mecánica de hoja que la ficha de
// película: arrastrar hacia abajo la descarta, con el mismo tirador y las
// mismas reglas, para que el gesto se aprenda una sola vez.

export default function UpcomingSheet({ peliculas, onClose }) {
  const capaRef = useRef(null);
  const hojaRef = useRef(null);
  const cerrarRef = useRef(onClose);
  const [abierta, setAbierta] = useState(null); // clave de la peli desplegada
  useEffect(() => { cerrarRef.current = onClose; });

  useEffect(() => {
    const hoja = hojaRef.current;
    const anterior = document.activeElement;
    bloquearScroll();
    hoja?.focus({ preventScroll: true });

    const alTeclear = (e) => {
      if (e.key === 'Escape') { cerrarRef.current?.(); return; }
      if (e.key !== 'Tab' || !hoja) return;
      const focos = hoja.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focos.length) return;
      const primero = focos[0], ultimo = focos[focos.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      desbloquearScroll();
      anterior?.focus?.({ preventScroll: true });
    };
  }, []);

  // Mismo gesto que la ficha: se arrastra desde el tirador, o desde el cuerpo
  // solo si el contenido ya está arriba del todo.
  useEffect(() => {
    const hoja = hojaRef.current;
    const capa = capaRef.current;
    if (!hoja || !capa || movimientoReducido()) return;

    let activo = false, decidido = 0, y0 = 0, x0 = 0, y = 0, raf = 0;
    const vel = crearVelocimetro();

    const pintar = () => {
      raf = 0;
      const p = Math.min(1, Math.abs(y) / (hoja.offsetHeight || window.innerHeight));
      hoja.style.transform = `translate3d(0, ${y}px, 0)`;
      capa.style.opacity = String(1 - p * 0.6);
    };

    const alEmpezar = (e) => {
      if (e.touches.length !== 1) { activo = false; return; }
      const enTirador = !!e.target.closest?.('[data-tirador]');
      if (!enTirador && hoja.scrollTop > 0) { activo = false; return; }
      activo = true; decidido = 0; y = 0;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
      vel.limpiar(); vel.anotar(0);
      hoja.style.transition = 'none';
      hoja.style.animation = 'none';
      hoja.style.willChange = 'transform';
    };

    const alMover = (e) => {
      if (!activo) return;
      const dy = e.touches[0].clientY - y0;
      const dx = e.touches[0].clientX - x0;
      if (decidido === 0) {
        if (Math.abs(dy) < 3 && Math.abs(dx) < 3) { e.preventDefault(); return; }
        decidido = (dy > 0 && Math.abs(dy) > Math.abs(dx)) ? 1 : -1;
        if (decidido === -1) { activo = false; hoja.style.transition = ''; return; }
        hoja.style.overflowY = 'hidden';
      }
      e.preventDefault();
      y = dy > 0 ? dy : goma(dy, window.innerHeight * 0.22);
      vel.anotar(y);
      if (!raf) raf = requestAnimationFrame(pintar);
    };

    const alSoltar = () => {
      if (!activo) return;
      activo = false;
      hoja.style.overflowY = '';
      if (decidido !== 1) { hoja.style.transition = ''; return; }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      const v = vel.valor();
      const alto = hoja.offsetHeight || window.innerHeight;
      if (y > alto * 0.26 || (v > 0.55 && y > 40)) {
        const ms = Math.round(Math.min(320, Math.max(130, (alto - y) / Math.max(0.7, v))));
        hoja.style.transition = `transform ${ms}ms var(--ease-out)`;
        hoja.style.transform = `translate3d(0, ${alto}px, 0)`;
        capa.style.transition = `opacity ${ms}ms linear`;
        capa.style.opacity = '0';
        alTerminarTransicion(hoja, 'transform', ms, () => cerrarRef.current?.());
      } else {
        hoja.style.transition = 'transform 380ms var(--ease-back)';
        hoja.style.transform = 'translate3d(0,0,0)';
        capa.style.transition = 'opacity 220ms var(--ease-out)';
        capa.style.opacity = '1';
      }
    };

    hoja.addEventListener('touchstart', alEmpezar, { passive: true });
    hoja.addEventListener('touchmove', alMover, { passive: false });
    hoja.addEventListener('touchend', alSoltar, { passive: true });
    hoja.addEventListener('touchcancel', alSoltar, { passive: true });
    return () => {
      hoja.removeEventListener('touchstart', alEmpezar);
      hoja.removeEventListener('touchmove', alMover);
      hoja.removeEventListener('touchend', alSoltar);
      hoja.removeEventListener('touchcancel', alSoltar);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  let mesAnterior = null;

  return (
    <div className="modal-overlay" ref={capaRef} onClick={onClose}>
      <div
        className="modal proximas"
        ref={hojaRef}
        role="dialog"
        aria-modal="true"
        aria-label="Próximas películas"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-tirador" data-tirador aria-hidden="true" />
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

        <div className="prox-head">
          <h2 className="prox-title">Próximas</h2>
          <p className="prox-sub">
            Ciclos y reestrenos que los cines ya tienen puestos en el calendario,
            más allá de los días de la cartelera.
          </p>
        </div>

        {peliculas.length === 0 ? (
          <div className="empty">
            <div className="em-ic">🗓️</div>
            <h3>Nada programado todavía</h3>
            <p>Cuando los cines anuncien ciclos o reestrenos, aparecerán aquí.</p>
          </div>
        ) : (
          <ul className="prox-lista">
            {peliculas.map((p) => {
              const clave = p.id || p.title;
              const mes = mesDe(p.primeraFecha);
              const nuevoMes = mes !== mesAnterior;
              mesAnterior = mes;
              const desplegada = abierta === clave;
              const duracion = minutesToHuman(p.durationMin);

              return (
                <li key={clave}>
                  {nuevoMes && <div className="prox-mes">{mes}</div>}
                  <div className={`prox-item${desplegada ? ' abierta' : ''}`}>
                    <button
                      type="button"
                      className="prox-cabecera"
                      aria-expanded={desplegada}
                      onClick={() => setAbierta(desplegada ? null : clave)}
                    >
                      <span className="prox-cartel">
                        {p.posterUrl
                          ? <img src={p.posterUrl} alt="" loading="lazy" />
                          : <span className="prox-cartel-ph" aria-hidden="true" />}
                      </span>
                      <span className="prox-datos">
                        <span className="prox-nombre">{p.title}</span>
                        <span className="prox-meta">
                          {p.genre && <span>{p.genre}</span>}
                          {duracion && <span>{duracion}</span>}
                          <span className="prox-cuenta">
                            {p.pases.length} {p.pases.length === 1 ? 'pase' : 'pases'}
                          </span>
                        </span>
                      </span>
                      <span className="prox-cuando">
                        {/* Lo primero que uno quiere saber: cuándo cae */}
                        <span className="prox-fecha">{fechaCorta(p.primeraFecha)}</span>
                        <span className="prox-flecha" aria-hidden="true">›</span>
                      </span>
                    </button>

                    {desplegada && (
                      <div className="prox-detalle">
                        {p.synopsis && <p className="prox-sinopsis">{p.synopsis}</p>}
                        <div className="prox-pases">
                          {p.pases.map((pase, i) => (
                            <div className="prox-pase" key={`${pase.iso}-${pase.cineId}-${i}`}>
                              <span className="prox-pase-dia">{fechaCorta(pase.iso)}</span>
                              <span className="prox-pase-cine">
                                <span className="f-dot" style={{ background: pase.color }} aria-hidden="true" />
                                {pase.cineNombre}
                              </span>
                              <span className="prox-pase-horas">
                                {pase.sesiones.map((s, j) => (
                                  s.buyUrl ? (
                                    <a key={j} className="prox-hora" href={s.buyUrl} target="_blank" rel="noreferrer">
                                      {s.time}
                                    </a>
                                  ) : (
                                    <span key={j} className="prox-hora">{s.time}</span>
                                  )
                                ))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
