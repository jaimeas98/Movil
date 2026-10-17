# Si el móvil recolector se rompe

El móvil de casa (hoy un Xiaomi Mi Note 10 Lite con Termux) es el que recoge la
cartelera de Yelmo, porque Cloudflare bloquea a los servidores y solo deja
pasar a un navegador desde una conexión normal. También hace la copia de mk2 y
Arte Siete, publica su informe cada 15 minutos y obedece al panel.

**Nada de eso vive solo en el móvil.** El código, las ramas de informes y de
órdenes y la cartelera están en GitHub. Si el móvil muere y no se puede sacar
nada de él, se instala otro con un comando y ya está. Esta guía es para Jaime
(lo que hay que hacer con las manos) y para la próxima sesión de Claude (lo que
se comprueba después, a distancia).

---

## En corto

1. Un Android cualquiera (8 o más), enchufado y con la WiFi de casa.
2. De **F-Droid**: **Termux**, **Termux:API** y **Termux:Boot**.
3. En Termux, pegar **un comando** (está en el panel: Móvil → *¿Cambiar de
   móvil?*, con botón de copiar).
4. Escribir el **código** que sale en `github.com/login/device`.
5. Los **ajustes de batería** que dice Termux al acabar (según la marca), y
   abrir Termux:Boot una vez.
6. Decírselo a Claude.

El comando:

```
curl -fsSL https://raw.githubusercontent.com/jaimeas98/Movil/claude/puerto-santa-maria-restaurants-NxChu/scripts/movil/instalar.sh | bash
```

---

## Qué hace falta

- **Un móvil Android 8 o más**, de 64 bits (lo son casi todos desde 2017). Uno
  viejo vale: no hace falta tarjeta SIM ni cuenta de Google. Con **2 GB
  libres** (Chromium y sus librerías ocupan casi uno).
- **Su cargador**: va a estar siempre enchufado.
- **La WiFi de casa.** Es la conexión que Yelmo deja pasar; la de un servidor,
  no.
- **Fecha y hora automáticas, zona de España.** Las recogidas van a las 07:00 y
  a las 18:00 *de la hora del móvil*. El instalador avisa si no lo está.
- Tu móvil de siempre (o cualquier sitio con GitHub abierto) para escribir el
  código.

## Paso a paso

### 1. Las tres apps, de F-Droid

1. En el móvil nuevo, abre **https://f-droid.org** en el navegador, descarga
   F-Droid e instálalo (Android pedirá permitir instalar apps desde el
   navegador: sí).
2. En F-Droid busca e instala estas tres, tal cual se llaman:
   - **Termux**
   - **Termux:API**
   - **Termux:Boot**
3. Abre **Termux** una vez y espera a que acabe lo de "Installing bootstrap
   packages" (sale el símbolo `$`).

**Por qué F-Droid y no Play Store:** las tres apps tienen que venir firmadas
por la misma clave para poder hablar entre ellas, y en F-Droid están las tres,
al día, de la misma mano. Si Termux viene de un sitio y Termux:API de otro, la
batería y el planificador de Android no responden (el instalador lo detecta y
lo dice). Si alguna vez se instaló Termux desde Play Store en ese móvil,
desinstálalo antes.

### 2. El comando

Cópialo del panel (Móvil → *¿Cambiar de móvil?* → Copiar) abriendo el panel en
el navegador del móvil nuevo, o desde este documento. En Termux: mantén el dedo
en la pantalla → **Paste** → Intro.

Tarda entre 5 y 15 minutos (descarga Chromium). Lo que hace, por orden:

1. Instala los paquetes (git, Node, Chromium, puppeteer-core…).
2. Crea la clave de este móvil y te pide **el código** (paso 3).
3. Clona el código y la rama de informes que ya existe (no empieza de cero:
   el panel sigue enseñando el historial).
4. Da por vistas las órdenes que se le pidieron al móvil anterior.
5. Programa las vueltas (bucle propio, planificador de Android, Termux:Boot).
6. Da la primera vuelta: recoge Yelmo y publica el primer informe.
7. Dice qué ha comprobado y qué ajustes de Android te tocan.

Si algo se corta (la red, un paso que falla), **vuelve a pegar el mismo
comando**: lo que ya está hecho no se repite.

### 3. El código

Cuando salga un código de 8 letras (tipo `ABCD-1234`):

1. En tu móvil de siempre abre **https://github.com/login/device**.
2. Escribe el código y pulsa **Authorize**.
3. Si Termux pone "Press Enter", pulsa Intro.

Ese permiso es amplio (todos tus repositorios), por eso dura un minuto: el
móvil lo usa para registrar su propia clave, que **solo** sirve para este
repositorio, y para **borrar de GitHub la clave del móvil anterior**. Justo
después lo borra del móvil, también si la instalación se corta a medias.

(Si quieres ser estricto: GitHub → Settings → Applications → Authorized OAuth
Apps → "GitHub CLI" → Revoke. Ojo, eso también cierra `gh` en cualquier otro
sitio donde lo uses.)

### 4. Ajustes de Android

Sin ellos, Android cierra Termux en cuanto bloqueas la pantalla y el móvil deja
de dar señales al rato. Ningún programa puede hacerlos por ti. Termux te dice
al final los de tu marca; aquí están todos.

**En cualquier marca:**
- Abre la app **Termux:Boot** una vez (abrir y cerrar). Sin eso, al reiniciar
  el móvil no arranca nada.
- Deja la notificación de Termux ("wake lock held"): es lo que lo mantiene
  despierto. No uses "Forzar detención" en Termux.

**Xiaomi, Redmi, POCO (MIUI / HyperOS)** — los más agresivos:
- Ajustes → Aplicaciones → Administrar aplicaciones → **Termux**,
  **Termux:API** y **Termux:Boot**, en cada una:
  - **Inicio automático**: activado.
  - **Ahorro de batería**: "Sin restricciones".
- App **Seguridad** → Batería → ⚙ (arriba) → "Limpiar memoria al bloquear el
  dispositivo": **desactivado** (según la versión puede estar en Ajustes →
  Batería → ⚙).
- Recientes → mantén pulsada la tarjeta de Termux → **candado**.

**Samsung (One UI):**
- Ajustes → Aplicaciones → **Termux** → Batería → **"Sin restricciones"**. Lo
  mismo en Termux:API y Termux:Boot.
- Ajustes → Batería (en algunos, Mantenimiento del dispositivo → Batería) →
  **Límites de uso en segundo plano**:
  - "Poner en suspensión apps no usadas": **desactivado**.
  - Si Termux está en "Apps en suspensión" o "en suspensión profunda",
    sácalo; si hay lista de "Apps que nunca se suspenden", mételo.
- Recientes → toca el icono de Termux (encima de su tarjeta) → **"Mantener
  abierta"**.

**Google Pixel y Android "puro"** (Motorola, Nokia, Android One…):
- Ajustes → Aplicaciones → Ver todas → **Termux** → **Uso de batería de la
  app** → **"Sin restricciones"**. Lo mismo en Termux:API y Termux:Boot.
- En Pixel no hay candado en Recientes ni hace falta.

**Otras marcas** (Oppo, Realme, OnePlus, Huawei, Honor, Vivo…): lo mismo con
otros nombres — "Inicio automático", "Sin restricciones" o "No optimizar" la
batería, y bloquear en Recientes. **https://dontkillmyapp.com** dice dónde lo
esconde cada una.

**Además, según la versión de Android** (recomendable, no obligatorio):
- **Android 12 o 13**: en Termux, `bash ~/Movil/scripts/movil/ajustes-android.sh`.
  Quita el límite de procesos de Android 12 (que puede matar a Chromium a
  medias) y saca Termux del ahorro de energía. Usa la depuración inalámbrica
  del propio móvil, sin PC; el script explica cada paso.
- **Android 14 o más**: Opciones de desarrollador → "Desactivar restricciones
  de procesos secundarios" (en inglés, *Disable child process restrictions*).
  Para ver las Opciones de desarrollador: Ajustes → Información del teléfono →
  tocar 7 veces "Número de compilación".

### 5. Ya está

Deja el móvil **enchufado y bloqueado** y dile a Claude "ya está el móvil
nuevo". Desde aquí todo se hace a distancia.

---

## Lo que hace Claude después (lista para la próxima sesión)

Todo desde el repositorio, sin tocar el móvil:

1. **El primer informe es del móvil nuevo.**
   `git fetch origin estado-movil && git show origin/estado-movil:estado.json`
   → `vuelta` de hace menos de 15 min, `dispositivo.modelo` el del móvil nuevo,
   `codigo` = el último commit de la rama de la web.
2. **El registro.** `git show origin/estado-movil:registro.txt`: la línea
   `identidad: Android … · <modelo> · Chrome …` (con quién se presenta
   Chromium) y `resultado: recogida y publicada`. Si pone Cloudflare 403, ver
   "Si Yelmo bloquea al móvil nuevo" abajo.
3. **Yelmo publicado.** `git log -3 --format='%h %cd %s' origin/claude/puerto-santa-maria-restaurants-NxChu -- data/yelmo.js`
   → un commit "Cartelera de Yelmo — … (móvil)" de hoy. En
   `recogidas.jsonl` (rama estado-movil), la última línea con días y películas
   de los dos Yelmo.
4. **Órdenes.** Pedir a Jaime (o hacerlo con el panel) Acciones →
   **Diagnóstico**: en ~1 min sale el resultado con el modelo nuevo, Chromium,
   puppeteer, bucle vivo. Las órdenes del móvil anterior que quedaron sin hacer
   aparecen como "caducada" con el motivo "cambio de móvil": es lo esperado.
5. **El vigilante.** El aviso "El móvil no responde" que abrió por el móvil
   roto se cierra solo con el primer informe nuevo (Actions → *Vigilante del
   móvil*; issues con la etiqueta `alerta-movil`).
6. **Las 24 h siguientes.** En el panel, Móvil → Vueltas: la tira sin huecos
   también de noche, con la pantalla bloqueada. Si hay huecos de más de 30 min,
   faltan ajustes de batería: pedirle a Jaime los de su marca (arriba) y, si es
   Android 12–13, `ajustes-android.sh`. Y que los turnos de las 07:00 y 18:00
   recojan.
7. **Las claves.** El instalador dice en pantalla qué claves ha quitado. Claude
   no puede ver las deploy keys con el token del panel (hace falta permiso de
   administración); si hay dudas, Jaime mira
   github.com/jaimeas98/Movil/settings/keys: debe haber **una sola**
   "recolector-movil (…)", la de hoy.
8. **El enchufe inteligente**, si se usaba (`enchufe` en el informe): hay que
   rehacer `~/.recolector/enchufe.conf` a mano en el móvil nuevo (lleva
   direcciones de la red de casa, así que nunca va al repositorio).

**Si Yelmo bloquea al móvil nuevo:** el recolector ya se presenta con el
modelo, la versión de Android y la de Chrome del móvil donde corre (lo lee
solo; no hay nada que cambiar). Probar con la acción **probar-yelmo** del
panel, mirar `registro.txt` y, si sigue, `actualizar-paquetes` (un Chromium
viejo es lo más típico). Antes de subir cualquier cambio a `scripts/movil/`:
`bash scripts/movil/probar.sh`.

## Cómo se ve en el panel

- **Resumen**: "Móvil" pasa de *Callado desde…* a *Último informe hace N min*.
- **Móvil → Ahora**: "Dispositivo" dice el modelo y el Android nuevos.
- **Móvil → Recogidas**: una recogida nueva con motivo "turno de las …".
- **Acciones → Diagnóstico**: responde en un minuto.
- **Avisos**: el aviso de "no responde" pasa a cerrados.

---

## Qué vive solo en el móvil, y qué pasa con ello

| Qué | Dónde | Al cambiar de móvil |
|---|---|---|
| Clave SSH del móvil | `~/.ssh/id_recolector` | **Nueva**: la crea el instalador. La del móvil anterior se **borra de GitHub** en el mismo paso. |
| Clave registrada en GitHub (deploy key) | GitHub → Settings → Deploy keys | El instalador registra la nueva y quita todas las "recolector-movil (…)" que no son ella. Las demás claves no las toca. |
| Permiso temporal del código | `~/.config/gh/hosts.yml` | Se borra al acabar ese paso, también si algo falla. |
| `~/.ssh/config`, `known_hosts` | `~/.ssh` | Los rehace el instalador. |
| Paquetes (git, Node, Chromium, gh…) | Termux | Los instala el instalador. |
| puppeteer-core | `~/navegador` | Lo instala el instalador. |
| Código | `~/Movil` | Se clona. Se pone al día en cada vuelta. |
| Rama de informes | `~/estado-movil` | Se **clona la que ya existe** (no se crea): historial y resultados de órdenes siguen. |
| `ciclo.sh`, `bucle.sh`, `ordenes.sh` | `~/.recolector` | Los copia el instalador; `bucle.sh` y `ordenes.sh` los renueva cada vuelta. |
| Tarea del planificador de Android (id 7) | Android | La programa el instalador; también Termux:Boot al encender. |
| Arranque al encender | `~/.termux/boot/recolector.sh` | Lo escribe el instalador (y cada vuelta lo revisa). Hace falta abrir Termux:Boot una vez. |
| Wake lock | Termux | Lo toman cada vuelta y el bucle. |
| Historial de vueltas y recogidas | `~/.recolector/*.jsonl` | Se **recuperan** de su copia en la rama de informes. |
| Historial de batería (24 h) | `~/.recolector/bateria-historial.json` | **Se pierde a propósito**: era otra batería; mezclarlo daría un ritmo de descarga falso y avisos falsos. En un día vuelve a estar lleno. |
| Órdenes del panel ya vistas | `ordenes-hechas`, `ordenes-sha` | Todas las de `ordenes.json` se dan por vistas; las que no tenían resultado se anotan "caducada". No se repite nada. |
| Huella de `data/orden.sh` ejecutada | `~/.recolector/orden-hecha` | La que haya se da por hecha. Una nueva sí se ejecuta. |
| Límites de órdenes del móvil | `ordenes-limites.json` | Empiezan de cero (el servidor tiene los suyos). |
| Última recogida, último intento, huella del intento | `ultima-recogida`, `ultimo-intento`, `intento-codigo` | Se borran: la primera vuelta recoge sí o sí. |
| Registro local | `~/.recolector/ciclo.log` | Se pierde; lo importante (las últimas 200 líneas) ya estaba en `registro.txt`. |
| Candados y pid del bucle | `~/.recolector` | Se crean solos. |
| Enchufe inteligente (opcional) | `~/.recolector/enchufe.conf` | **A mano**, si se usaba (hoy no). Lleva IPs de casa: nunca al repositorio público. |
| Ajustes de Android (batería, inicio automático, candado, procesos) | Android | **A mano**, por Jaime: ningún programa puede. |
| Las tres apps | Android | **A mano**, por Jaime, desde F-Droid. |
| Zona horaria | Android | Automática (España). El instalador avisa si no. |
| Cartelera de Yelmo, copia de mk2 y Arte Siete | `data/` en la rama de la web | No es del móvil: está en GitHub. |

## Si el móvil viejo vuelve a la vida

Su clave ya está borrada de GitHub, así que **no puede escribir nada**: sus
vueltas fallan al subir (y al traerse código nuevo) y no molesta al nuevo. Pero
sigue intentándolo y entrando en Yelmo dos veces al día, así que conviene
retirarlo:

- Lo más sencillo: **desinstalar Termux** (con eso se van su clave, su bucle y
  sus tareas).
- O, si se quiere conservar Termux para otra cosa, en su Termux:
  `termux-job-scheduler --cancel --job-id 7; pkill -f bucle.sh; rm -rf ~/.recolector ~/.termux/boot/recolector.sh ~/.ssh/id_recolector*`

Si algún día se quiere que el viejo vuelva a ser el recolector, basta con
pegar en él el mismo comando: pedirá el código, se registrará y quitará la
clave del otro. **El último móvil en instalarse es el que vale**; nunca hay dos
escribiendo a la vez.

## Si no hay ningún móvil

Mientras no haya recolector:

- **Sigue funcionando**: la web entera. mk2 y Arte Siete se leen en directo
  desde el servidor, como siempre. Yelmo enseña la **última cartelera que
  recogió el móvil**, avisando de su fecha, durante **7 días** (cada día que
  pasa tiene un día menos por delante). El panel sigue entrando y enseña al
  móvil como callado.
- **Deja de funcionar**: las recogidas de Yelmo. Pasados 7 días desde la
  última, Yelmo sale vacío en la web. La copia de seguridad de mk2 y Arte
  Siete deja de renovarse (solo importaría si sus webs fallaran). Las órdenes
  del panel se quedan en cola y caducan a las 6 h.
- **El vigilante** abre un aviso "El móvil no responde" (y uno crítico a las
  3 h); se cierra solo cuando llega el primer informe del móvil nuevo.

No hay que hacer nada en la web ni en Vercel: cuando haya móvil nuevo, todo se
reengancha solo.

---

## Para Claude: cómo está hecho

- El instalador es `scripts/movil/instalar.sh` (pensado para `curl | bash`; las
  preguntas leen de `/dev/tty`). Es idempotente: repetirlo no pide otra vez el
  código si GitHub ya acepta la clave, no duplica claves, no arranca un segundo
  bucle ni vuelve a heredar órdenes.
- La herencia de órdenes es `node scripts/movil/ordenes.mjs heredar` (ver
  `heredar()`); solo se hace si no existe `~/.recolector/ordenes-hechas`.
- La identidad del navegador sale de `getprop` (lo pasan `tarea.sh` y
  `acciones.sh` como `DISPOSITIVO_MODELO` y `DISPOSITIVO_ANDROID`) y de la
  versión del Chromium instalado; ver `identidad()` en
  `recolector-navegador.mjs`.
- **Ensayo completo** de un cambio de móvil, en un Termux falso con un GitHub
  local: `bash scripts/movil/ensayo-recuperacion.sh`. Hay que pasarlo (y
  `probar.sh`) antes de subir cambios al instalador o a lo que instala.
- Lo que solo puede confirmar un móvil de verdad: que F-Droid y las apps se
  instalan en ese modelo, que Chromium de Termux arranca en él, que Cloudflare
  lo deja pasar desde casa con su identidad, y que con sus ajustes de batería
  el bucle aguanta la pantalla bloqueada toda la noche (pasos 1, 2 y 6 de la
  lista de arriba).
