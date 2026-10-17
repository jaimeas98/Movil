---
name: Cartelera Cine Jaime · Bahía de Cádiz
description: La cartelera de los cuatro cines de la bahía, leída por horas, con la noche azul de la bahía y las letras de las marquesinas.
colors:
  # Oscuro (por defecto)
  fondo-noche: "#0B1526"
  superficie-noche: "#13213A"
  flotante-noche: "#1B2C4B"
  tinta-cal: "#EEF1F4"
  apagada-noche: "#A6B3C8"
  tenue-noche: "#8695AE"
  rojo-butaca: "#C22E43"
  rojo-butaca-texto: "#FF8E9C"
  ambar-bombilla: "#F4B642"
  linea-noche: "rgba(166, 179, 200, 0.16)"
  linea-fuerte-noche: "rgba(166, 179, 200, 0.30)"
  velo-noche: "rgba(4, 9, 18, 0.72)"
  cine-cinesur: "#F27EB2"
  cine-bahiasur: "#62C3F0"
  cine-areasur: "#B7A0F6"
  cine-artesiete: "#5CD39A"
  # Claro
  fondo-cal: "#F2F5F9"
  superficie-cal: "#FFFFFF"
  tinta-anil: "#17224A"
  apagada-cal: "#4A5677"
  tenue-cal: "#5D6886"
  rojo-butaca-claro: "#B3263A"
  rojo-texto-claro: "#9C1F33"
  ambar-claro: "#EE9F1E"
  ambar-texto-claro: "#8A5600"
  linea-cal: "rgba(23, 34, 74, 0.12)"
  velo-cal: "rgba(23, 34, 74, 0.42)"
  cine-cinesur-claro: "#B02E6C"
  cine-bahiasur-claro: "#0A6A97"
  cine-areasur-claro: "#6845C2"
  cine-artesiete-claro: "#11764A"
typography:
  display:
    fontFamily: "'Big Shoulders Display Variable', 'Arial Narrow', 'Roboto Condensed', sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0"
  headline:
    fontFamily: "'Big Shoulders Display Variable', 'Arial Narrow', 'Roboto Condensed', sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "0.01em"
  title:
    fontFamily: "'Big Shoulders Display Variable', 'Arial Narrow', 'Roboto Condensed', sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
    fontFeature: "tnum"
  title-sm:
    fontFamily: "'Big Shoulders Display Variable', 'Arial Narrow', 'Roboto Condensed', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
  body:
    fontFamily: "'Hanken Grotesk Variable', -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Hanken Grotesk Variable', -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
  detail:
    fontFamily: "'Hanken Grotesk Variable', -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.2
rounded:
  pieza: "6px"
  mando: "8px"
  hoja: "14px"
  control: "999px"
spacing:
  e-1: "4px"
  e-2: "8px"
  e-3: "12px"
  e-4: "16px"
  e-5: "24px"
  e-6: "32px"
  e-7: "48px"
  e-8: "64px"
  margen-movil: "16px"
  margen-tableta: "32px"
  margen-escritorio: "48px"
  toque: "44px"
components:
  entrada:
    backgroundColor: "{colors.superficie-noche}"
    textColor: "{colors.tinta-cal}"
    typography: "{typography.title}"
    rounded: "{rounded.pieza}"
    padding: "6px 11px 7px"
    height: "60px"
    width: "minmax(5.25rem, 1fr)"
  entrada-pronto:
    backgroundColor: "{colors.ambar-bombilla}"
    textColor: "{colors.fondo-noche}"
    typography: "{typography.title}"
    rounded: "{rounded.pieza}"
  dia-elegido:
    backgroundColor: "{colors.rojo-butaca}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    size: "54px"
  dia:
    textColor: "{colors.apagada-noche}"
    rounded: "{rounded.control}"
    size: "54px"
  vista-segmentada:
    backgroundColor: "{colors.superficie-noche}"
    textColor: "{colors.apagada-noche}"
    typography: "{typography.label}"
    rounded: "{rounded.mando}"
    height: "44px"
    padding: "0 7px"
  vista-segmentada-elegida:
    backgroundColor: "{colors.tinta-cal}"
    textColor: "{colors.fondo-noche}"
    rounded: "{rounded.mando}"
  interruptor-cine:
    backgroundColor: "{colors.superficie-noche}"
    textColor: "{colors.tinta-cal}"
    typography: "{typography.label}"
    rounded: "{rounded.mando}"
    height: "44px"
    padding: "0 16px 0 12px"
  pastilla-genero:
    backgroundColor: "{colors.superficie-noche}"
    textColor: "{colors.tinta-cal}"
    typography: "{typography.label}"
    rounded: "{rounded.mando}"
    height: "44px"
    padding: "0 12px"
  campo-busqueda:
    backgroundColor: "{colors.superficie-noche}"
    textColor: "{colors.tinta-cal}"
    typography: "{typography.body}"
    rounded: "{rounded.mando}"
    height: "44px"
    padding: "0 44px 0 42px"
  boton:
    backgroundColor: "{colors.superficie-noche}"
    textColor: "{colors.tinta-cal}"
    typography: "{typography.label}"
    rounded: "{rounded.mando}"
    height: "44px"
    padding: "0 24px"
  boton-principal:
    backgroundColor: "{colors.rojo-butaca}"
    textColor: "#FFFFFF"
    rounded: "{rounded.mando}"
    height: "44px"
    padding: "0 24px"
  boton-icono:
    textColor: "{colors.tinta-cal}"
    rounded: "{rounded.control}"
    size: "44px"
  hueco-falta:
    backgroundColor: "{colors.ambar-bombilla}"
    textColor: "{colors.fondo-noche}"
    rounded: "{rounded.control}"
    padding: "2px 8px"
  hoja:
    backgroundColor: "{colors.flotante-noche}"
    textColor: "{colors.tinta-cal}"
    rounded: "{rounded.hoja}"
    width: "clamp(480px, 46vw, 600px)"
---

# Design System: Cartelera Cine Jaime · Bahía de Cádiz

## Overview

**Creative North Star: "La Marquesina de la Bahía"**

La cartelera se lee como el rótulo de un cine de barrio por la noche: letras de marquesina altas y estrechas sobre el azul hondo de la bahía de Cádiz, y debajo, entradas de papel con la hora en grande. La hora manda. Cada película es "sus horas por toda la bahía", agrupadas por cine con el color de ese cine, y hay una vista por horas para "qué empieza ya". Es una herramienta de uso diario desde el móvil, de tarde o de noche, así que la densidad es la de un producto (Operate), no la de una portada: poco texto de adorno, mucho dato a la vista, y la marca vive en piezas concretas (la entrada troquelada, la línea "Ahora" en ámbar, el rótulo condensado), no en decorado.

El oscuro es el tema por defecto y el de referencia; el claro es "blanco cal" frío con tinta añil y el mismo rojo. Rojo butaca solo para lo elegido y la acción principal; ámbar de bombilla solo para lo que está a punto de empezar. Todo lo demás es azul y tinta, en pasos de tono, sin filetes entre piezas: las separa el aire.

El movimiento es físico y breve: muelles críticamente amortiguados que arrancan a la velocidad del dedo y se pueden agarrar a mitad, una sola interacción firma (el cartel que vuela de la lista a la ficha) y nada de animación de adorno en lo que se hace cien veces al día (cambiar de día, abrir con el teclado).

**Key Characteristics:**
- La hora como protagonista: Big Shoulders 700 a 28 px, cifras en celdas de ancho fijo.
- La sesión es una entrada de papel con el color de su cine y dos muescas de troquel.
- Un solo estado encendido: ámbar "en N min" para la próxima hora y la línea "Ahora".
- Fondo azul noche tintado, nunca negro; tinta blanco cal, nunca blanco puro de pantalla.
- Lo común se dice una vez (la sala junto al cine, la película una vez por minuto en Horario).
- Lo pasado se apaga y se encoge: una línea discreta, no entradas de tamaño completo.
- Muelles con velocidad heredada; gestos 1:1 con el dedo, también con movimiento reducido.

## Colors

Una noche azul de bahía con tres acentos de trabajo (rojo butaca, ámbar bombilla y los cuatro colores de cine), cada uno con un único oficio. Los valores viven en `app/styles/tokens.css` y ningún color se escribe a mano fuera de ese fichero; los contrastes van anotados junto a cada token y se vuelven a medir al tocar un tono.

### Primary
- **Rojo Butaca** (`{colors.rojo-butaca}`; claro `{colors.rojo-butaca-claro}`): terciopelo de sala, cálido y no neón. Es lo SELECCIONADO y la acción principal: el día elegido en la tira, "Reintentar", "Borrar la búsqueda", la selección de texto, el enlace "Saltar a la cartelera". Como relleno lleva tinta blanca (5,6:1 en oscuro, 6,5:1 en claro). Cuando el rojo tiene que ser texto (hoy en la tira, "Estreno", la marca de género elegido, el anillo de foco) se usa **Rojo Butaca Texto** (`{colors.rojo-butaca-texto}`, 8,4:1; claro `{colors.rojo-texto-claro}`).

### Secondary
- **Ámbar Bombilla** (`{colors.ambar-bombilla}`; claro `{colors.ambar-claro}`): la bombilla de la marquesina. Solo para lo que empieza en la próxima hora: el papel de la entrada "en 20 min", la pastilla "en N min" del Horario, la raya de "Ahora". Su tinta es el azul del fondo (10,1:1). Como texto sobre el fondo claro, **Ámbar Texto Claro** (`{colors.ambar-texto-claro}`, 5,6:1).

### Tertiary
- **Los cuatro cines**: Rosa Cinesur (`{colors.cine-cinesur}`), Cielo Bahía Sur (`{colors.cine-bahiasur}`), Lavanda Área Sur (`{colors.cine-areasur}`) y Verde Arte Siete (`{colors.cine-artesiete}`); en claro, sus versiones hondas (`{colors.cine-cinesur-claro}` … `{colors.cine-artesiete-claro}`). Se distinguen entre sí por tono, ninguno se confunde con el rojo ni con el ámbar y todos pasan 4,5:1 como texto en los dos temas (7,3–9,8 en oscuro, 5,2–6,0 en claro). Se eligen por el id del cine (`[data-cine]` → `--cine`), nunca por el hex de los datos. Aparecen como punto de 8–12 px junto al nombre del cine y como tinte del papel de sus entradas (17 % en oscuro, 11 % en claro; 28 % / 19 % al pasar por encima).

### Neutral
- **Azul Noche de Bahía** (`{colors.fondo-noche}`): el fondo de la página y de la tira de días pegada, opaca a propósito (sin desenfoque).
- **Azul Superficie** (`{colors.superficie-noche}`): un paso de tono: el papel base de las entradas, los mandos, los avisos.
- **Azul Flotante** (`{colors.flotante-noche}`): lo que flota encima, la hoja/panel y el panel de géneros.
- **Blanco Cal** (`{colors.tinta-cal}`): la tinta (16,1:1). En claro, **Tinta Añil** (`{colors.tinta-anil}`, 14,1:1) sobre **Blanco Cal Frío** (`{colors.fondo-cal}`) y superficies blancas.
- **Apagada** (`{colors.apagada-noche}`; claro `{colors.apagada-cal}`): texto secundario (lugar del cine, duración, sala, resumen del día): 8,6:1 / 6,7:1.
- **Tenue** (`{colors.tenue-noche}`; claro `{colors.tenue-cal}`): solo lo que ya ha empezado hoy (la línea "17:15 18:00 · ya empezadas", las horas pasadas del Horario). Medido: 6,0:1 sobre el fondo y 4,6:1 dentro de la hoja en oscuro; 5,1:1 y 5,5:1 en claro.
- **Línea** (`{colors.linea-noche}`; claro `{colors.linea-cal}`): casi no se usa. Queda en el borde inferior de la tira pegada, el pie y el panel lateral de escritorio; el tirador y las barras de scroll usan su versión fuerte.
- **Velo** (`{colors.velo-noche}`; claro `{colors.velo-cal}`): detrás de la hoja del móvil; más ligero tras el panel de escritorio (0,5 / 0,26) para seguir leyendo la cartelera.

### Named Rules
**The One Red Rule.** El rojo butaca es lo elegido o la acción principal, y en pantalla hay un rojo grande a la vez (el día). El cambio Películas/Horario va en tinta invertida, no en rojo, precisamente para no pelearse con el día.

**The Single Bulb Rule.** El ámbar significa "empieza en menos de una hora" y nada más. No es un acento ni un color de aviso: los avisos de datos van en apagado con su icono.

**The Paper Tint Rule.** El color de un cine nunca es un fondo pleno ni un borde grueso: es un punto o un tinte del papel (≤ 28 %). La única excepción es el interruptor encendido, que lleva su contorno de 1,5 px en el color del cine.

## Typography

**Display Font:** Big Shoulders Display Variable (con Arial Narrow / Roboto Condensed)
**Body Font:** Hanken Grotesk Variable (con -apple-system / Segoe UI / Roboto)

**Character:** Una condensada de rótulo, alta y con mayúsculas de marquesina, para todo lo que se busca con el ojo (horas, títulos, el día); una grotesca limpia y cálida para todo lo que se lee. Las dos autoalojadas con `@fontsource-variable` e importadas en `app/layout.js`.

### Hierarchy
- **Display** (700, 3rem en ≥ 720 px; 2,5rem en el resto de hojas, línea 0,95): el día elegido en escritorio ("Hoy, viernes 16 de octubre") y los títulos de hoja (Próximas). En el móvil el día baja a **1,375rem** (`--t-dia-linea`) con su resumen debajo en Label: la tira ya lo dice en rojo.
- **Headline** (800, 2rem; 2,25rem en ≥ 720 px; línea 1,04, +0,01em, MAYÚSCULAS): el título de cada película en la cartelera; en la ficha `clamp(1,5rem, 7vw, 1,875rem)` en el móvil y `clamp(1,875rem, 2,4vw + 0,5rem, 2,5rem)` en el panel. Línea 1,04 y no 0,95 en todos los títulos de varias líneas (cartelera, ficha, Próximas, estados): con 0,95 la tilde de una mayúscula tocaba la línea de arriba. Las marquesinas rotulan en mayúsculas y además iguala los títulos que unos cines escriben en mayúsculas y otros no.
- **Title** (700, 1,75rem, línea 1): la hora de cada entrada y de cada hueco del Horario. Big Shoulders no tiene cifras tabulares, así que cada cifra va en una celda de 0,45em (`Hora` en `components/Entrada.jsx`): "11:15" y "20:00" alinean en columna.
- **Title-sm** (800, 1,25rem, MAYÚSCULAS, línea 1,04): el título de película dentro del Horario y de Próximas (1,375rem).
- **Body** (400, 1rem, línea 1,5–1,55): sinopsis (máx. 65ch) y textos de estado (máx. 60ch). 16 px también evita el zoom de iOS en el campo de búsqueda.
- **Label** (600–650, 0,875rem): nombres de cine, mandos, botones, datos de la película, resumen del día. Cifras tabulares.
- **Detail** (500–700, 0,8125rem): lo pequeño de la entrada (VOSE, 3D en 700; sala en apagado), avisos, fuente de cada nota.

### Named Rules
**The Hour First Rule.** En cualquier pieza con sesión, la hora es lo más grande y lo primero; idioma, formato y sala van debajo en Detail. Nunca al revés.

**The Whole Word Rule.** Un título nunca parte una palabra (`overflow-wrap: normal`). Si una palabra sola no cabe en su columna, ese título encoge lo justo (`lib/tituloQueCabe.js`, hasta 0,6×) en vez de cortarse; los demás no cambian.

**The No Kicker Rule.** No hay etiquetas en mayúsculas espaciadas encima de los títulos. Las mayúsculas son de los títulos condensados, no de rótulos de sección.

## Layout

Una columna en el móvil con un margen lateral de 16 px (`--margen`), que crece a 32 px desde 720 px y a 48 px desde 1200 px, dentro de un contenedor de 1320 px.

- **Arriba, en este orden:** barra fina de 56 px (marca y tres iconos), tira de días pegada (chips de 54 px, ~76 px con su relleno) y una fila de controles. En el móvil la fila son dos líneas: [Películas | Horario] [Género] [lupa] y, debajo, los cuatro cines en cuatro columnas iguales (punto encima del nombre, 48 px de alto), que caben a 390 px sin desplazarse. Desde 720 px el buscador es un campo fijo; desde 1180 px todo va en una sola línea.
- **Primera pantalla del móvil (390 × 844):** el día a 22 px con su resumen debajo (la línea del resumen está reservada desde que carga), los avisos, y la primera película con su título (≈ 457 px) y las entradas de su primer cine (≈ 644 px) sin bajar.
- **Películas:** una entrada por película. Cartel de 76 px a la izquierda del título (104 px desde 560 px, entonces el cartel ocupa su columna y las horas van a su derecha). Separación entre películas: 16 px arriba y 32 px abajo, sin filete. Dos columnas desde 960 px (hueco de 48 px).
- **Entradas:** rejilla `repeat(auto-fill, minmax(5.25rem, 1fr))` con 6 px de hueco: todas las de un cine miden lo mismo (91 px a 768 px), incluida la ámbar.
- **Horario:** columna de la hora de 4,25rem (pegada a 84 px del borde superior al bajar) y, a su derecha, una fila por película. Filas a 10 px, huecos de minuto con 6 px arriba y abajo. Desde 900 px, las franjas de una hora se reparten en columnas de ≥ 24rem, como un panel de salidas.
- **Hojas:** en el móvil (< 900 px) suben desde abajo hasta 40 px del borde superior, con máximo 720 px de ancho; en escritorio son un panel lateral derecho de `clamp(480px, 46vw, 600px)` a toda altura (400 px para los atajos): por debajo de 480 px el título de la ficha se quedaba sin columna.
- **Bordes de la pantalla:** `viewport-fit: cover`; la barra, la tira de días pegada, el margen lateral y el final del pie y de las hojas se apartan de `env(safe-area-inset-*)`.
- **Ritmo:** base 4 (`--e-1` … `--e-8`). Grupos apretados (6–8 px dentro de un cine), separación generosa entre películas (48 px de aire).
- `content-visibility: auto` en cada película, con 640 px de tamaño de reserva (las reales miden 540–1040 px).

## Elevation & Depth

Plano por defecto: la profundidad la dan los pasos de tono (fondo → superficie → flotante) y no las sombras. Solo flota lo que está de verdad encima, y su sombra lleva desplazamiento y desenfoque, nunca un halo.

### Shadow Vocabulary
- **Flotante** (`box-shadow: 0 10px 30px -8px rgba(2, 6, 14, 0.7), 0 2px 6px rgba(2, 6, 14, 0.5)`; claro `0 12px 32px -10px rgba(23, 34, 74, 0.28), 0 2px 6px rgba(23, 34, 74, 0.10)`): el panel de géneros.
- **Hoja del móvil** (`box-shadow: 0 -10px 36px -14px rgba(2, 6, 14, 0.65)`): la hoja que sube; la sombra cae hacia arriba porque la luz "viene" de la página de detrás.
- **Panel lateral** (`box-shadow: -24px 0 48px -28px rgba(2, 6, 14, 0.6)` más un borde de 1 px en Línea): el panel de escritorio.

### Named Rules
**The Tone Step Rule.** Para separar, primero aire; si no basta, un paso de tono. Un filete de 1 px solo donde el contenido pasa por debajo (la tira pegada) o en el borde de la página (el pie).

## Shapes

Papel de entrada: esquinas casi rectas y muescas de troquel.

- **Piezas de contenido** (`{rounded.pieza}`): entradas, carteles, avisos, paneles y filas del Horario al pasar por encima.
- **Mandos** (`{rounded.mando}`): todo lo de la fila de controles (vista, cines, género, búsqueda) y los botones con texto. Antes eran pastillas redondas del todo, lo más genérico de la página; ahora son del mismo papel que las entradas.
- **Redondo** (`{rounded.control}`): solo lo que es un punto o una ficha: los días de la tira, los botones de icono, la pastilla "en N min" del Horario, los puntos de cine.
- **Hoja** (`{rounded.hoja}` arriba en el móvil; recta en el panel de escritorio).
- **El troquel:** dos muescas semicirculares de 4,5 px de radio en el centro de los lados cortos, hechas con una máscara de `radial-gradient` sobre un `::before` (no sobre el elemento, para que la máscara no recorte el anillo de foco). Lo llevan las entradas y el cambio Películas/Horario, que además tiene una línea de picado (2 px punteada, Línea fuerte) entre sus dos mitades.
- **El cartel** va siempre en 2:3, recortado con `object-fit: cover`; sin imagen, un bloque de tono estable derivado del título.

## Components

### La entrada (sesión)
La pieza firma: una entrada de papel. Pulsarla es comprar.
- **Forma:** papel con troquel, `{rounded.pieza}`, mínimo 60 px de alto (la hora con una línea de detalle), `6px 11px 7px` de relleno; ancho de rejilla (todas iguales en su cine) y todas las de una fila con el mismo alto.
- **Contenido:** la hora en Title; debajo, en Detail, solo lo que la distingue de sus hermanas (VOSE/3D en 700, sala en apagado). El detalle parte en líneas por los espacios; nunca se corta ni se sale del papel. Lo que comparten todas las entradas que quedan de su cine ("Sala Premium", "4K Laser Atmos"), y todo lo de un cine con una sola sesión, va una vez junto al nombre del cine. Sin nada que decir, la hora sola, centrada; pero si alguna hermana del mismo cine lleva detalle, todas reservan esa línea y las horas quedan a la misma altura.
- **Color:** papel = color del cine al 17 % sobre Superficie (11 % en claro); 28 % / 19 % al pasar por encima.
- **Pronto** (empieza en ≤ 60 min, hoy): papel Ámbar Bombilla, tinta azul noche, "en 20 min" en 700 en vez de la sala.
- **Ya empezada** (hoy): no es una entrada. Va antes de las entradas, en la línea discreta "17:15 18:00 · ya empezadas" (Label 650 en Tenue, cifras tabulares); cada hora sigue siendo un enlace con área de toque de 44 px ampliada por fuera con márgenes negativos.
- **Sin enlace de compra:** botón que abre la ficha; dentro de la ficha, solo información.
- **Accesibilidad:** el `aria-label` dice la frase entera ("La bola negra, 19:00. Cinesur Bahía. Sala Premium. en 20 min. Comprar entrada, se abre en otra pestaña"), con todo lo común incluido aunque visualmente se haya sacado.
- **Pulsación:** `scale(0.97)` en 40 ms al apretar, vuelta en 160 ms `cubic-bezier(.23, 1, .32, 1)`.

### Película (entrada de la cartelera)
- Cartel (botón fuera del tabulador, `aria-hidden`: repite el del título), título en Headline como botón "Ver ficha" (arriba, junto al borde del cartel), y una línea de datos en Label apagada: duración, edad (en tinta, siempre "+N" o "TP": `edadDe` en `lib/cartelera.js` normaliza lo que dé cada cine), ★ nota media con coma decimal, género y "Estreno" en Rojo Texto (estos dos, juntos, sin partir). Duración y edad salen de la película juntada de TODOS los cines del día, no solo de los filtrados.
- Debajo, un grupo por cine: punto de color, nombre (650), lugar (apagado), lo común (Detail), aviso de datos guardados ("datos del mar 13", en su propia línea en el móvil) y, si toca, la línea de ya empezadas y la rejilla de entradas. Un solo separador "·", con 6 px a cada lado, que nunca empieza una línea.
- Las que ya no tienen nada por delante hoy se guardan tras "Ver también las N que ya han empezado" y salen al 60 %.

### Fila del Horario
- Hora una vez por minuto, en Title, a la izquierda y pegada al bajar; en ámbar (texto) con su pastilla "en N min" si es la próxima hora; en Tenue si ya pasó.
- A la derecha, una fila por PELÍCULA: título en Title-sm (entero, en dos líneas equilibradas si hace falta; la columna nunca es más ancha que la pantalla) y sus cines debajo, cada uno con su punto, su nombre corto (Cinesur, Bahía Sur, Área Sur, Arte Siete) y lo que distingue la sesión. Cada cine es su propio enlace: 22 px a la vista, caja de 44 px.
- Con un solo cine, toda la fila es el enlace (un `::after` cubre la fila; al apretar se hunde la fila a 0,985, no el enlace) y al pasar por encima la fila toma Superficie.
- **Ahora:** "Ahora 18:40" en Label 700 ámbar, una raya ámbar de 2 px (al menos 24 px) y, al final de la misma línea, "Ver las 35 empezadas" (enlace subrayado en apagado; baja a la línea siguiente si no cabe). Las empezadas se despliegan por encima y la página compensa el scroll para que el botón no se mueva bajo el dedo.

### Hoja (ficha, Próximas, atajos)
- Un envoltorio, una gramática. Móvil: hoja desde abajo con tirador (40 × 4 px, Línea fuerte) y equis de 44 px sin disco propio; escritorio: panel lateral derecho, contenido a 33 px de los dos lados (la barra de desplazamiento, fina, se descuenta del margen derecho). En cuanto el contenido se desplaza, una franja del color de la hoja lo funde bajo la equis. Diálogo modal de verdad (aria-modal, foco atrapado, Escape, foco de vuelta al título).
- Lo que va relleno dentro (botones, avisos, teclas) usa un paso de tinta sobre la hoja (tinta al 7 % / 12 %), porque en claro la hoja ya es blanca.
- **Ficha:** cartel (clamp 124–172 px; `clamp(140px, 30%, 200px)` en escritorio; en el móvil apaisado, lo que quepa en el 55 % del alto), título (con un hueco para la equis solo en su primera línea), datos, nota media en Big Shoulders 2,5rem con "/10" pegado a su cifra y su fuente debajo ("media de 3 notas", "nota de TMDB"), sinopsis, "Sesiones · Hoy, viernes 16 de octubre" con los mismos grupos por cine que la cartelera, y las valoraciones en cifras grandes separadas por aire (sin rejilla de filetes ni medidores): fuente en apagado, cifra en tinta, escala en apagado.
- **Próximas:** por mes; cada película se despliega en sus días y, dentro de cada día, una línea por cine con sus entradas al lado (el día se escribe una vez).

### Controles
- **Tira de días:** chips de 54 × 54 px (62 px de ancho desde 720 px), redondos; nombre del día (0,75rem 600) sobre el número (Big Shoulders 1,625rem). Hoy y Mañana se nombran; "Hoy" en Rojo Texto; el elegido, relleno Rojo Butaca. `role="tablist"` con tabulador rotatorio.
- **Películas | Horario:** la entrada de dos partes (troquel + picado), opciones de 44 px; la elegida con un relleno de tinta invertida a 3 px del borde del papel.
- **Interruptores de cine:** papel Superficie con su punto. Sin ninguno encendido se ven todos. Encendido: papel del cine al 22 % con contorno de 1,5 px en su color y el punto crece a 18 px con una marca; los apagados pasan a apagado con el punto en contorno. "Todos" aparece como enlace subrayado (en el móvil, en su propia línea).
- **Género:** pastilla con icono y chevrón; abre un panel flotante (radio group con la cuenta de películas por género, alto que acaba a media opción si hay que desplazarse) que sale de la pastilla y nunca se sale de los márgenes de la página. En el móvil ocupa lo que dejan la vista y la lupa: si ahí no cabe "Género" entero (320 px, texto grande), va con el icono y el chevrón (y, en el último extremo, solo el icono); el género elegido se sigue viendo por su contorno.
- **Búsqueda:** icono en el móvil que despliega el campo a toda la fila (la vista y el género se apartan; la equis borra y luego cierra, Escape igual); campo fijo desde 720 px. Foco: contorno interior de 1,5 px en tinta.
- **Botones de texto:** Superficie o Rojo Butaca, 44 px, `{rounded.mando}`. **Botones de icono:** 44 px, redondos, fondo solo al pasar por encima.
- **Foco:** anillo de 2 px en Rojo Texto (claro: Rojo Butaca) a 2 px de distancia, en todo lo enfocable.

### Movimiento
Una gramática, en `lib/muelle.js` (muelles exactos de Apple: amortiguamiento ζ y respuesta s), `lib/gestos.js` y `lib/transicionCartel.js`. Solo `transform` y `opacity`.
- **Muelles de la hoja:** entrada ζ 1 / 0,30 s; vuelta ζ 1 / 0,30 s; vuelta tras lanzamiento ζ 0,8 / 0,32 s (el único rebote, porque hubo inercia); salida sin gesto ζ 1 / 0,26 s hacia 24 px más allá del borde, cortada al cruzarlo. Se resuelven en forma cerrada, se muestrean a 60 fps y se lanzan con Web Animations desde el fotograma en curso (sin un primer fotograma quieto). Se pueden agarrar en cualquier instante desde su valor en pantalla.
- **Salida con gesto:** tramo de duración `T = clamp(D / max(v, 1), 160, 280) ms` con `cubic-bezier(.2, min(1, .2·v·T/D), .4, 1)`: arranca exactamente a la velocidad del dedo. El velo deja de recoger toques en cuanto empieza a irse.
- **Decidir al soltar:** holgura de 4 px; cierra si `posición + proyección(v) > min(50 % del alto, 30 % de la pantalla)` (proyección de inercia con deceleración 0,998); soltar subiendo (v < −0,05 px/ms) nunca cierra. Velocidad con ventana de 90 ms y 0 si el dedo lleva 50 ms sin moverse. Hacia arriba, goma (`c = 0,55`, límite 12 % de la pantalla).
- **Cartel → ficha (firma):** View Transition del cartel con la curva del muelle crítico pasada a `linear()`: 360 ms al abrir (ζ 1 / 0,26 s), 300 ms al cerrar (ζ 1 / 0,22 s); el 90 % del camino en ~160 / ~135 ms y una llegada a menos de 1 px por fotograma, sin frenazo. Vuela una sola foto, la grande de la ficha (sin fundido cruzado con la pequeña de la lista, que ampliada se veía borrosa y doble). Un toque la salta. Solo si los dos carteles se ven; con la ficha desplazada, la hoja cierra con su muelle.
- **Cambio de día con el dedo:** 1:1 desde el punto en que se decide (10 px, sesgo 1,3 a favor del scroll), goma en los extremos (10 % del ancho). Cambia por distancia (> 22 % del ancho) o velocidad (> 0,45 px/ms y > 36 px), nunca si el último movimiento va de vuelta. El día viejo sigue 180 ms `--ease-out` hacia donde iba el dedo (al menos 40 px más, `|v|·120` si iba rápido) mientras se pinta el nuevo, que entra 32 px desde el otro lado, de opacidad 0,3 a 1, en 180 ms `--ease-out` (~230 ms en total desde que se suelta). Si se queda corto, vuelve en 200 ms `--ease-out` sin rebote. Un toque durante cualquiera de esas animaciones las salta al final y el dedo vuelve a mandar. Un segundo dedo no cuenta. Al cambiar de día a media lista, el día nuevo empieza bajo la tira.
- **Pequeño:** pulsación `scale(.97)` (iconos .94, días .95, filas .985) en 40 ms y vuelta en 160 ms; panel de géneros 160 ms de opacidad y escala desde .96 (sale en 110 ms) desde la pastilla; punto de cine `scale(.667 → 1)` en 150 ms; despliegue de Próximas, fundido de 160 ms.
- **Sin animación:** lo que se hace con el teclado (← → T R V / ? Esc), el reloj por minutos y el cambio de día con la tira o las flechas (solo vuelve arriba, al instante).
- **Movimiento reducido:** sin vuelo, sin desplazamientos, sin escalas ni giros (las transiciones de CSS solo pueden animar color, fondo, borde, sombra y opacidad; el indicador de actualizar late en vez de girar). Los gestos siguen al dedo 1:1; al soltar, fundidos: la hoja entra en 180 ms, sale en 140 ms y vuelve a su sitio con un fundido de 150 ms; el día nuevo se enciende en su sitio en 120 ms.

## Do's and Don'ts

### Do:
- **Do** poner la hora en Big Shoulders 700 a 1,75rem con cifras en celdas de 0,45em en cualquier pieza nueva que muestre una sesión.
- **Do** hacer de cada sesión una entrada de papel con el tinte de su cine (17 % / 11 %) y su troquel, en la rejilla `minmax(5.25rem, 1fr)`.
- **Do** escribir una vez lo que comparten todas las sesiones de un cine, junto al nombre del cine, y dejar en cada entrada solo lo que la distingue.
- **Do** apagar y encoger lo que ya ha empezado (Tenue, una línea), sin quitarle el enlace ni la frase completa al lector de pantalla.
- **Do** separar con aire y pasos de tono (fondo → superficie → flotante) antes que con filetes.
- **Do** usar `{rounded.mando}` para cualquier mando nuevo de la fila de controles y `{rounded.control}` solo para puntos, fichas e iconos.
- **Do** lanzar el movimiento desde el valor en pantalla y con la velocidad del dedo (lib/muelle.js), y dejar que se pueda agarrar a mitad.
- **Do** medir el contraste al tocar un tono y anotarlo junto al token en `tokens.css` (AA: 4,5:1 para todo el texto de 13–14 px).
- **Do** mantener todos los objetivos táctiles en 44 px, ampliando el área por fuera (márgenes negativos o `::after`) cuando la pieza visible es más pequeña.

### Don't:
- **Don't** usar el rojo butaca para nada que no sea lo elegido o la acción principal, ni poner dos rojos grandes a la vez.
- **Don't** usar el ámbar como acento, aviso o decoración: es solo "empieza en menos de una hora".
- **Don't** usar negro puro, gris neutro ni un fondo crema: el fondo es azul noche tintado o blanco cal frío.
- **Don't** repetir el mismo dato en cada pieza de un grupo (la sala en cada entrada, el mismo título tres veces en el mismo minuto).
- **Don't** volver a las pastillas redondas del todo para los mandos ni añadir halos, cristal o degradados de relleno.
- **Don't** poner etiquetas en mayúsculas espaciadas encima de los títulos, emoji como iconos ni números de sección.
- **Don't** animar el cambio de día con entradas en cascada ni lo que se hace con el teclado; nada de rebote sin un gesto con inercia detrás.
- **Don't** animar `width`, `height`, `top` o `left`: solo `transform` y `opacity` (el punto de cine escala dentro de una caja fija de 18 px).
- **Don't** dejar que una hoja o un panel atrape toques cuando ya se ve fuera, ni que el cartel vuele desde algo que no se ve.
