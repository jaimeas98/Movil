'use client';

import { useLayoutEffect, useRef } from 'react';
import { minutesToHuman } from '@/lib/normalize.js';
import { useTituloQueCabe } from '@/lib/tituloQueCabe.js';
import Hoja from './Hoja.jsx';
import Icono from './Icono.jsx';
import { Avisos } from './Estados.jsx';
import { Cartel, GrupoCine, notaMedia } from './Pelicula.jsx';
import { cartelDe } from '@/lib/transicionCartel.js';

function buscable(title) {
  return encodeURIComponent(String(title || '').replace(/\(.*?\)/g, '').trim());
}

// Una cifra como se escribe en España: "7,4", no "7.4".
const decimal = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Desglose por fuente. Las notas llegan como cadenas ("7.4", "85%") y
// cualquiera puede faltar. Cada una se pinta en SU escala, escrita al lado:
// el % de Rotten Tomatoes es la proporción de críticos que la aprueban, no una
// nota media, y ponerlas todas sobre 10 sería dar gato por liebre. (Hubo un
// medidor de 0–100 debajo de cada cifra: repetía el número en una barra y
// sobraba; la cifra grande ya se compara de un vistazo.)
//
// La media de la API (`average`, sobre 100) junta IMDb, Rotten y Metacritic;
// TMDB solo entra cuando no hay ninguna de las tres (app/api/ratings). TMDB es
// el voto de su público y antes se presentaba como si fuera de IMDb: ahora
// sale siempre que exista, con su nombre, y se dice si entra o no en la media.
function fuentes(title, ratings) {
  const q = buscable(title);
  const num = (v) => {
    if (v == null) return null;
    const n = parseFloat(String(v).replace(',', '.').replace('%', ''));
    return Number.isFinite(n) ? n : null;
  };
  const imdb = num(ratings?.imdb);
  const rt = num(ratings?.rt);
  const mc = num(ratings?.metacritic);
  const tmdb = num(ratings?.tmdb);
  return [
    { clave: 'imdb', nombre: 'IMDb', escala: '/10', valor: imdb, texto: imdb != null ? decimal(imdb) : null, url: `https://www.imdb.com/find/?q=${q}&s=tt` },
    { clave: 'rt', nombre: 'Rotten Tomatoes', escala: '%', valor: rt, texto: rt != null ? String(Math.round(rt)) : null, url: `https://www.rottentomatoes.com/search?search=${q}` },
    { clave: 'mc', nombre: 'Metacritic', escala: '/100', valor: mc, texto: mc != null ? String(Math.round(mc)) : null, url: `https://www.metacritic.com/search/${q}/` },
    { clave: 'tmdb', nombre: 'TMDB', escala: '/10', valor: tmdb, texto: tmdb != null ? decimal(tmdb) : null, url: `https://www.themoviedb.org/search?query=${q}` },
  ].filter((s) => s.valor != null);
}

const escalaHablada = { '/10': 'sobre 10', '%': 'por ciento', '/100': 'sobre 100' };

// La ficha de una película: cartel grande, título, datos, nota media, sinopsis,
// las sesiones del día en TODOS los cines que la echan (las mismas entradas de
// la cartelera) y el desglose de notas.
//
//   pelicula     la película ya juntada de varios cines (lib/cartelera.js):
//                { title, posterUrl, durationMin, ageRating, generos, synopsis,
//                  ratings, isNew, cines: [{ cine, sessions }] }
//   rotuloDia    "Hoy, viernes 16 de octubre": de qué día son las sesiones
//   salida       el cierre con View Transition (ver components/Hoja.jsx)
//   traspasar    (x, y) => Element: otra película de la lista bajo el velo del
//                panel; tocarla cambia la ficha sin cerrarla (page.js)
export default function MovieModal({ pelicula, fecha, rotuloDia, onCerrar, salida, focoAlCerrar, traspasar }) {
  const ratings = pelicula.ratings ?? null;
  const duracion = minutesToHuman(pelicula.durationMin);
  const media = notaMedia(ratings);
  const notas = fuentes(pelicula.title, ratings);
  const enLaMedia = notas.filter((n) => n.clave !== 'tmdb');
  const generos = pelicula.generos?.length ? pelicula.generos : pelicula.genre ? [pelicula.genre] : [];
  const cines = pelicula.cines ?? [];
  const trailer = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${pelicula.title} tráiler oficial`)}`;
  const nSesiones = cines.reduce((n, c) => n + c.sessions.length, 0);
  // Sin partir palabras: si una no cabe, el título encoge (lib/tituloQueCabe.js).
  // El factor va en los datos, que es donde lo lee también el hueco de la equis.
  const tituloRef = useRef(null);
  const datosRef = useRef(null);
  useTituloQueCabe(tituloRef, pelicula.title, datosRef);

  // Otra película en la misma ficha (con el panel abierto se elige en la
  // lista sin cerrarlo): la nueva empieza arriba, con su cartel a la vista
  // (es adonde vuela su copia), y el foco vuelve al diálogo para que el lector
  // de pantalla anuncie el título nuevo. En el layout effect, para que la foto
  // de después de la View Transition ya salga así.
  const claveAnterior = useRef(pelicula.clave);
  useLayoutEffect(() => {
    if (claveAnterior.current === pelicula.clave) return;
    claveAnterior.current = pelicula.clave;
    const hoja = tituloRef.current?.closest('.hoja');
    const cuerpo = hoja?.querySelector('.hoja-cuerpo');
    if (cuerpo) cuerpo.scrollTop = 0;
    hoja?.focus({ preventScroll: true });
  }, [pelicula.clave]);

  return (
    <Hoja
      variante="ficha" etiquetadaPor="ficha-titulo" onCerrar={onCerrar} salida={salida} focoAlCerrar={focoAlCerrar}
      hueco={() => cartelDe(pelicula.clave)} claveHueco={pelicula.clave} traspasar={traspasar}
    >
      <header className="ficha-cabeza">
        {/* El cartel al que vuela el de la lista (view-transition-name en
            hojas.css). Sin carga perezosa ni decodificación diferida: la View
            Transition lo fotografía en el mismo fotograma en que se monta y,
            si aún no estuviera pintado, el vuelo aterrizaría en un hueco. */}
        <div className="ficha-cartel">
          <Cartel pelicula={pelicula} className="ficha-cartel-img" inmediato />
        </div>

        <div className="ficha-datos" ref={datosRef}>
          <h2 className="ficha-titulo" id="ficha-titulo" ref={tituloRef}>{pelicula.title}</h2>
          <p className="ficha-meta">
            {duracion && <span>{duracion}</span>}
            {pelicula.ageRating && <span className="ficha-edad">{pelicula.ageRating}</span>}
            {generos.map((g) => <span key={g}>{g}</span>)}
            {pelicula.isNew && <span className="ficha-estreno">Estreno</span>}
          </p>
          {media && (
            <p className="ficha-media" title="Media de las valoraciones disponibles">
              <Icono nombre="estrella" className="ico ficha-media-icono" />
              <span className="sr">Nota media: </span>
              <span className="ficha-media-num">{media}</span>
              <span className="ficha-media-escala" aria-hidden="true">/10</span>
              <span className="sr"> sobre 10</span>
              {/* De dónde sale la cifra. Con TMDB como única fuente (la media
                  solo lo usa cuando no hay ninguna otra) también se dice. */}
              {enLaMedia.length > 0 ? (
                <span className="ficha-media-pie">
                  media de {enLaMedia.length === 1 ? enLaMedia[0].nombre : `${enLaMedia.length} notas`}
                </span>
              ) : notas.some((n) => n.clave === 'tmdb') && (
                <span className="ficha-media-pie">nota de TMDB</span>
              )}
            </p>
          )}
        </div>
      </header>

      {pelicula.synopsis ? (
        <p className="ficha-sinopsis">{pelicula.synopsis}</p>
      ) : (
        <p className="ficha-sinopsis ficha-sin">Los cines no han publicado sinopsis de esta película.</p>
      )}

      <section className="ficha-seccion" aria-labelledby="ficha-sesiones">
        <h3 className="ficha-h" id="ficha-sesiones">
          Sesiones<span className="ficha-h-dia"> · {rotuloDia}</span>
        </h3>
        {/* De qué día y hora son los datos de cada cine, si no son de ahora:
            nunca se presenta lo guardado como si fuera fresco. */}
        <Avisos cines={cines.map((c) => c.cine)} />
        {nSesiones === 0 ? (
          <p className="ficha-sin">No hay sesiones este día.</p>
        ) : (
          <div className="ficha-cines">
            {/* El mismo grupo que en la cartelera (lo común escrito una vez,
                las empezadas en su línea). Sin enlace de compra las entradas
                no hacen nada aquí: ya estás en la ficha. */}
            {cines.map(({ cine, sessions }) => (
              <GrupoCine key={cine.id} cine={cine} sessions={sessions} pelicula={pelicula} fecha={fecha} onAbrir={null} nivel={4} />
            ))}
          </div>
        )}
      </section>

      {notas.length > 0 && (
        <section className="ficha-seccion" aria-labelledby="ficha-notas">
          <h3 className="ficha-h" id="ficha-notas">Valoraciones</h3>
          <ul className="notas" data-n={notas.length}>
            {notas.map((n) => (
              <li key={n.clave}>
                <a
                  className="nota"
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${n.nombre}: ${n.texto} ${escalaHablada[n.escala]}. Abrir en ${n.nombre}, se abre en otra pestaña`}
                >
                  <span className="nota-fuente">{n.nombre}</span>
                  <span className="nota-cifra">
                    <span className="nota-num">{n.texto}</span>
                    <span className="nota-escala">{n.escala}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {notas.some((n) => n.clave === 'tmdb') && enLaMedia.length > 0 && (
            <p className="notas-pie">TMDB es el voto de su público y no entra en la media.</p>
          )}
        </section>
      )}

      <div className="ficha-enlaces">
        <a href={trailer} target="_blank" rel="noopener noreferrer" className="boton">
          <Icono nombre="play" className="ico" />Tráiler en YouTube
          <span className="sr"> (se abre en otra pestaña)</span>
        </a>
        {/* FilmAffinity no publica nota por API, así que no puede tener cifra
            aquí; pero para el público español sigue siendo la referencia. */}
        <a
          href={`https://www.filmaffinity.com/es/search.php?stext=${buscable(pelicula.title)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="boton"
        >
          FilmAffinity<Icono nombre="externo" className="ico ico-enlinea" />
          <span className="sr"> (se abre en otra pestaña)</span>
        </a>
      </div>
    </Hoja>
  );
}
