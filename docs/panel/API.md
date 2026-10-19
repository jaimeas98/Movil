# Panel de control — contrato de la API

Contrato entre la interfaz del panel (`app/panel/**`, `components/panel/**`) y
el servidor (`app/api/panel/**`, `lib/panel/**`). Lo mantiene quien toque el
servidor: si cambia una forma, se cambia aquí en el mismo commit.

Plan y porqués: [PLAN.md](PLAN.md).

## Puesta en marcha (lo que hace Jaime en Vercel y GitHub)

1. Vercel → proyecto → Settings → Environment Variables:
   - `PANEL_CLAVE`: 12 caracteres o más (mejor 20+, aleatoria). Más corta = el
     panel no existe.
   - `PANEL_GITHUB_TOKEN`: token *fine-grained* de GitHub, **solo** del
     repositorio `jaimeas98/Movil`, con Contents: Read and write, Issues: Read,
     Actions: Read and write (Metadata: Read lo pone GitHub).
   - Las dos **solo en el entorno Production** (no en Preview ni Development):
     así una rama o un despliegue de prueba no puede leerlas.
   - Opcional: `PANEL_SESIONES_DESDE` (ver abajo).
2. Vercel → Settings → Git: deja activada la **Git Fork Protection**, para que
   un PR desde un fork no se despliegue con las variables.
3. Redesplegar (las variables nuevas solo se ven tras un despliegue).

### Cerrar todas las sesiones
"Salir" solo borra la cookie de ESE navegador. Si se pierde un móvil o se
sospecha que alguien tiene una cookie del panel:
- pon `PANEL_SESIONES_DESDE` con la fecha y hora de ahora en ISO
  (p. ej. `2026-10-20T18:00:00Z`) y redespliega: toda cookie emitida antes deja
  de valer; o
- cambia `PANEL_CLAVE` y redespliega: cierra todas las sesiones y además la
  clave vieja ya no entra.
Las sesiones caducan solas a los **14 días**.

## Reglas comunes

- Todo bajo `/api/panel/`. Respuestas JSON (`application/json; charset=utf-8`)
  con `Cache-Control: no-store` y `X-Robots-Tag: noindex, nofollow`.
- **Sin sesión → 404** con la página HTML normal de "no existe" de Next (no
  JSON). Lo hace `middleware.js` y cada ruta lo vuelve a comprobar. Así la
  interfaz distingue: 404 **sin** JSON = sesión caducada → `/panel/entrar`;
  404 **con** JSON = algo concreto que no está (p. ej. una orden).
- Sin `PANEL_CLAVE` configurada en el servidor, **todo** es 404, también
  `/panel/entrar` y `POST /api/panel/entrar`.
- Todas las respuestas del panel (páginas y API) llevan además
  `X-Frame-Options: DENY` y `Content-Security-Policy: frame-ancestors 'none'`:
  ninguna web puede meter el panel en un marco.
- `POST`/`PUT` solo desde el mismo origen: si `Origin` no coincide con el host,
  o `Sec-Fetch-Site` existe y no es `same-origin`, → 404 (como sin sesión).
  `fetch` desde la propia página siempre cumple.
- Cuerpos JSON de como mucho 16 KB. Campos desconocidos se ignoran.
- `GET /panel/entrar` con sesión ya válida → **303** a `/panel`.
- Para los componentes de servidor de `app/panel/**` hay `exigirSesion()` en
  `lib/panel/sesion.js` (sin sesión llama a `notFound()`); la puerta de verdad
  es el middleware.
- Las horas van siempre en ISO 8601 UTC (`"2026-10-17T16:30:00.000Z"`).
  Las edades, en **segundos** (`...Hace`, `edadS`).

### Errores (siempre con este cuerpo)

```json
{ "error": "Texto en castellano para enseñar tal cual.", "codigo": "solo-lectura" }
```
Algunos llevan algo más: `ya-pedida` → `"id"` (la orden que ya estaba);
`espera` → `"reintentarEn"` (segundos) y, en órdenes, `"accion"`:
```json
{ "error": "Podrás pedir «recoger» otra vez en 12 min (como mucho una cada 30 min).",
  "codigo": "espera", "reintentarEn": 702, "accion": "recoger" }
```

| HTTP | `codigo` | cuándo |
|---|---|---|
| 400 | `datos` | cuerpo que no vale (falta un campo, acción desconocida, URL rara…) |
| 401 | `clave` | `entrar` con clave mala (tras ~800 ms) |
| 403 | `solo-lectura` | escritura sin `PANEL_GITHUB_TOKEN` configurado |
| 404 | `no-esta` | (con JSON) la orden/sesión pedida no existe |
| 409 | `conflicto` / `ya-pedida` | GitHub cambió entre medias y no se pudo tras reintentar / esa acción ya está pendiente o en marcha (lleva `id`) |
| 429 | `limite` | demasiados intentos (entrar) o refrescos seguidos |
| 429 | `espera` | una orden o un guardado de plantilla antes de su espera mínima: lleva `reintentarEn` (segundos) y el texto ya dice "podrás… en N min" |
| 502 | `github` | GitHub ha fallado o no responde |
| 500 | `servidor` | fallo nuestro |

## Entrar y salir

### `POST /api/panel/entrar`
Cuerpo `{"clave": "…"}` (también vale un formulario
`application/x-www-form-urlencoded` con `clave=…`, para que la entrada funcione
sin JavaScript: entonces responde **303** a `/panel` o a `/panel/entrar?mal=1`).

- **204** sin cuerpo + `Set-Cookie: panel=v1.<caducidad>.<firma>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=1209600` (14 días)
- **401** `{"error":"Esa clave no vale.","codigo":"clave"}` (siempre tras ~800 ms)
- **429** `{"error":"Demasiados intentos seguidos. Espera un minuto.","codigo":"limite"}`
  (más de 5 fallos en 10 min desde la misma IP, en esa instancia del servidor)

### `POST /api/panel/salir`
Cuerpo `{}`. **204** y borra la cookie (`Max-Age=0`). Con sesión obligatoria
como todo lo demás.

## Estado

### `GET /api/panel/estado`
Opcional `?partes=movil,servidor,avisos` (por defecto las tres). `github`
siempre va. Lo de GitHub se cachea ~20 s en memoria (4 s para las órdenes);
el servidor usa la caché de 5 min del agregador (para saltársela,
`POST /api/panel/servidor/refrescar`).

Si una parte falla, no tumba las demás: esa parte trae `error` (texto) y lo que
se haya podido leer.

```json
{
  "generadoEn": "2026-10-17T16:31:02.120Z",
  "github": {
    "escritura": true,
    "repo": "jaimeas98/Movil",
    "ramaApp": "claude/puerto-santa-maria-restaurants-NxChu",
    "lectura": "api",
    "aviso": null,
    "caducaToken": "2026-12-30T23:00:00.000Z"
  },
  "movil": {
    "informe": {
      "vuelta": "2026-10-17T16:30:11.000Z",
      "resultado": "sin recogida: no tocaba",
      "motivo": null,
      "error": null,
      "ultimaRecogida": "2026-10-17T05:04:42.000Z",
      "proximaRecogida": "2026-10-17T16:00:00.000Z",
      "codigo": "7d2efa5",
      "ultimaOrden": null,
      "enchufe": null,
      "dispositivo": { "modelo": "M2002F4LG", "android": "12", "node": "v22.9.0" },
      "bateria": {
        "porcentaje": 81, "cargando": true, "estado": "GOOD", "temperatura": 29.5,
        "ritmoPorHora": null, "horasHastaReserva": null, "desenchufadoDesde": null
      }
    },
    "latidoHace": 51,
    "vivo": true,
    "bateria": { "porcentaje": 81, "cargando": true, "estado": "GOOD", "temperatura": 29.5,
                 "ritmoPorHora": null, "horasHastaReserva": null, "desenchufadoDesde": null },
    "historialBateria": [
      { "t": 1792247411000, "pct": 80, "cargando": true },
      { "t": 1792248311000, "pct": 81, "cargando": true }
    ],
    "ultimasVueltas": [
      {
        "t": "2026-10-17T16:30:11.000Z", "resultado": "sin recogida: no tocaba",
        "motivo": null, "error": null, "bateria": 81, "cargando": true,
        "ritmo": null, "codigo": "7d2efa5", "orden": null
      }
    ],
    "ultimasRecogidas": [
      {
        "t": "2026-10-17T05:04:50.000Z", "motivo": "turno de las 07:00",
        "resultado": "recogida y publicada", "duracionS": 71, "orden": null,
        "partes": ["yelmo", "respaldo"],
        "cines": {
          "yelmo-bahia-sur":     { "dias": 7, "peliculas": 18 },
          "yelmo-jerez":         { "dias": 7, "peliculas": 21 },
          "cinesur-bahia-cadiz": { "dias": 9, "peliculas": 15, "at": "2026-10-17T05:04:47.059Z" },
          "arte-siete-puerto":   { "dias": 7, "peliculas": 12, "at": "2026-10-17T05:04:47.059Z" }
        }
      }
    ],
    "registro": "=== 2026-10-17 18:30:01 vuelta\ncódigo al día: 7d2efa5\n…",
    "ordenes": {
      "pendientes": [
        { "id": "o-20261017-1830-ab12", "accion": "recoger", "pedida": "2026-10-17T16:30:40.000Z", "parametros": {} }
      ],
      "resultados": [
        {
          "id": "o-20261017-1815-9f3c", "accion": "diagnostico", "estado": "hecha",
          "inicio": "2026-10-17T16:16:02.000Z", "fin": "2026-10-17T16:16:09.000Z",
          "codigo": 0, "salida": "node v22.9.0\nchromium 130.0…\n…"
        }
      ]
    },
    "ficheros": { "estado.json": true, "registro.txt": true, "historial.jsonl": true,
                  "recogidas.jsonl": true, "bateria-historial.json": true,
                  "ordenes-resultado.json": false, "ordenes.json": true },
    "error": null
  },
  "servidor": {
    "generadoEn": "2026-10-17T16:28:40.551Z",
    "cacheHace": 142,
    "cines": [
      {
        "id": "arte-siete-puerto", "nombre": "Arte Siete El Puerto", "corto": "Arte Siete",
        "fuente": "live", "motivo": null, "origen": "directo",
        "datosDe": "2026-10-17T16:28:40.551Z", "edadS": 142,
        "dias": 7, "primerDia": "2026-10-17", "ultimoDia": "2026-10-23",
        "peliculas": 12, "sesiones": 214, "hoy": { "peliculas": 9, "sesiones": 31 },
        "porDia": { "2026-10-17": 9, "2026-10-18": 10 },
        "diasCompletados": 0,
        "plantilla": "original"
      },
      {
        "id": "yelmo-bahia-sur", "nombre": "Yelmo Premium Bahía Sur", "corto": "Yelmo Bahía Sur",
        "fuente": "live", "motivo": null, "origen": "movil",
        "datosDe": "2026-10-17T05:04:42.698Z", "edadS": 41040,
        "dias": 7, "primerDia": "2026-10-17", "ultimoDia": "2026-10-23",
        "peliculas": 18, "sesiones": 260, "hoy": { "peliculas": 14, "sesiones": 40 },
        "porDia": { "2026-10-17": 14 }, "diasCompletados": 0, "plantilla": "propia"
      }
    ],
    "instantaneaYelmo": {
      "generadoEn": "2026-10-17T05:04:42.698Z", "edadS": 41040, "origen": "navegador-movil",
      "cines": { "yelmo-bahia-sur": { "dias": 7 }, "yelmo-jerez": { "dias": 7 } }
    },
    "respaldo": {
      "generadoEn": "2026-10-17T05:04:47.060Z", "edadS": 41035,
      "cines": { "cinesur-bahia-cadiz": { "at": "2026-10-17T05:04:47.059Z", "dias": 9 },
                 "arte-siete-puerto":   { "at": "2026-10-17T05:04:47.059Z", "dias": 7 } }
    },
    "claves": { "tmdb": true, "omdb": false, "github": true },
    "error": null
  },
  "avisos": {
    "abiertos": [
      {
        "numero": 12, "titulo": "El móvil no responde desde hace 1 h",
        "url": "https://github.com/jaimeas98/Movil/issues/12",
        "estado": "open", "nivel": "aviso",
        "creado": "2026-10-17T10:02:00Z", "actualizado": "2026-10-17T10:32:00Z", "cerrado": null,
        "comentarios": 1
      }
    ],
    "recientes": [],
    "error": null
  }
}
```

Notas de campos:
- `movil.informe` es `estado.json` tal cual lo escribe el móvil (puede ganar
  campos). `null` si no se ha podido leer.
- `latidoHace`: segundos desde `informe.vuelta`. `vivo`: `latidoHace ≤ 2700`
  (45 min, lo mismo que usa el vigilante).
- `ultimasRecogidas[].cines`: cuentas de lo que hay en `data/yelmo.js` y
  `data/respaldo.js` tras esa recogida (incluye días conservados de antes); en
  los cines de la copia, `at` dice cuándo se leyó ese cine por última vez (si
  es anterior a `t`, esta vez no respondió). `partes`: `yelmo`, `respaldo`.
- `ultimasVueltas` (de `historial.jsonl`) y `ultimasRecogidas` (de
  `recogidas.jsonl`) van **de la más reciente a la más antigua**: hasta 7 días
  de vueltas (~670) y 60 recogidas. `bateria` en vueltas es el porcentaje.
- `ordenes.pendientes`: órdenes de `ordenes.json` que aún no tienen resultado.
  `ordenes.resultados`: lo que publica el móvil (más reciente primero, ≤20).
  Valores de `estado`: `en-curso`, `hecha`, `fallida`, `rechazada`, `caducada`.
- `ficheros`: qué ficheros se han podido leer (falso = aún no existe, p. ej.
  antes de que el móvil coja la versión nueva).
- `servidor.cines[].fuente`: `live` | `stale` | `error` | `sample`.
  `origen`: `directo` (leído ahora de su web) | `movil` (instantánea de Yelmo
  del móvil) | `copia` (copia de respaldo del móvil) | `memoria` (última
  respuesta buena guardada en la instancia) | `ejemplo` | `null` (sin datos).
  `datosDe`: de cuándo son los datos. `diasCompletados`: días que faltaban y
  se han rellenado con la copia reciente. `plantilla`: `propia` si hay
  plantilla en `data/enlaces.js`, `original` si no.
- `claves`: solo sí/no, nunca valores. `github` = `PANEL_GITHUB_TOKEN`.
- `avisos.*.nivel`: `critico` si el issue tiene la etiqueta `critico`, si no `aviso`.
  `recientes` = cerrados en los últimos 14 días (≤10).
- `github.lectura`: `api` (con token: al momento) o `publica` (sin token:
  lecturas anónimas, GitHub puede servirlas con hasta 5 min de retraso y con
  límite de peticiones). `github.aviso`: texto para enseñar si algo va justo.
- `github.caducaToken`: cuándo caduca `PANEL_GITHUB_TOKEN` (ISO), sacado de la
  cabecera `github-authentication-token-expiration` de GitHub; `null` si no
  caduca. No viene sin token. El panel avisa 14 días antes.
- `github.tokenRechazado`: `true` si GitHub ha respondido 401 al token (ya
  caducado o revocado; entonces no hay fecha). Solo viene cuando es `true`.

## Órdenes al móvil

Acciones válidas (lista cerrada, igual en el servidor y en el móvil):

| `accion` | qué hace | tarda |
|---|---|---|
| `informe` | vuelta sin recoger: estado.json al momento | ~20 s |
| `recoger` | recogida completa (Yelmo + copia de mk2 y Arte Siete) | 1–5 min |
| `recoger-yelmo` | solo Yelmo | 1–4 min |
| `respaldo` | solo la copia de mk2 y Arte Siete | ~1 min |
| `probar-yelmo` | recolector en modo `--solo-probar` (no publica) | 1–4 min |
| `diagnostico` | versiones, disco, memoria, git, bucle, batería, red (sin IPs) | ~15 s |
| `reiniciar-bucle` | mata y vuelve a arrancar el bucle | ~5 s |
| `actualizar-paquetes` | `pkg upgrade` en segundo plano; resultado al acabar | 5–30 min |

El móvil mira la rama cada minuto: una orden empieza como mucho ~1 min después
(más si hay una vuelta o recogida en marcha: nunca hace dos cosas a la vez).
Las órdenes con más de 6 h sin recoger por el móvil ya no se ejecutan
(`caducada`).

**Límites** (los aplica el servidor al pedir, y el MÓVIL otra vez por su
cuenta, con su propio registro; una orden fuera de límite que llegue al
móvil queda `rechazada` con el motivo en `salida`):

| acción | espera mínima entre dos |
|---|---|
| `informe`, `diagnostico` | 2 min |
| `reiniciar-bucle` | 10 min |
| `recoger`, `recoger-yelmo`, `respaldo`, `probar-yelmo` | 30 min |
| `actualizar-paquetes` | 24 h |

y como mucho **10 órdenes por hora** entre todas. Una orden cuenta desde que
se pide (o desde que el móvil la empieza); las rechazadas y caducadas no
cuentan. Mientras una igual está pendiente o `en-curso`, la respuesta es 409
`ya-pedida`; pasada, si aún no toca, 429 `espera`.

### `POST /api/panel/orden`
Cuerpo `{"accion": "recoger"}` (`parametros`, si va, tiene que ser `{}`: ninguna
acción v1 lleva parámetros).

- **201** `{"id":"o-20261017-1830-ab12","accion":"recoger","pedida":"2026-10-17T16:30:40.000Z","estado":"pendiente"}`
- **400** acción fuera de la lista · **403** solo lectura
- **409** `{"error":"Ya hay una orden «recoger» pendiente o en marcha (o-20261017-1825-77aa).","codigo":"ya-pedida","id":"o-20261017-1825-77aa"}`
- **429** `{"error":"Podrás pedir «recoger» otra vez en 12 min (como mucho una cada 30 min).","codigo":"espera","reintentarEn":702,"accion":"recoger"}`

### `GET /api/panel/orden/:id`
- **200**
```json
{
  "id": "o-20261017-1830-ab12", "accion": "recoger",
  "pedida": "2026-10-17T16:30:40.000Z",
  "estado": "pendiente",
  "resultado": null
}
```
  `estado`: `pendiente` (aún no la ha cogido el móvil) | `en-curso` | `hecha` |
  `fallida` | `rechazada` | `caducada`. Con resultado:
```json
{
  "id": "o-20261017-1830-ab12", "accion": "recoger", "pedida": "2026-10-17T16:30:40.000Z",
  "estado": "hecha",
  "resultado": {
    "id": "o-20261017-1830-ab12", "accion": "recoger", "estado": "hecha",
    "inicio": "2026-10-17T16:31:05.000Z", "fin": "2026-10-17T16:33:12.000Z",
    "codigo": 0,
    "salida": "recogiendo: pedida desde el panel\n✅ Yelmo …\nresultado: recogida y publicada"
  }
}
```
- **404** (JSON, `codigo: "no-esta"`) si el id no está ni en `ordenes.json` ni en
  los resultados (se guardan las últimas 20).

Para seguir una orden: sondear cada 5 s mientras `estado` sea `pendiente` o
`en-curso` (la caché de esta lectura es de 4 s).

## Servidor

### `POST /api/panel/servidor/refrescar`
Cuerpo `{}`. Vacía la caché del agregador y vuelve a pedir los 4 cines (puede
tardar 10–40 s). Como mucho uno cada 20 s (si no, **429**).
- **200** el mismo objeto que `estado.servidor`.

## Enlaces de compra

Cada sesión tiene unos **campos** (los identificadores que hacen falta para su
enlace) y cada cine puede tener una **plantilla** guardada en
`data/enlaces.js` que manda sobre el formato del adaptador.

**Dominios permitidos** (seguridad): un enlace de compra solo vale si es
`https://`, sin usuario ni puerto, y a un dominio del cine o un subdominio
suyo. Vale para las plantillas (tienen que empezar por `https://<dominio>/`
escrito tal cual, nunca por un hueco), para cada enlace que salga de ellas
(si no pasa, la sesión se queda con el del adaptador), para los enlaces de
los propios adaptadores (si no pasa, la sesión va sin enlace), para el enlace
bueno que se pega en `deducir` y para las peticiones de prueba y sus
redirecciones (máx. 3).

| cine | dominios |
|---|---|
| `arte-siete-puerto` | `artesiete.es` (hoy `bahia.artesiete.es`) |
| `yelmo-bahia-sur`, `yelmo-jerez` | `yelmocines.es` (hoy `compra.yelmocines.es`) |
| `cinesur-bahia-cadiz` | `entradas.com` (hoy `cine.entradas.com`), `mk2cines.es` |

Campos por cine:
| cine | campos |
|---|---|
| `arte-siete-puerto` | `pase`, `espectaculo`, `titulo` (título tal cual viene de Arte Siete) |
| `yelmo-bahia-sur`, `yelmo-jerez` | `cineVista`, `sesion` |
| `cinesur-bahia-cadiz` | `evento`, `pelicula` (sacados de su enlace); si su enlace no los lleva, `enlace` |

Plantilla: texto con huecos `{campo}` y filtros encadenables
`{campo|filtro|filtro}`. Filtros: `mayus`, `minus`, `url`
(encodeURIComponent), `url+` (como `url` pero espacios como `+`), `slug`
(`la-bola-negra`). Ejemplo, el formato de hoy de Arte Siete:
`https://bahia.artesiete.es/Session/33/ARTESIETE%20BAHIA/{pase}/{titulo|mayus|url}/{espectaculo}`

Las sesiones de una copia vieja del móvil (hecha antes de que existieran los
campos) los sacan de su propio enlace, si tiene el formato de siempre; así
la plantilla vale también para ellas.

Los cambios de plantilla se guardan con un commit en la rama de la web:
**la cartelera los usa cuando Vercel termina de redesplegar (~1 min)**.

### `GET /api/panel/enlaces`
```json
{
  "filtros": ["mayus", "minus", "url", "url+", "slug"],
  "cines": [
    {
      "id": "arte-siete-puerto", "nombre": "Arte Siete El Puerto",
      "campos": ["pase", "espectaculo", "titulo"],
      "original": "https://bahia.artesiete.es/Session/33/ARTESIETE%20BAHIA/{pase}/{titulo|mayus|url}/{espectaculo}",
      "plantilla": null,
      "guardada": null,
      "sesiones": [
        {
          "clave": "arte-siete-puerto|2026-10-17|boiuna-la-leyenda-del-amazonas|15:50|Sala 01",
          "fecha": "2026-10-17", "hora": "15:50", "pelicula": "Boiuna. La Leyenda Del Amazonas",
          "sala": "Sala 01", "formato": "Laser", "idioma": "VE",
          "campos": { "pase": "38064", "espectaculo": "19390", "titulo": "BOIUNA. LA LEYENDA DEL AMAZONAS" },
          "enlace": "https://bahia.artesiete.es/Session/33/ARTESIETE%20BAHIA/38064/BOIUNA.%20LA%20LEYENDA%20DEL%20AMAZONAS/19390",
          "enlaceOriginal": "https://bahia.artesiete.es/Session/33/ARTESIETE%20BAHIA/38064/BOIUNA.%20LA%20LEYENDA%20DEL%20AMAZONAS/19390"
        }
      ]
    }
  ]
}
```
- `original`: el formato del adaptador escrito como plantilla, para enseñarlo
  (para Yelmo y mk2 es aproximado: el adaptador manda). `plantilla`: la
  guardada (`null` = se usa la original). `sesiones`: hasta 12 de hoy y mañana,
  de películas distintas primero. `enlace` = el que ve la cartelera ahora;
  `enlaceOriginal` = el del adaptador.

### `POST /api/panel/enlaces/deducir`
Cuerpo `{"cine":"arte-siete-puerto","sesion":"<clave de GET /enlaces>","enlaceBueno":"https://…"}`.
También vale `"campos": {…}` en vez de `sesion` si la sesión ya no está (solo
se aceptan los campos de ese cine).

Busca en `enlaceBueno` el valor de cada campo (tal cual, en mayúsculas,
minúsculas, codificado, slug…) y lo sustituye por su hueco. Comprueba que la
plantilla, aplicada a esa misma sesión, da **exactamente** el enlace pegado, y
la prueba con hasta 5 sesiones más (GET desde el servidor, sigue
redirecciones, 6 s máximo cada una).

- **200**
```json
{
  "plantilla": "https://bahia.artesiete.es/compra/sesion/{pase}?pelicula={titulo|slug}&e={espectaculo}",
  "usados": ["pase", "titulo", "espectaculo"],
  "sinUsar": [],
  "renderizado": "https://bahia.artesiete.es/compra/sesion/38064?pelicula=boiuna-la-leyenda-del-amazonas&e=19390",
  "igual": true,
  "avisos": [],
  "pruebas": [
    {
      "clave": "arte-siete-puerto|2026-10-17|la-bola-negra|18:00|Sala 03",
      "pelicula": "La Bola Negra", "fecha": "2026-10-17", "hora": "18:00",
      "url": "https://bahia.artesiete.es/compra/sesion/38070?pelicula=la-bola-negra&e=19401",
      "estado": 200, "ok": true, "final": "https://bahia.artesiete.es/compra/sesion/38070?pelicula=la-bola-negra&e=19401",
      "motivo": null, "ms": 412
    }
  ]
}
```
  `avisos` (textos): p. ej. "La plantilla no usa ningún campo: todas las
  sesiones irían al mismo enlace." o "pase y espectaculo tienen el mismo
  valor; revisa cuál es cuál.".
  En `pruebas`, `ok` es `true` con 2xx tras redirecciones; `false` con
  `motivo` ("HTTP 404", "redirige a la portada", "no responde en 6 s",
  "bloqueado por Cloudflare: no se puede comprobar desde el servidor" — en
  este último `ok` es `null`, ni bien ni mal —, "redirige fuera de la web del
  cine": no se sigue).
- **400** enlace que no es `https://` de un dominio del cine (ver arriba),
  ≤2000 caracteres · **404** sesión que ya no está.

### `PUT /api/panel/enlaces`
Cuerpo `{"cine":"arte-siete-puerto","plantilla":"https://…{pase}…"}` o
`{"cine":"arte-siete-puerto","plantilla":null}` (volver al formato original).
La plantilla se valida (empieza por `https://<dominio del cine>/`, solo huecos
y filtros conocidos de ese cine, ≤1000 caracteres). Como mucho **un guardado
por minuto** (429 `espera` con `reintentarEn`).
- **200**
```json
{
  "ok": true, "cine": "arte-siete-puerto",
  "plantilla": "https://bahia.artesiete.es/compra/sesion/{pase}?pelicula={titulo|slug}&e={espectaculo}",
  "commit": "a1b2c3d",
  "aviso": "Guardado. La cartelera lo usará cuando Vercel termine de redesplegar (~1 min)."
}
```
- **400** plantilla no válida · **403** solo lectura · **409** conflicto tras 3 intentos · **429** `espera`.

### `POST /api/panel/enlaces/comprobar`
Cuerpo `{}` (todos los cines, 3 sesiones de cada) o `{"cine":"arte-siete-puerto"}`
(5 sesiones). Sesiones de hoy (o del primer día con sesiones), de películas
distintas. GET desde el servidor con los enlaces que ve la cartelera ahora.
- **200**
```json
{
  "comprobadoEn": "2026-10-17T16:40:00.000Z",
  "cines": [
    {
      "id": "arte-siete-puerto", "nombre": "Arte Siete El Puerto", "plantilla": "original",
      "probadas": 3, "buenas": 0, "dudosas": 0,
      "pruebas": [
        { "clave": "…", "pelicula": "Boiuna…", "fecha": "2026-10-17", "hora": "15:50",
          "url": "https://bahia.artesiete.es/Session/33/…", "estado": 200, "ok": false,
          "final": "https://bahia.artesiete.es/", "motivo": "redirige a la portada", "ms": 380 }
      ]
    }
  ]
}
```
  `dudosas` = pruebas con `ok: null` (no se pueden comprobar desde el servidor).

## Avisos (vigilante de GitHub)

### `POST /api/panel/avisos/vigilar`
Cuerpo `{}`. Lanza el workflow `vigilante-movil.yml` ya (`workflow_dispatch`).
- **202** `{"ok":true,"aviso":"Vigilante lanzado; tarda ~1 min en revisar."}`
- **403** solo lectura (o el token no tiene permiso de Actions: el texto lo dice).

### `POST /api/panel/avisos/prueba`
Cuerpo `{}`. Igual, con `prueba: true`: abre un aviso de prueba que se cierra
solo en la siguiente revisión.
- **202** `{"ok":true,"aviso":"Aviso de prueba pedido; debería llegarte en 1–2 min."}`

## Ficheros de GitHub que intervienen

| fichero | rama | quién escribe | forma |
|---|---|---|---|
| `ordenes.json` | `ordenes-movil` (huérfana) | panel | `{"ordenes":[{"id","accion","pedida","parametros"}]}` (≤20) |
| `ordenes-resultado.json` | `estado-movil` | móvil | `{"actualizado","resultados":[{"id","accion","estado","inicio","fin","codigo","salida"}]}` (≤20, recientes primero) |
| `estado.json`, `registro.txt` | `estado-movil` | móvil | lo de siempre |
| `historial.jsonl` | `estado-movil` | móvil | una línea JSON por vuelta, 7 días |
| `recogidas.jsonl` | `estado-movil` | móvil | una línea JSON por recogida, 7 días (≤200) |
| `bateria-historial.json` | `estado-movil` | móvil | `[{"t":ms,"pct","cargando"}]`, 24 h |
| `data/enlaces.js` | rama de la web | panel | `export default {"actualizado","plantillas":{"<cine>":{"plantilla","guardada"}}}` |
