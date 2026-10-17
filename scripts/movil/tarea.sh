#!/data/data/com.termux/files/usr/bin/bash
# Una vuelta del recolector en el móvil. La lanza ciclo.sh cada 15 minutos,
# SIEMPRE con la versión más reciente de este fichero: cualquier cambio que se
# suba al repositorio se aplica solo en la vuelta siguiente.
#
# En cada vuelta:
#  1. decide si toca recoger la cartelera (ver TURNOS, o si se ha pedido);
#  2. si toca, recoge Yelmo con Chromium, hace copia de mk2 y Arte Siete, y lo
#     publica en la rama de la web;
#  3. pase lo que pase, deja un informe en la rama `estado-movil`.
#
# El informe es el latido del móvil: si su fecha deja de avanzar, el móvil se
# ha apagado o Android ha cerrado Termux, y se sabe sin tener que mirarlo.
#
# PEDIR UNA RECOGIDA DESDE FUERA: basta con crear data/forzar-recogida en la
# rama de la web. La vuelta siguiente recoge y borra el fichero.
#
# DESDE EL PANEL DE CONTROL (ordenes.sh → acciones.sh) se lanza con:
#   RECOLECTOR_PEDIDA=informe|recoger|yelmo|respaldo  qué se ha pedido
#   RECOLECTOR_SIN_PUBLICAR=1   no sube el informe: lo sube ordenes.sh con el
#                               resultado de la orden ya anotado
#   RECOLECTOR_ORDEN=<id>       para anotarlo en el historial

set -u

DIR="$HOME/Movil"
DIR_ESTADO="$HOME/estado-movil"
BASE="$HOME/.recolector"
RAMA_APP="claude/puerto-santa-maria-restaurants-NxChu"
RAMA_ESTADO="estado-movil"
LOG="$BASE/ciclo.log"
# Dos recogidas al día, a horas fijas (hora del móvil, que es la de España).
# Si una falla, se reintenta cada hora, pero ya no a menos de CERCA segundos
# del turno siguiente: ese turno la hará igualmente.
TURNOS="07:00 18:00"
CERCA=7200

# Mantener la CPU despierta. Ya no se suelta al acabar la vuelta: el bucle
# propio (bucle.sh) lo necesita tomado para no dormirse entre vuelta y vuelta.
termux-wake-lock 2>/dev/null

# ── Que el bucle propio esté vivo ───────────────────────────────────────────
# El planificador de Android falla con el móvil bloqueado (ver bucle.sh), así
# que cada vuelta, la lance quien la lance, comprueba que el bucle siga
# corriendo y si no lo arranca. Si nadie tiene su candado, no está vivo.
# También deja Termux:Boot arrancándolo al encender el móvil.
# Copias fuera del repositorio (ver ciclo.sh): con cp + mv, nunca a medias. Un
# bash que esté ejecutando la versión anterior sigue leyendo la suya (mv
# cambia el nombre, no reescribe el fichero que ya tiene abierto).
copiar_fuera() {
  cmp -s "$DIR/scripts/movil/$1" "$BASE/$1" && return 0
  cp "$DIR/scripts/movil/$1" "$BASE/$1.nuevo" && mv -f "$BASE/$1.nuevo" "$BASE/$1"
}
copiar_fuera ordenes.sh   # órdenes del panel, cada minuto desde el bucle

if [ -z "${RECOLECTOR_SIN_BUCLE:-}" ]; then   # RECOLECTOR_SIN_BUCLE: solo para probar.sh
  copiar_fuera bucle.sh
  # Un bucle de antes del panel (17-10-2026) no sabe actualizarse solo ni
  # mirar órdenes, y no se iría nunca: se reconoce porque no deja su pid. Se
  # para, y justo abajo se arranca el nuevo. (Esta vuelta es hija suya, pero
  # sigue: matar al padre no mata a los hijos.)
  pid_bucle=$(cat "$BASE/bucle.pid" 2>/dev/null)
  if ! flock -n "$BASE/bucle.candado" true 2>/dev/null \
     && ! { [ -n "$pid_bucle" ] && kill -0 "$pid_bucle" 2>/dev/null; }; then
    echo "el bucle en marcha es de una versión anterior: lo cambio por el nuevo"
    # Con sus hijos: el `sleep 900` de aquel bucle hereda su candado y lo
    # retendría hasta 15 min. Si esta vuelta es hija suya, a ella no ($$).
    for p in $(pgrep -f "$BASE/bucle.sh" 2>/dev/null); do
      for h in $(pgrep -P "$p" 2>/dev/null); do [ "$h" != "$$" ] && kill "$h" 2>/dev/null; done
      kill "$p" 2>/dev/null
    done
    sleep 1
  fi
  if flock -n "$BASE/bucle.candado" true 2>/dev/null; then
    echo "el bucle propio no estaba corriendo: lo arranco"
    nohup bash "$BASE/bucle.sh" </dev/null >/dev/null 2>&1 8>&- 9>&- &
  fi
  arranque="$HOME/.termux/boot/recolector.sh"
  contenido=$(printf '#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
termux-job-scheduler --job-id 7 --script %s/ciclo.sh --period-ms 900000 --persisted true --network any
nohup bash %s/bucle.sh </dev/null >/dev/null 2>&1 &
' "$BASE" "$BASE")
  if [ -d "$HOME/.termux/boot" ] && [ "$(cat "$arranque" 2>/dev/null)" != "$contenido" ]; then
    printf '%s\n' "$contenido" > "$arranque" && chmod +x "$arranque"
  fi
fi

cd "$DIR" || exit 1

# La versión con la que ARRANCA la vuelta, antes de que un commit de datos la
# mueva: es la que dice si un arreglo subido al repositorio ya ha llegado.
codigo=$(git rev-parse --short HEAD)

ahora=${AHORA_PRUEBA:-$(date +%s)}   # AHORA_PRUEBA: solo para probar.sh
ultima=$(cat "$BASE/ultima-recogida" 2>/dev/null || echo 0)   # último ÉXITO
intento=$(cat "$BASE/ultimo-intento" 2>/dev/null || echo 0)   # último intento, saliera como saliera
desde_intento=$(( ahora - intento ))
rm -f "$BASE/bloqueado"   # de la versión anterior, que esperaba 24 h tras un bloqueo

# El turno en curso (el último que ya ha empezado) y el siguiente. Se parte del
# mediodía de hoy para que sumar o restar un día no tropiece con el cambio de
# hora.
hora() { date -d "@$1" '+%H:%M'; }
mediodia=$(date -d "$(date -d "@$ahora" +%F) 12:00" +%s)
turno=0; siguiente=0
for m in $(( mediodia - 86400 )) "$mediodia" $(( mediodia + 86400 )); do
  for h in $TURNOS; do
    t=$(date -d "$(date -d "@$m" +%F) $h" +%s)
    if [ "$t" -le "$ahora" ]; then turno=$t; elif [ "$siguiente" = 0 ]; then siguiente=$t; fi
  done
done

# Excepción: si el último intento FALLÓ y desde entonces ha cambiado el
# recolector, se prueba ya, sin esperar: es un arreglo nuevo, no insistir con
# lo mismo que falló.
huella_rec=$(cat scripts/movil/tarea.sh scripts/movil/recolector-navegador.mjs 2>/dev/null | sha1sum | cut -c1-12)
reintento=""
if [ "$intento" -gt "$ultima" ] && [ "$huella_rec" != "$(cat "$BASE/intento-codigo" 2>/dev/null)" ]; then
  reintento=1
fi

motivo=""
espera=""
if [ -n "$reintento" ]; then
  motivo="reintento: el recolector ha cambiado tras un fallo"
elif [ -f data/forzar-recogida ] && [ "$desde_intento" -ge 3600 ]; then
  motivo="pedida desde el repositorio"
elif [ "$ultima" -lt "$turno" ]; then
  # Este turno aún no ha salido bien.
  if [ "$intento" -lt "$turno" ]; then
    motivo="turno de las $(hora "$turno")"
  elif [ $(( siguiente - ahora )) -le "$CERCA" ]; then
    espera="falló; el turno de las $(hora "$siguiente") está cerca y lo hará él"
  elif [ "$desde_intento" -ge 3600 ]; then
    motivo="reintento del turno de las $(hora "$turno") (falló hace $(( desde_intento / 60 )) min)"
  else
    espera="falló; reintento a las $(hora $(( intento + 3600 )))"
  fi
fi

# Lo pedido desde el panel manda sobre los turnos.
partes="yelmo respaldo"
case "${RECOLECTOR_PEDIDA:-}" in
  informe)  motivo=""; espera="informe pedido desde el panel" ;;
  recoger)  motivo="pedida desde el panel" ;;
  yelmo)    motivo="pedida desde el panel (solo Yelmo)"; partes="yelmo" ;;
  respaldo) motivo="pedida desde el panel (solo la copia de mk2 y Arte Siete)"; partes="respaldo" ;;
esac
con() { case " $partes " in *" $1 "*) return 0 ;; esac; return 1; }

resultado="sin recogida: ${espera:-no tocaba}"
error=""

# La recogida la hace Chromium, no Node a pelo: Yelmo bloquea con Cloudflare a
# cualquier cliente que no sea un navegador (ver recolector-navegador.mjs).
# Chromium y puppeteer-core los deja instalados instalar.sh; el recolector se
# copia junto a puppeteer-core para que Node lo encuentre.
recolectar() {
  local nav="$HOME/navegador" chrome
  chrome=$(command -v chromium-browser || command -v chromium) \
    || { echo "❌ Chromium no está instalado (pkg install x11-repo && pkg install chromium)"; return 1; }
  [ -d "$nav/node_modules/puppeteer-core" ] \
    || { echo "❌ falta puppeteer-core en ~/navegador (cd ~/navegador && npm install puppeteer-core)"; return 1; }
  cp "$DIR/scripts/movil/recolector-navegador.mjs" "$nav/recolector.mjs"
  # Modelo y Android, los de ESTE móvil: Chromium se presenta como su Chrome
  # (ver recolector-navegador.mjs). Si el móvil se cambia, cambian solos.
  ( cd "$nav" && DESTINO="$DIR/data/yelmo.js" CHROME="$chrome" \
      DISPOSITIVO_MODELO="$(getprop ro.product.model 2>/dev/null)" \
      DISPOSITIVO_ANDROID="$(getprop ro.build.version.release 2>/dev/null)" \
      timeout 240 node recolector.mjs ) && return 0
  local r=$?
  [ "$r" = 124 ] && echo "❌ cortado a los 4 minutos (¿Yelmo o la red muy lentos?)"
  return "$r"
}

if [ -n "$motivo" ]; then
  echo "recogiendo: $motivo"
  t_recogida=$(date +%s)
  yelmo_ok=""
  salida=""
  if con yelmo; then
    echo "$ahora" > "$BASE/ultimo-intento"
    echo "$huella_rec" > "$BASE/intento-codigo"
    if salida=$(recolectar 2>&1); then yelmo_ok=1; fi
    echo "$salida"
  fi

  # Copia de mk2 y Arte Siete. Va aparte de Yelmo y nunca hace fallar la
  # vuelta: si no responden, se conserva la copia anterior.
  if con respaldo; then
    ( cd "$DIR" && DESTINO=data/respaldo.js timeout 180 node --no-warnings scripts/movil/respaldo-cines.mjs 2>&1 ) || true
  fi

  if [ -n "$yelmo_ok" ]; then
    echo "$ahora" > "$BASE/ultima-recogida"
    [ -f data/forzar-recogida ] && git rm -q data/forzar-recogida
  elif con yelmo; then
    error=$(printf '%s' "$salida" | tail -n 6)
  fi
  git add data/yelmo.js data/respaldo.js 2>/dev/null

  if git diff --cached --quiet; then
    publicado="sin cambios que publicar"
  else
    if con yelmo; then
      git commit -q -m "Cartelera de Yelmo — $(date '+%Y-%m-%d %H:%M') (móvil)"
    else
      git commit -q -m "Copia de mk2 y Arte Siete — $(date '+%Y-%m-%d %H:%M') (móvil)"
    fi
    # Por si entre medias se ha subido algo: nuestro commit va encima.
    if git pull --rebase --quiet origin "$RAMA_APP" && git push --quiet origin "HEAD:$RAMA_APP"; then
      publicado="publicada"
    else
      publicado="no se pudo publicar"
      error="falló el push a GitHub (¿sin red, o la clave ya no es válida?)"
      # Deshacer el commit local para no arrastrarlo: la vuelta siguiente
      # vuelve a recoger desde cero y lo intenta de nuevo. El abort va
      # primero porque un rebase a medias sobrevive a un reset y dejaría el
      # repositorio en un estado que confunde a la vuelta siguiente.
      git rebase --abort 2>/dev/null
      git reset --hard --quiet "origin/$RAMA_APP"
      # El turno vuelve a quedar pendiente: se reintenta en una hora. (Una
      # copia de respaldo suelta no cuenta como turno: no se toca.)
      con yelmo && rm -f "$BASE/ultima-recogida"
    fi
  fi

  if ! con yelmo; then
    case "$publicado" in
      publicada) resultado="copia de respaldo publicada" ;;
      "no se pudo publicar") resultado="copia de respaldo hecha, pero no se pudo publicar" ;;
      *) resultado="copia de respaldo sin cambios que publicar" ;;
    esac
  elif [ -z "$yelmo_ok" ]; then resultado="fallo al recoger"
  elif [ "$publicado" = "publicada" ]; then resultado="recogida y publicada"
  elif [ "$publicado" = "no se pudo publicar" ]; then resultado="recogida, pero no se pudo publicar"
  else resultado="recogida, sin cambios que publicar"
  fi
  echo "resultado: $resultado"

  # Historial de recogidas para el panel: días y películas por cine, cuánto
  # ha tardado. Es un extra: si falla, la vuelta sigue igual.
  T="$t_recogida" MOTIVO="$motivo" RESULTADO="$resultado" PARTES="$partes" ORDEN="${RECOLECTOR_ORDEN:-}" \
  YELMO="$DIR/data/yelmo.js" RESPALDO="$DIR/data/respaldo.js" LOCAL="$BASE/recogidas.jsonl" \
    timeout 30 node --no-warnings "$DIR/scripts/movil/historiales.mjs" recogida 2>&1 || echo "aviso: no se pudo anotar la recogida en el historial"
fi

# Cuándo será la próxima recogida, para el informe.
ultima_ahora=$(cat "$BASE/ultima-recogida" 2>/dev/null || echo 0)
intento_ahora=$(cat "$BASE/ultimo-intento" 2>/dev/null || echo 0)
if [ "$ultima_ahora" -ge "$turno" ] || [ "$intento_ahora" -lt "$turno" ] \
   || [ $(( intento_ahora + 3600 )) -gt $(( siguiente - CERCA )) ]; then
  proxima=$siguiente
else
  proxima=$(( intento_ahora + 3600 ))
fi

# ── Órdenes desde el repositorio ────────────────────────────────────────────
# Es el acceso a distancia: si en la rama de la web existe data/orden.sh, se
# ejecuta UNA vez (se recuerda por su huella) y la salida va al informe, en
# orden-salida.txt. Funciona como un SSH con el retraso de una vuelta, sin
# abrir ningún puerto del móvil.
#
# No amplía quién puede mandar nada: quien puede subir data/orden.sh ya podía
# cambiar este mismo tarea.sh, que el móvil ejecuta en cada vuelta.
#
# El informe es PÚBLICO. Por eso la salida pasa por un filtro que tapa claves
# privadas y tokens de GitHub, aunque una orden no debería imprimirlos nunca.
if [ -f data/orden.sh ]; then
  huella=$(sha1sum data/orden.sh | cut -c1-12)
  if [ "$huella" != "$(cat "$BASE/orden-hecha" 2>/dev/null)" ]; then
    echo "ejecutando orden $huella"
    inicio=$(date '+%Y-%m-%d %H:%M:%S')
    salida_orden=$(cd "$HOME" && timeout 300 bash "$DIR/data/orden.sh" 2>&1); codigo_orden=$?
    {
      echo "orden:   $huella"
      echo "inicio:  $inicio"
      echo "fin:     $(date '+%Y-%m-%d %H:%M:%S')"
      echo "salida:  código $codigo_orden$([ "$codigo_orden" = 124 ] && echo ' (cortada a los 5 minutos)')"
      echo "────────────────────────────────────────"
      printf '%s\n' "$salida_orden" | head -n 600 \
        | sed -E -e '/-----BEGIN [A-Z ]*PRIVATE KEY-----/,/-----END [A-Z ]*PRIVATE KEY-----/c\[clave privada omitida]' \
                 -e 's/(gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/[token omitido]/g'
    } > "$DIR_ESTADO/orden-salida.txt"
    echo "$huella" > "$BASE/orden-hecha"
  fi
fi

# ── Límite de carga con un enchufe inteligente (opcional) ───────────────────
# El Mi Note 10 Lite (el primer móvil) no trae límite de carga sin root, y un
# móvil enchufado siempre al 100 % acaba con la batería hinchada. Si hay un enchufe WiFi con
# API local (Shelly, Tasmota…), el móvil lo corta al 80 % y lo vuelve a dar al
# 40 %. Se activa creando ~/.recolector/enchufe.conf con dos líneas:
#   ENCENDER=http://192.168.1.50/relay/0?turn=on
#   APAGAR=http://192.168.1.50/relay/0?turn=off
bateria=$(timeout 10 termux-battery-status 2>/dev/null || echo "null")
enchufe=""
if [ -f "$BASE/enchufe.conf" ]; then
  # shellcheck disable=SC1091
  . "$BASE/enchufe.conf"
  pct=$(printf '%s' "$bateria" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).percentage??"")}catch{console.log("")}})')
  if [ -n "$pct" ]; then
    if [ "$pct" -ge 80 ] && [ -n "${APAGAR:-}" ]; then
      curl -fsS -m 10 "$APAGAR" >/dev/null && enchufe="apagado al $pct %" || enchufe="ERROR al apagar ($pct %)"
    elif [ "$pct" -le 40 ] && [ -n "${ENCENDER:-}" ]; then
      curl -fsS -m 10 "$ENCENDER" >/dev/null && enchufe="encendido al $pct %" || enchufe="ERROR al encender ($pct %): ¡revisa el enchufe!"
    else
      enchufe="sin cambios ($pct %)"
    fi
    echo "enchufe: $enchufe"
  fi
fi

# ── Informe ─────────────────────────────────────────────────────────────────
# Lo escribe Node y no un heredoc de bash: los mensajes de error traen comillas
# y saltos de línea que romperían un JSON montado a mano.
#
# El repositorio es público, así que el informe es visible para cualquiera. Por
# eso solo lleva datos técnicos: nada de IP, ubicación ni nada que identifique.
# La batería, además, se anota en un historial local (24 h) para calcular a
# qué ritmo baja cuando está desenchufado: el vigilante de GitHub avisa por la
# previsión, no solo por el porcentaje (ver scripts/movil/bateria.mjs).
RESULTADO="$resultado" ERROR="$error" MOTIVO="$motivo" BATERIA="$bateria" ENCHUFE="$enchufe" \
ORDEN="$(cat "$BASE/orden-hecha" 2>/dev/null)" \
ULTIMA="$ultima_ahora" PROXIMA="$proxima" AHORA="$ahora" \
CODIGO="$codigo" \
MODELO="$(getprop ro.product.model 2>/dev/null | node "$DIR/scripts/movil/ordenes.mjs" filtrar 2>/dev/null)" \
ANDROID="$(getprop ro.build.version.release 2>/dev/null)" \
NODEV="$(node --version 2>/dev/null)" \
HISTORIAL="$BASE/bateria-historial.json" MODULO_BATERIA="$DIR/scripts/movil/bateria.mjs" \
DESTINO="$DIR_ESTADO/estado.json" \
node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const e = process.env;
  let bateria = null;
  try { bateria = JSON.parse(e.BATERIA); } catch {}
  const ultima = Number(e.ULTIMA) || 0;

  let prev = { ritmoPorHora: null, horasHastaReserva: null, desenchufadoDesde: null };
  // Este informe es el latido del móvil: un fallo en la previsión nunca puede
  // impedir que se escriba, o el vigilante creería que el móvil ha muerto.
  try {
    if (bateria && Number.isFinite(bateria.percentage)) {
      const { anotar, prevision } = await import(e.MODULO_BATERIA);
      let historial = [];
      try { historial = JSON.parse(readFileSync(e.HISTORIAL, "utf8")); } catch {}
      historial = anotar(historial, { t: Number(e.AHORA) * 1000, pct: bateria.percentage, cargando: bateria.plugged !== "UNPLUGGED" });
      writeFileSync(e.HISTORIAL, JSON.stringify(historial));
      prev = prevision(historial);
    }
  } catch {}

  const informe = {
    vuelta: new Date().toISOString(),
    resultado: e.RESULTADO,
    motivo: e.MOTIVO || null,
    error: e.ERROR || null,
    ultimaRecogida: ultima ? new Date(ultima * 1000).toISOString() : null,
    proximaRecogida: new Date(Number(e.PROXIMA) * 1000).toISOString(),
    codigo: e.CODIGO,
    ultimaOrden: e.ORDEN || null,
    enchufe: e.ENCHUFE || null,
    dispositivo: { modelo: e.MODELO || null, android: e.ANDROID || null, node: e.NODEV || null },
    bateria: bateria && {
      porcentaje: bateria.percentage,
      cargando: bateria.plugged !== "UNPLUGGED",
      estado: bateria.health,
      temperatura: bateria.temperature,
      ...prev,
    },
  };
  writeFileSync(e.DESTINO, JSON.stringify(informe, null, 2) + "\n");
'

# Las últimas líneas del registro, para poder ver el detalle de un fallo.
# Por el mismo filtro que la salida de las órdenes (IPs, MACs, correos,
# claves y tokens fuera): el informe es público. Si el filtro fallara, mejor
# sin registro que con él sin filtrar.
tail -n 200 "$LOG" | node "$DIR/scripts/movil/ordenes.mjs" filtrar > "$DIR_ESTADO/registro.txt" 2>/dev/null \
  || echo "(registro omitido: no se pudo filtrar)" > "$DIR_ESTADO/registro.txt"

# Historiales para el panel de control (historial.jsonl con una línea por
# vuelta, y copias de recogidas.jsonl y del historial de batería). Van DESPUÉS
# de estado.json y por su cuenta: si fallan, el latido ya está escrito.
ESTADO="$DIR_ESTADO/estado.json" ORDEN="${RECOLECTOR_ORDEN:-}" BASE="$BASE" DESTINO="$DIR_ESTADO" \
  timeout 30 node --no-warnings "$DIR/scripts/movil/historiales.mjs" vuelta || echo "aviso: no se pudieron escribir los historiales"

# Subir el informe (ver publicar.sh: el workflow del vigilante va con él). Si
# la vuelta la ha pedido una orden del panel, no: lo sube ordenes.sh una sola
# vez, con el resultado de la orden ya anotado.
if [ -z "${RECOLECTOR_SIN_PUBLICAR:-}" ]; then
  bash "$DIR/scripts/movil/publicar.sh" </dev/null
fi

# El registro local no puede crecer sin límite en un móvil encendido meses.
if [ "$(wc -l < "$LOG")" -gt 3000 ]; then
  tail -n 1500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
