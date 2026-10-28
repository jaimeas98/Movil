# Traspaso — estado del proyecto y lo pendiente

Escrito el 19-10-2026 al cerrar una larga sesión de Claude Code en la nube,
para que cualquier otra sesión (otra cuenta, en local) retome sin perder nada.
Claude no guarda memoria entre sesiones: **lo que no está en este repositorio
no existe** para la siguiente. Léelo entero junto con `CLAUDE.md`.

## 1. Qué hay montado (todo funcionando hoy)

**Web pública** — https://movil-blush.vercel.app (Vercel, plan Hobby, región
cdg1). Next.js 14 App Router, React 18, CSS propio. Despliega sola en cada push
a la rama de producción **`claude/puerto-santa-maria-restaurants-NxChu`**
(es la rama por defecto del repo; no hay `main` en uso).
- Cartelera de 4 cines: mk2 Cinesur Bahía de Cádiz, Yelmo Bahía Sur (San
  Fernando), Yelmo Área Sur (Jerez), Arte Siete (El Puerto).
- Diseño v2 "Marquesina de la Bahía" (`DESIGN.md`, `PRODUCT.md`,
  `docs/rediseno-v2/BRIEF.md`): una entrada por película juntando cines,
  sesiones como "entradas" con la hora en grande, vista Horario, ficha como
  hoja deslizable (móvil) o panel lateral (escritorio) con el cartel que
  "vuela" (View Transitions), Próximas, temas claro/oscuro, atajos de teclado.
- El diseño anterior (v1) está en la rama **`diseno-v1`** (commit 7081fca).
- Antifallos: si un cine falla se enseña la última copia (memoria del servidor,
  copia del móvil en `data/respaldo.js` o respaldo del dispositivo) avisando
  "datos del…", hasta 7 días; una lectura corta nunca quita días.

**Móvil recolector** (Xiaomi Mi Note 10 Lite, Android 12, en casa de Jaime,
enchufado y bloqueado; Termux + Termux:API + Termux:Boot de F-Droid).
Yelmo bloquea servidores con Cloudflare, así que lo recoge este móvil con
Chromium (identidad = el propio móvil), dos turnos al día (07:00 y 18:00;
reintento cada hora si falla, no a menos de 2 h del siguiente turno), y
copia mk2 y Arte Siete. Publica `data/yelmo.js` y `data/respaldo.js` en la
rama de producción (commits "Cartelera de Yelmo — … (móvil)": **haz siempre
`git pull --rebase` antes de push**, el móvil empuja a la misma rama).
- Cada 15 min deja su informe en la rama huérfana **`estado-movil`**
  (estado.json, registro.txt, historial.jsonl, recogidas.jsonl,
  bateria-historial.json, ordenes-resultado.json, más una copia del workflow
  del vigilante y un vercel.json que evita despliegues).
- Bucle propio con wake lock (`scripts/movil/bucle.sh`); cada minuto mira
  órdenes del panel en la rama **`ordenes-movil`** (lista cerrada en
  `scripts/movil/acciones.sh`, con límites de repetición en servidor y móvil).
- **Yelmo cambió de web el 23-10-2026**: www.yelmocines.es redirige a
  **https://cineyelmo.com/es** (la web de Cinépolis, Next.js) y los datos
  salen de un API GraphQL en **api-g.cinepolis.com**, también tras Cloudflare
  y que además pide unas cabeceras propias de la web (sin ellas, 401). El
  recolector (`scripts/movil/recolector-navegador.mjs`) abre la portada, copia
  las cabeceras de las peticiones de la propia web (al registro solo van sus
  nombres), toma la cartelera (`Movies`) y pide los horarios (`Billboard`)
  película a película con pausas de persona, y lo convierte al formato
  antiguo que lee `lib/cinemas/yelmo.js` (la web no cambió). Cines en el API:
  `premium-bahia-sur-cadiz` (Vista 1340) y `area-sur-cadiz` (Vista 803). Los
  enlaces de compra siguen siendo `compra.yelmocines.es/?cinemaVistaId=…&showtimeVistaId=<sessionId>`;
  si esa taquilla muere, se cambian desde el panel (Enlaces de compra; ya
  admite cineyelmo.com). Simulación del sitio nuevo:
  `scripts/movil/simulacion-yelmo.mjs` (la usan probar.sh y el ensayo);
  respuestas reales en `scripts/datos-prueba/yelmo-api-real.json`;
  exploraciones en la rama estado-movil (`exploracion-yelmo{,2,3}.json`).
- Todo lo que se sube a `scripts/movil/` lo ejecuta el móvil en su vuelta
  siguiente. Antes de subir: `bash scripts/movil/probar.sh` (y
  `ensayo-recuperacion.sh` si tocas el instalador).
- Si se rompe: `docs/movil/RECUPERACION.md`.

**Vigilante** — `.github/workflows/vigilante-movil.yml` +
`scripts/vigilante/revisar.mjs`. Se dispara con cada informe del móvil (push a
estado-movil) y por calendario. Abre issues `alerta-movil` asignados a
jaimeas98 (la app de GitHub notifica): sin señal >45 min, batería baja o
bajando deprisa (previsión a 2 h con el ritmo medido), crítico. Se cierran
solos al arreglarse.

**Panel de control privado** — `/panel` (entrada en `/panel/entrar`; sin
sesión todo da 404). Variables en Vercel (solo Production): `PANEL_CLAVE`
(Jaime eligió 13 caracteres; mínimo en código 12) y `PANEL_GITHUB_TOKEN`
(fine-grained, solo este repo: Contents RW, Issues R, Actions RW). Cabina
(desde el 19-10: veredicto, línea de las últimas 24 h con señal, recogidas y
batería, tablero de cines, fiabilidad de 7 días, caducidad del token, accesos
y "Copiar el estado"; ver `docs/panel/PLAN.md` § La cabina), Móvil (batería
24 h con previsión, vueltas, recogidas, registro), Cines, Acciones (órdenes al
móvil), Enlaces de compra (plantillas por cine en `data/enlaces.js`; Jaime ya
arregló Arte Siete desde aquí), Avisos.
Plan, contrato y seguridad: `docs/panel/PLAN.md`, `docs/panel/API.md`. Pasó
una auditoría de seguridad independiente (hallazgos corregidos con pruebas).

**Panel unificado con el visor de LoL** (28-10-2026, a petición de Jaime): el
mismo `/panel` enseña también el visor de LoL Esports (`jaimeas98/Trabajo-IA`,
su propio Vercel): pestaña **LoL** (directo/próximos/terminados con enlace a
la ficha, estado de lolesports.com y del respaldo, tareas de Actions del visor
con botón para lanzarlas, últimos cambios) y un bloque en la cabina. Ver
`docs/panel/PLAN.md` § Un panel para la cartelera y el visor de LoL.

**Skills de diseño** en `.claude/skills/` (Impeccable, Emil Kowalski incl.
apple-design, Taste): solo guías, sin sus scripts (ver su LEEME). Úsalas para
cualquier trabajo visual.

## 2. Cómo se ha trabajado (y conviene seguir)
- Jaime habla en castellano, por voz (transcripciones imperfectas: interpreta
  la intención). Quiere el **producto terminado**, no preguntas constantes;
  pregunta solo lo que de verdad es decisión suya. Le gusta que se le
  expliquen las cosas claras y sin tecnicismos innecesarios.
- Para trabajos grandes: plan escrito → agentes que construyen → revisores
  independientes (diseño, movimiento, seguridad, auditoría al píxel) → ronda
  de arreglos → publicar. Verificar con capturas (Playwright) a 320–1920 px y
  ambos temas.
- Nunca publicar a medias (cada push despliega a producción). Nunca romper el
  latido del móvil. El repo es público: nada de secretos, IPs ni datos
  personales.

## 3. Pendiente (por prioridad)
-1. **Conectar el visor de LoL al panel** (lo hace Jaime, una vez): en Vercel,
   proyecto de la cartelera, `LOL_URL` = dirección de producción del visor; y
   añadir `jaimeas98/Trabajo-IA` al `PANEL_GITHUB_TOKEN` (o crear
   `LOL_GITHUB_TOKEN` solo para ese repo: Contents R, Actions RW). Redesplegar
   y mirar la pestaña LoL. Si el visor aún no está publicado en Vercel, va
   primero (README del visor).
0. **Recolector nuevo de Yelmo: COMPROBADO en el móvil el 23-10-2026** (recogió
   y publicó a las 16:01: Bahía Sur 27 días/26 películas/204 sesiones, Área Sur
   23/31/292). Cabeceras que copia de la web: accept, content-type, country-id,
   language, x-apikey. Corregido después: "SUB ESP" ahora es VOSE; si el API
   corta ("Failed to fetch" tras ~57 consultas seguidas, pasó con 22 de Área
   Sur: óperas, ballets, conciertos), se sigue más despacio y se reintentan al
   final. Pendiente: confirmar en el turno siguiente que ya no se salta
   ninguna; averiguar qué es el formato "CA" de Yelmo (se muestra tal cual).
1. **Diseños intercambiables desde el panel** — pedido por Jaime el 18-10.
   Plan completo en `docs/panel/DISENOS.md` (v1 recuperada de `diseno-v1`,
   cada diseño en su ruta, `/` reescrito al activo, previsualizar solo para
   Jaime, publicar desde el panel). Sin empezar.
2. ~~Revisión de ad4660a~~ — hecha el 19-10 (sesión local): dos arreglos, el
   vuelo del cartel en escritorio (iba a 100 px por fotograma y se veía
   cortado; ahora curva propia de 480/430 ms) y el hueco del velo, que no se
   movía si la lista cambiaba de altura con la ficha abierta. Queda por
   probar con el ratón en un escritorio real que el vuelo ya se ve fluido.
3. **Aviso de prueba del vigilante**: el issue #2 sigue abierto porque existe
   `data/prueba-aviso`. Preguntar a Jaime si le llegó la notificación de
   GitHub (tenía las notificaciones desactivadas y las activó); después borrar
   ese fichero (la siguiente revisión cierra el issue sola).
4. **"Sin señal" más puntual**: si el móvil muere, solo el calendario de
   GitHub lo detecta y se retrasa horas. Opción: endpoint en Vercel protegido
   por secreto llamado por un cron externo gratuito (p. ej. cron-job.org) cada
   15 min, que reutilice `revisar.mjs`. Necesita que Jaime cree la cuenta.
5. Restos de las auditorías al píxel: en Próximas, alguna tilde de título de
   ópera cerca del paréntesis de la línea de arriba; las horas que empiezan
   por "1" en Horario quedan 4 px a la derecha; panel de atajos a 320 px.
6. Ideas del panel para una v2: editar o esconder una sesión/película,
   cambiar los turnos de recogida desde el panel, avisos también por correo,
   estadísticas de fallos por cine.
7. Probar los gestos (hoja, deslizar días) con el dedo en móviles reales; se
   probaron con toques simulados.
8. No se sabe qué significa la etiqueta "CA" de Yelmo (se muestra tal cual).
9. ~~Caducidad del `PANEL_GITHUB_TOKEN`~~ — el panel la enseña desde el
   19-10 (Cabina → GitHub) y avisa 14 días antes. Mirar qué fecha dice la
   primera vez que Jaime entre con el token.
10. **`probar.sh` sin Linux**: el portátil de trabajo de Jaime es Windows sin
    WSL ni Docker, y no quiere instalar nada. Opción: una tarea de GitHub
    Actions (ubuntu, que trae flock) que ejecute `scripts/movil/probar.sh` a
    mano o en cada push que toque `scripts/movil/`. Hasta entonces, desde ese
    portátil no se toca `scripts/movil/`.
11. **El bucle del móvil va cada ~15 min 43 s**, no 15: `bucle.sh` solo mira
    si toca vuelta tras cada `sleep 60` + `ordenes.sh`, así que la vuelta
    arranca en la primera comprobación después de los 900 s (unos 40 s
    tarde de media). No es un fallo (el panel ya lo tiene en cuenta y el
    vigilante tiene 45 min de margen); si se quisiera exacto, es cosa de
    `bucle.sh` y necesita probar.sh.

## 4. Trabajar en local (otra cuenta / otro ordenador)
- Actualizar el clon: `git fetch origin` y
  `git checkout claude/puerto-santa-maria-restaurants-NxChu` (si existe en
  local, `git pull --rebase`). **Esa es la rama de producción**: lo que se
  empuja ahí se publica. Si el clon local es de junio de 2026 tendrá ramas o
  cambios viejos: no los mezcles; si hay algo local sin subir de entonces,
  revísalo antes de traerlo.
- `npm install`. Servidor local con datos de ejemplo:
  `CARTELERA_SAMPLE=1 npx next dev`. Pruebas:
  `for t in scripts/test-*.mjs; do grep -q playwright $t && continue; node --no-warnings $t; done`,
  `npx next build`. Las de navegador necesitan `playwright` instalado aparte
  (no está en package.json a propósito).
- `scripts/movil/probar.sh` necesita bash, git y `flock` (Linux; en macOS
  `brew install flock` o usar Docker/WSL). En el portátil Windows de Jaime no
  hay ninguno y no quiere instalar nada (ver §3, punto 10).
- **En ese portátil, nada fuera de la carpeta**: `next build`/`next dev` crean
  `%APPDATA%\nextjs-nodejs` (también con `NEXT_TELEMETRY_DISABLED=1`):
  bórralo al acabar. Para ver el panel en local: `PANEL_CLAVE` inventada en el
  entorno del servidor de desarrollo (nunca en un fichero que se suba) y
  `POST /api/panel/entrar` desde la propia página.
- **No subir nada sin el visto bueno explícito de Jaime**, y nada mientras
  tenga una VPN puesta.
- **Una sola sesión trabajando a la vez** sobre la rama de producción (dos
  Claudes empujando a la vez se pisan). Al terminar: commit, `git pull
  --rebase`, `git push`, y actualizar este fichero (§3) con lo que quede.
- Firma de commits que se ha usado: autor del usuario; mensajes en castellano
  explicando el porqué.
