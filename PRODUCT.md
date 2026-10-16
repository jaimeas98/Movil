# Cartelera Cine Jaime — producto

## Qué es
Una cartelera personal que junta en una sola web los horarios de los cuatro
cines de la Bahía de Cádiz: **mk2 Cinesur Bahía de Cádiz** (Cádiz), **Yelmo
Premium Bahía Sur** (San Fernando), **Yelmo Área Sur** (Jerez) y **Arte Siete
El Puerto** (El Puerto de Santa María). Los datos se leen en vivo de las webs
de los cines (Yelmo, a través de un móvil en casa) y la web solo los enseña.

## Quién la usa y cuándo
Jaime, a menudo con su pareja. Sobre todo **desde el móvil**, por la tarde o
por la noche, en el sofá o ya en la calle, para decidir **qué ver, dónde y a
qué hora**. A veces desde el ordenador, con más calma, para planear el finde.
Uso personal, sin publicidad ni cuentas.

## Las preguntas que tiene que responder en segundos
1. ¿Qué echan hoy (o tal día) en la bahía?
2. ¿A qué hora puedo ver esta película, y en qué cine me pilla mejor?
3. ¿Qué empieza pronto, ahora mismo?
4. ¿De qué va, cuánto dura, para qué edad es, qué nota tiene, hay versión
   original (VOSE)?
5. ¿Dónde compro la entrada? (enlace al cine)
6. ¿Qué estrenos o ciclos vienen más adelante? (Próximas)

## Verdades del producto (no se inventan ni se tocan)
- Los datos: películas, sesiones (hora, formato, idioma, sala, enlace de
  compra), duración, edad, sinopsis, valoraciones (IMDb, Rotten Tomatoes,
  Metacritic, TMDB y la media) y géneros. Todo viene de `/api/*`, que **no se
  toca** (`lib/cinemas`, `lib/ratings`, `app/api`, `data/`).
- Nunca se presentan datos guardados como si fueran de ahora: si un cine sirve
  datos antiguos, se dice de cuándo son ("datos del lun 13, 20:03").
- Nunca se inventan sesiones ni películas: un cine sin datos sale como tal.
- Funciona sin conexión con lo último que se cargó (caché y respaldo en el
  dispositivo).

## Lo que ya funciona y tiene que seguir funcionando
- Tira de días (14 días, solo los que tienen cartelera) y **deslizar con el
  dedo** para cambiar de día, con el gesto fluido que ya hay (`lib/gestos.js`).
- Buscar por título, filtrar por género y por cine.
- Ficha de película con notas desglosadas, sinopsis, tráiler y sesiones con
  enlace de compra.
- Próximas: películas programadas más allá de la tira.
- Tema claro y oscuro (oscuro por defecto), sin parpadeo al cargar.
- Atajos de teclado en el ordenador (← → / T R Esc ?).
- Carga rápida: la cartelera se carga una vez y cambiar de día es instantáneo.

## Marca
No hay logotipo ni colores fijados. Cada cine tiene su color para
reconocerlo de un vistazo; los tonos exactos se pueden ajustar.
