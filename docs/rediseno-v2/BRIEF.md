# Rediseño v2 — brief de dirección

Encargo de Jaime (16-10-2026): rediseño TOTAL del frontal, no un retoque.
Otra forma de verse, de moverse y de usarse, sin perder nada de lo que hace
hoy (ver `PRODUCT.md`). El backend no se toca. El diseño anterior está
guardado en la rama `diseno-v1` (y en el commit 7081fca).

Skills de referencia en `.claude/skills/`: `impeccable` (dirección, craft
floor, crítica), `emil-design-eng` + `apple-design` + `animate` +
`review-animations` + `animation-performance` (movimiento), `design-taste-
frontend` + `redesign-existing-projects` (antigenérico). Los scripts de esas
skills NO están (ver `.claude/skills/LEEME.md`): se trabaja en su modo sin
lanzador, leyendo las guías.

Modo (Impeccable): **Operate** con un componente de **Experience** (los
carteles). La claridad manda; la marca vive en los detalles precisos.

---

## Diagnóstico del diseño actual (lo que se abandona)

- La arquitectura es por cine: la misma película aparece hasta cuatro veces y
  en el móvil la página mide ~17 500 px. Comparar horarios de una película
  entre cines obliga a ir y volver por la página.
- Es el aspecto por defecto de la categoría: casi negro + un acento dorado +
  rejilla de carteles iguales + etiquetas en mayúsculas espaciadas por todas
  partes (GÉNERO, CINE, DATOS EN VIVO, 8 PELÍCULAS).
- Dos filas de pastillas (género y cine) ocupan la primera pantalla del móvil;
  la cartelera empieza por debajo del pliegue.
- Las horas de las sesiones, que es lo que de verdad se viene a mirar, son
  lo más pequeño de la tarjeta.

## Contrato de dirección

**THESIS.** La hora es la protagonista. La pregunta real es "¿a qué hora y
dónde la veo?", así que cada película se lee como su lista de horas por toda
la bahía, en grande, y existe una vista por horas para "qué empieza ahora".
Se rechaza la rejilla de carteles por cine, con la hora en letra pequeña.

**OWN-WORLD. "Marquesina de la Bahía".** Las letras de luz de las marquesinas
de cine y la noche azul de la bahía de Cádiz.
- Oscuro (por defecto): fondo azul noche de bahía, tintado y profundo (nunca
  negro puro ni gris neutro); tinta blanco cal; acento **rojo butaca**
  (terciopelo de sala, cálido, no neón) para lo seleccionado y la acción
  principal; la hora "ahora" en ámbar de bombilla de marquesina, solo para lo
  que está a punto de empezar.
- Claro: fondo blanco cal frío (no crema ni papel), tinta añil, el mismo rojo.
- Los cuatro cines conservan cada uno su color, reajustado a esta paleta para
  que se distingan entre sí y con suficiente contraste en los dos temas.
- Tipografía: **Big Shoulders Display** (condensada, de rótulo y marquesina)
  para horas, títulos de película y día; **Hanken Grotesk** para todo lo
  demás. Las dos autoalojadas con `@fontsource-variable/*` (npm), nunca un
  `<link>` a Google Fonts. Números tabulares en todas las horas.
- Lenguaje de componentes: la **sesión es una entrada de cine**, una pieza
  con su hora grande y, en pequeño, idioma y formato (VOSE, 3D, sala) y el
  color de su cine. Pulsarla lleva a comprar. Las sesiones ya pasadas de hoy
  se apagan; las de la próxima hora se encienden en ámbar con "en 25 min".
- Sin tarjetas dentro de tarjetas, sin degradados de texto, sin cristal
  decorativo, sin etiquetas en mayúsculas encima de los títulos, sin emoji
  como iconos (iconos SVG propios, trazo único).

**STORY.** Abro la web: veo el día y, al momento, las películas de hoy con
sus horas en grande. Bajo con el dedo: cada película me dice dónde y cuándo.
Toco una hora y voy a comprar; toco el cartel y veo la ficha. Si quiero lo
que empieza ya, cambio a la vista por horas. Deslizo para cambiar de día.

**FIRST VIEWPORT (móvil, 390 × 844).**
1. Barra superior fina: marca "Cartelera" en Big Shoulders y, a la derecha,
   iconos de Próximas, actualizar y tema.
2. Tira de días fija (sticky), compacta: día de la semana y número; hoy y
   mañana se nombran así. El día elegido, en rojo butaca.
3. Una fila de controles: buscar (icono que se expande), los cuatro cines
   como interruptores con su color, "Género" (abre un panel) y el cambio
   **Películas / Horario**.
4. Debajo, ya a la vista sin bajar, la primera película entera: su cartel,
   su título y sus horas por cine.

En escritorio, la misma estructura aprovechando el ancho: películas en dos
columnas (o lista con más aire), barra de controles a la izquierda o arriba,
y la ficha como panel lateral en vez de una hoja que sube.

**FORM.** Elegida a mano (los scripts de "concept-seed" de Impeccable no
están; ver LEEME). Por qué esta: la idea sale del propio uso —decidir a qué
hora— y de un objeto del mundo del cine que todo el mundo conoce, la entrada
y la marquesina; y deja fuera los dos lugares comunes de la categoría:
negro+dorado con carteles, y "periódico" crema con filetes y serifas.
`seed: none (unavailable)`.

**FINISH.** unreviewed and undocumented is unfinished; this build ends with
the finish review, the verdict, DESIGN.md, and every shipping raster
carrying its provenance.

---

## Arquitectura de la información

### Vista "Películas" (por defecto)
- **Una entrada por película**, no por cine. Las películas que coinciden en
  varios cines se juntan con `pareceElMismo`/`normaliza` de
  `lib/ratings/match.js` (con prudencia: un reestreno "25 aniversario" no se
  junta con la película nueva; si hay duda, no se junta).
- Cada película: cartel, título, duración, edad, nota media (si hay), géneros,
  y sus sesiones **agrupadas por cine** (color + nombre corto del cine) como
  entradas.
- Orden: por la primera sesión que aún no ha empezado (hoy) o por hora de
  la primera sesión (otros días). Las que ya no tienen sesiones hoy van al
  final, apagadas, o se ocultan con un "Ver también las que ya han empezado".
- El filtro de cine deja ver solo uno o varios cines (interruptores; cero
  activos = todos).

### Vista "Horario"
- Todas las sesiones del día en orden de hora, agrupadas por franja
  (tarde, noche… o por hora en punto). Cada fila: hora grande, título,
  cine (color), idioma/formato. Hoy: una línea "ahora" y las que empiezan en
  menos de una hora encendidas con "en 25 min". Tocar la fila = comprar (o
  ficha si no hay enlace).

### Ficha de película
- Móvil: hoja que sube desde abajo, arrastrable para cerrar con la velocidad
  del dedo (muelle, ver `apple-design` §3–6), con tirador. Escritorio: panel
  lateral o diálogo centrado.
- Cartel grande, título, datos, notas desglosadas (IMDb, RT, Metacritic,
  TMDB, media), sinopsis, tráiler, sesiones del día por cine con compra, y
  aviso de datos antiguos si los hay.
- Transición: el cartel de la lista crece hasta su sitio en la ficha
  (elemento compartido; View Transitions API donde exista, si no, un
  fundido corto). Es la interacción firma.

### Resto
- Próximas: hoja/panel con la misma gramática.
- Estados: cargando (esqueletos con la forma real), error, vacío por
  filtros, cine sin datos, datos antiguos ("datos del…"), sin conexión.
- Atajos de teclado y su panel de ayuda (escritorio).
- Pie mínimo: los cuatro cines y "los horarios pueden cambiar".

## Movimiento (una gramática, no efectos sueltos)
- Muelles críticamente amortiguados por defecto; rebote solo tras un gesto
  con inercia (soltar la hoja, deslizar el día).
- Cambio de día: el deslizamiento que ya existe, revisado con
  `review-animations`; nada de entradas en cascada cada vez que cambias de
  día (se ve 100 veces al día: sin animación de adorno).
- Pulsación: respuesta al apretar (`:active` scale 0.97), instantánea.
- Firma: cartel → ficha.
- `prefers-reduced-motion`: fundidos cortos, sin desplazamientos.
- Solo `transform`/`opacity` (y `clip-path`/`filter` donde vaya fluido).

## Restricciones
- No tocar `lib/cinemas`, `lib/ratings`, `app/api`, `data/`, `scripts/movil`.
  `lib/gestos.js` y `lib/bloqueoScroll.js` sí se pueden reutilizar o mejorar.
- Conservar la lógica de `app/page.js`: caché (`cartelera_v3`), respaldo en
  dispositivo, fusión con caché, carga de notas, cálculo de días y Próximas,
  teclado, gestos. Se puede reorganizar en componentes/hooks, pero no
  perder comportamiento.
- Sin librerías de animación ni de UI nuevas (peso y velocidad). Fuentes por
  npm. Next 14, React 18, CSS propio (se puede partir `globals.css` en
  ficheros por componente).
- Accesible: contraste AA, foco visible, objetivos táctiles de 44 px, roles
  ARIA de la tira de días (tablist/tabpanel), `aria-live` del día.
- Rendimiento: imágenes perezosas, nada que bloquee el primer pintado,
  `content-visibility` en listas largas si ayuda.

## Cómo se verifica
- Servidor local con datos de ejemplo: `CARTELERA_SAMPLE=1 npx next dev -p 3100`.
- Capturas con carteles y notas simulados (aquí no hay red a los cines):
  `$SCRATCHPAD/shot/capturar.mjs` y `mocks.mjs` (ver cabecera).
- Escritorio 1440 y móvil 390, oscuro y claro, y estados: ficha abierta,
  panel de géneros, Próximas, vista Horario, búsqueda sin resultados.
- `npx next build` sin errores; las pruebas de `scripts/test-*.mjs` que no
  dependen de Playwright siguen pasando.
