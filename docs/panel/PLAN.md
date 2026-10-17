# Panel de control — plan v1

Encargo de Jaime (17-10-2026): un panel de administración para gestionar la
cartelera y el móvil recolector: ver el estado de todo, ver fallos con su
historial, y lanzar acciones (recoger ya, actualizar, diagnósticos) sin
pedírmelo a mí ni tocar el móvil. Arreglar desde ahí cosas como los enlaces de
compra rotos de Arte Siete. No es parte de la cartelera: nadie que entre a la
web debe ver que existe.

## Decisiones

### Dónde vive
En la misma app de Next.js, en **/panel**, sin ningún enlace desde la
cartelera. Misma infraestructura (Vercel, mismo dominio), cero coste extra, y
puede leer los datos del servidor directamente (el agregador).
- Sin sesión, `/panel` y todo `/api/panel/*` responden **404**, como si no
  existieran. No hay botón de "admin" en ningún sitio.
- La entrada es **/panel/entrar**: una sola caja de clave, sin marca, sin la
  palabra cine, sin nada que explique qué es. Con la clave correcta deja una
  cookie y lleva a /panel.
- Todo con `noindex, nofollow` (cabecera `X-Robots-Tag` y metadatos), y fuera
  del manifest de la PWA.

### Acceso
Sin cuentas ni perfiles: **una clave** (variable de entorno `PANEL_CLAVE` en
Vercel, la pone Jaime).
- Cookie `panel` HttpOnly, Secure, SameSite=Strict, Path=/, 30 días, firmada
  con HMAC-SHA256 (clave derivada de `PANEL_CLAVE`; cambiar la clave cierra
  todas las sesiones). Contenido: caducidad + firma. Comparación en tiempo
  constante.
- Protección: `middleware.js` para `/panel/:path*` (salvo `/panel/entrar`) y
  `/api/panel/:path*` → 404 sin cookie válida. Las rutas API vuelven a
  comprobarla (defensa en profundidad).
- CSRF: SameSite=Strict + comprobar `Origin`/`Sec-Fetch-Site` en todo POST.
- Fuerza bruta: retraso fijo (~800 ms) en cada intento fallido y límite por
  IP en memoria (best effort en serverless); la clave debe ser larga.
- Sin `PANEL_CLAVE` configurada, el panel no existe (404 siempre).

### Escribir en GitHub (acciones)
El móvil solo escucha al repositorio, así que las acciones del panel escriben
en GitHub con un token de Jaime (`PANEL_GITHUB_TOKEN`, *fine-grained*, solo
este repositorio, permisos: Contents read/write, Issues read, Actions
read/write). Sin token, el panel funciona en **solo lectura** y lo explica.

### Canal de órdenes al móvil — rama `ordenes-movil`
Rama huérfana aparte (Vercel con despliegue desactivado para ella en
vercel.json) con un único fichero `ordenes.json`:
```json
{ "ordenes": [ { "id": "o-20261017-1830-ab12", "accion": "recoger", "pedida": "ISO", "parametros": {} } ] }
```
- El panel añade órdenes (y recorta a las últimas 20) con la API de contenidos.
- El móvil, en su bucle, mira **cada minuto** si la rama ha cambiado
  (`git ls-remote`, barato) y, si hay órdenes nuevas (por id), las ejecuta en
  ese momento sin esperar a la vuelta de 15 min.
- **Solo acciones de una lista cerrada** (`scripts/movil/acciones.sh`), nunca
  comandos libres: una clave del panel filtrada no puede convertirse en
  ejecutar lo que quiera en el móvil. El canal libre `data/orden.sh` sigue
  existiendo solo para mí, vía repositorio.
- Resultado: el móvil escribe `ordenes-resultado.json` en `estado-movil`
  (id, inicio, fin, código, salida recortada y filtrada como orden-salida.txt)
  y sube el informe en el acto.

Acciones v1:
| id | qué hace |
|---|---|
| `informe` | Vuelta sin recoger: refresca estado.json ya (batería, código, etc.) |
| `recoger` | Recogida completa ya (Yelmo + copia de mk2 y Arte Siete), aunque no toque |
| `recoger-yelmo` | Solo Yelmo |
| `respaldo` | Solo la copia de mk2 y Arte Siete |
| `probar-yelmo` | Recolector en modo `--solo-probar` (no publica) |
| `diagnostico` | Versiones (node, chromium, puppeteer), disco libre, memoria, estado git, bucle vivo, wake lock, batería, red (sin IPs) |
| `reiniciar-bucle` | Mata y vuelve a arrancar el bucle propio |
| `actualizar-paquetes` | `pkg upgrade` en segundo plano (largo; resultado al acabar) |

### Historial (para ver fallos con el tiempo)
El móvil publica además en `estado-movil`:
- `historial.jsonl`: una línea por vuelta (hora, resultado, motivo, error
  corto, batería, ritmo, código), últimos 7 días.
- `bateria-historial.json`: el historial de 24 h que ya guarda.
- `recogidas.jsonl`: una línea por recogida con días y películas por cine y
  la duración.

### Enlaces de compra editables por cine
Hoy cada adaptador construye `buyUrl` con un formato fijo
(Arte Siete: `/Session/33/ARTESIETE%20BAHIA/{pase}/{TITULO}/{espectaculo}`,
Yelmo: `compra.yelmocines.es/?cinemaVistaId=..&showtimeVistaId=..`, mk2: el
enlace tal cual de su web). Cuando un cine cambia su formato, el enlace
muere (pasa ahora con Arte Siete).
- Cada sesión lleva además `enlaceCampos` (solo los identificadores que hacen
  falta: pase, espectáculo, título, sesión, cine…).
- `data/enlaces.json` guarda, por cine, una **plantilla** opcional con huecos
  `{campo}` (y `{campo|mayus}`, `{campo|url}`). Si existe, manda sobre el
  formato del adaptador.
- En el panel: elijo una sesión real, veo su enlace actual y sus campos, pego
  el enlace BUENO de esa misma sesión, y el panel **deduce la plantilla**
  (busca los valores de los campos, también codificados, dentro del enlace
  pegado), la prueba con otras sesiones (petición desde el servidor: código
  HTTP) y, si la doy por buena, la guarda (commit de `data/enlaces.json` →
  Vercel redespliega solo, ~1 min). Botón para volver al formato original.

### Datos del servidor
- Estado por cine del agregador (fuente live/stale/error, motivo, días,
  películas, sesiones, edad de los datos, de dónde vienen: directo, móvil,
  copia, memoria).
- Antigüedad de la instantánea de Yelmo y de la copia de respaldo.
- Claves configuradas (TMDB/OMDB: sí/no, nunca el valor).
- Botón "volver a pedir ahora" (se salta la caché de 5 min).
- **Comprobar enlaces de compra**: para cada cine, prueba unas cuantas
  sesiones de hoy y dice cuántas responden bien (y ejemplos de las que no).

### Avisos (vigilante de GitHub)
Lista de avisos abiertos/cerrados recientes (issues `alerta-movil`), y botones
para lanzar el vigilante ya y para mandar un aviso de prueba.

## Interfaz
Mismo mundo que la cartelera pero en modo herramienta (Impeccable: *Operate*):
las mismas fuentes y tokens de color como base, más denso, pensado sobre todo
para el móvil y bien en escritorio. Sin sustos: estados claros (bien, aviso,
fallo, sin datos), horas relativas ("hace 3 min") con la absoluta al lado,
todo con su "última actualización". Las acciones dicen qué van a hacer, se
confirman las que cuestan (recoger, actualizar paquetes), y muestran su
progreso hasta que llega el resultado del móvil (sondeo cada 5 s mientras hay
una orden pendiente).

Secciones v1: Resumen (semáforo de todo en una pantalla) · Móvil (estado,
batería con gráfica de 24 h, vueltas, recogidas, registro) · Cines (estado por
cine, datos, enlaces) · Acciones · Avisos · Enlaces de compra.

## API (contrato entre panel y servidor)
Todas bajo `/api/panel/`, JSON, cookie obligatoria, 404 sin ella.
- `POST /api/panel/entrar` `{clave}` → 204 + cookie | 401 (tras el retraso). `POST /api/panel/salir`.
- `GET /api/panel/estado` → `{ movil: { informe, latidoHace, vivo, bateria, historialBateria, ultimasVueltas[], ultimasRecogidas[], registro, ordenes: { pendientes[], resultados[] } }, servidor: { cines[], instantaneaYelmo, respaldo, claves }, avisos: { abiertos[], recientes[] }, github: { escritura: bool } }`
- `POST /api/panel/orden` `{accion, parametros?}` → `{id}`; `GET /api/panel/orden/:id` → estado/resultado.
- `POST /api/panel/servidor/refrescar` → estado de cines recién pedido.
- `POST /api/panel/enlaces/comprobar` `{cine?}` → resultados por cine.
- `GET /api/panel/enlaces` → plantillas actuales + ejemplos de sesiones con campos.
- `POST /api/panel/enlaces/deducir` `{cine, sesion, enlaceBueno}` → `{plantilla, pruebas[]}`.
- `PUT /api/panel/enlaces` `{cine, plantilla|null}` → commit.
- `POST /api/panel/avisos/vigilar` y `/avisos/prueba`.

## Lo que tiene que hacer Jaime (una vez)
1. Vercel → proyecto → Settings → Environment Variables: `PANEL_CLAVE`.
2. GitHub → token fine-grained solo para este repo → `PANEL_GITHUB_TOKEN`.
3. Redesplegar. Entrar en `/panel/entrar`.

## Ideas para siguientes versiones
Editar a mano una sesión o esconder una película; avisos también por correo;
estadísticas (qué cine falla más); cambiar los turnos de recogida desde el
panel; ver la cartelera "como la ve el servidor" frente a "como la ve el
móvil"; modo mantenimiento con un aviso en la cartelera.

## Cómo ha quedado (17-10-2026) y en qué se aparta del plan
Contrato exacto: [API.md](API.md). Código: `middleware.js`, `lib/panel/**`,
`app/api/panel/**`, `lib/cinemas/enlaces.js`, `scripts/movil/{bucle,ordenes,acciones,publicar}.sh`,
`scripts/movil/{ordenes,historiales}.mjs`.
- **`data/enlaces.js` en vez de `data/enlaces.json`.** Lo importa el agregador,
  que corre en Next y también en node a secas (pruebas, y el móvil usa los
  mismos adaptadores); node no importa `.json` sin atributos de importación.
  Es un módulo con el JSON dentro, igual que `data/yelmo.js` y
  `data/respaldo.js`.
- **`PANEL_CLAVE` de 16 caracteres o más.** Con una más corta el panel no
  existe (404), igual que sin clave: una clave corta no protege nada.
- **El 404 sin sesión** es la página 404 normal de Next (reescritura a una
  ruta que no existe): mismo código y mismo HTML que cualquier URL
  inexistente. Next añade a esa respuesta la cabecera `x-middleware-rewrite`,
  que deja ver a quien mire las cabeceras que la ruta es especial. No es un
  agujero (lo mismo enseña `/panel/entrar`, que existe a propósito) y la
  seguridad está en la clave y la firma, no en esconderse.
- **Órdenes**: caducan a las 6 h sin recoger (`caducada`), para que un móvil
  apagado un día no haga al volver lo que se pidió ayer; el panel no deja
  pedir la misma acción si ya hay una igual pendiente de hace menos de 30 min;
  las largas (`recoger`, `recoger-yelmo`, `respaldo`, `probar-yelmo`,
  `actualizar-paquetes`) se anotan `en-curso` al empezar. `actualizar-paquetes`
  corre en segundo plano con el candado de las vueltas (máx. 30 min): mientras,
  no hay vueltas ni otras órdenes.
- **Ritmo del bucle**: las vueltas empiezan cada 15 min contados desde el
  principio de la anterior (antes, 15 min desde que acababa). Entre medias,
  cada minuto, `ordenes.sh`. El bucle se vuelve a ejecutar solo (mismo
  proceso) cuando `tarea.sh` le deja una versión nueva, y la primera vuelta
  con este código cambia el bucle viejo (que no sabe hacerlo) por el nuevo.
- **La rama `ordenes-movil`** se crea huérfana con `ordenes.json`, un
  `LEEME.txt` y un `vercel.json` con los despliegues apagados (además de la
  entrada en el `vercel.json` de la web), por si Vercel leyera la
  configuración de la propia rama.
- **Sin token**, las lecturas van por `raw.githubusercontent.com` (GitHub las
  sirve con hasta 5 min de caché) y los avisos por la API anónima (60
  peticiones por hora). El panel lo dice en `github.aviso`.
- **Sesiones de copias viejas** sin `enlaceCampos`: los campos se sacan de su
  enlace con el formato de siempre, para que la plantilla también les valga.
- **Token**: además de Contents (lectura y escritura), Issues (lectura) y
  Actions (lectura y escritura), GitHub añade siempre Metadata (lectura).


## Revisión de seguridad (17-10-2026) — qué se cambió
- **Enlaces de compra con lista de dominios por cine** (`HOSTS_POR_CINE` en
  `lib/cinemas/enlaces.js`, sacados de los enlaces reales): plantillas que
  empiezan por `https://<dominio del cine>/` escrito tal cual; cada enlace
  que sale de una plantilla y cada enlace de un adaptador se vuelve a
  comprobar antes de salir en la web (si no vale, el del adaptador o
  ninguno). Una clave robada ya no puede mandar a la gente a otra web, ni un
  cine manipulado colar un `javascript:`.
- **Peticiones de comprobación** solo a esos dominios (y redirecciones, máx. 3,
  solo dentro de ellos): sin SSRF por nip.io, `localhost.`, DNS rebinding…
- **Límites de órdenes** en el servidor Y en el móvil (por su cuenta): espera
  mínima por acción y 10 por hora; `en-curso` cuenta como pendiente. Un
  guardado de plantilla por minuto.
- `javascript:` y demás: solo se pintan como enlace los `https://` (panel y
  cartelera).
- Lo que el móvil publica en `registro.txt` pasa por el mismo filtro que los
  resultados de las órdenes.
- Claves heredadas (`constructor`, `__proto__`…) no valen como cine ni filtro.
- Una orden mal formada se rechaza ella sola, sin atascar las demás.
- Sesiones de 14 días y `PANEL_SESIONES_DESDE` para cerrarlas todas.
- `X-Frame-Options: DENY` y `frame-ancestors 'none'` en todo el panel.
- La respuesta pública de la cartelera ya no lleva `origen`/`datosDe`.
