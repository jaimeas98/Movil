#!/data/data/com.termux/files/usr/bin/bash
# Una vuelta del recolector en el móvil. La lanza ciclo.sh cada 15 minutos,
# SIEMPRE con la versión más reciente de este fichero: cualquier cambio que se
# suba al repositorio se aplica solo en la vuelta siguiente.
#
# En cada vuelta:
#  1. decide si toca recoger la cartelera (cada 11 h, o si se ha pedido);
#  2. si toca, la recoge y la publica en la rama de la web;
#  3. pase lo que pase, deja un informe en la rama `estado-movil`.
#
# El informe es el latido del móvil: si su fecha deja de avanzar, el móvil se
# ha apagado o Android ha cerrado Termux, y se sabe sin tener que mirarlo.
#
# PEDIR UNA RECOGIDA DESDE FUERA: basta con crear data/forzar-recogida en la
# rama de la web. La vuelta siguiente recoge y borra el fichero.

set -u

DIR="$HOME/Movil"
DIR_ESTADO="$HOME/estado-movil"
BASE="$HOME/.recolector"
RAMA_APP="claude/puerto-santa-maria-restaurants-NxChu"
RAMA_ESTADO="estado-movil"
LOG="$BASE/ciclo.log"
CADA_HORAS=11

# Mantener la CPU despierta mientras dura la vuelta. Con el móvil cargando no
# debería dormirse, pero una recogida a medias deja la instantánea sin publicar.
termux-wake-lock 2>/dev/null
trap 'termux-wake-unlock 2>/dev/null' EXIT

cd "$DIR" || exit 1

# La versión con la que ARRANCA la vuelta, antes de que un commit de datos la
# mueva: es la que dice si un arreglo subido al repositorio ya ha llegado.
codigo=$(git rev-parse --short HEAD)

ahora=$(date +%s)
ultima=$(cat "$BASE/ultima-recogida" 2>/dev/null || echo 0)   # último ÉXITO
intento=$(cat "$BASE/ultimo-intento" 2>/dev/null || echo 0)   # último intento, saliera como saliera
desde_intento=$(( ahora - intento ))

# Espera tras un fallo. Si Yelmo bloquea también a este móvil, reintentar cada
# media hora sería insistir contra un bloqueo, que es lo que lo endurece.
# Así se reintenta cada hora por calendario y cada dos si la pidieron a mano.
motivo=""
if [ -f data/forzar-recogida ] && [ "$desde_intento" -ge 7200 ]; then
  motivo="pedida desde el repositorio"
elif [ $(( ahora - ultima )) -ge $(( CADA_HORAS * 3600 )) ] && [ "$desde_intento" -ge 3600 ]; then
  motivo="toca (cada ${CADA_HORAS} h)"
fi

resultado="sin recogida: no tocaba"
error=""

if [ -n "$motivo" ]; then
  echo "recogiendo: $motivo"
  echo "$ahora" > "$BASE/ultimo-intento"
  if salida=$(node scripts/recolector-yelmo.mjs 2>&1); then
    echo "$salida"
    echo "$ahora" > "$BASE/ultima-recogida"

    [ -f data/forzar-recogida ] && git rm -q data/forzar-recogida
    git add data/yelmo.js

    if git diff --cached --quiet; then
      resultado="recogida, sin cambios que publicar"
    else
      git commit -q -m "Cartelera de Yelmo — $(date '+%Y-%m-%d %H:%M') (móvil)"
      # Por si entre medias se ha subido algo: nuestro commit va encima.
      if git pull --rebase --quiet origin "$RAMA_APP" && git push --quiet origin "HEAD:$RAMA_APP"; then
        resultado="recogida y publicada"
      else
        resultado="recogida, pero no se pudo publicar"
        error="falló el push a GitHub (¿sin red, o la clave ya no es válida?)"
        # Deshacer el commit local para no arrastrarlo: la vuelta siguiente
        # vuelve a recoger desde cero y lo intenta de nuevo. El abort va
        # primero porque un rebase a medias sobrevive a un reset y dejaría el
        # repositorio en un estado que confunde a la vuelta siguiente.
        git rebase --abort 2>/dev/null
        git reset --hard --quiet "origin/$RAMA_APP"
        rm -f "$BASE/ultima-recogida"   # vuelve a tocar, pero respetando la espera de una hora
      fi
    fi
  else
    echo "$salida"
    resultado="fallo al recoger"
    error=$(printf '%s' "$salida" | tail -n 6)
  fi
  echo "resultado: $resultado"
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
# privadas, aunque una orden no debería imprimirlas nunca.
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
        | sed -E '/-----BEGIN [A-Z ]*PRIVATE KEY-----/,/-----END [A-Z ]*PRIVATE KEY-----/c\[clave privada omitida]'
    } > "$DIR_ESTADO/orden-salida.txt"
    echo "$huella" > "$BASE/orden-hecha"
  fi
fi

# ── Límite de carga con un enchufe inteligente (opcional) ───────────────────
# El Mi Note 10 Lite no trae límite de carga sin root, y un móvil enchufado
# siempre al 100 % acaba con la batería hinchada. Si hay un enchufe WiFi con
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
ultima_ahora=$(cat "$BASE/ultima-recogida" 2>/dev/null || echo 0)

RESULTADO="$resultado" ERROR="$error" MOTIVO="$motivo" BATERIA="$bateria" ENCHUFE="$enchufe" \
ORDEN="$(cat "$BASE/orden-hecha" 2>/dev/null)" \
ULTIMA="$ultima_ahora" CADA="$CADA_HORAS" \
CODIGO="$codigo" \
MODELO="$(getprop ro.product.model 2>/dev/null)" \
ANDROID="$(getprop ro.build.version.release 2>/dev/null)" \
NODEV="$(node --version 2>/dev/null)" \
DESTINO="$DIR_ESTADO/estado.json" \
node -e '
  const e = process.env;
  let bateria = null;
  try { bateria = JSON.parse(e.BATERIA); } catch {}
  const ultima = Number(e.ULTIMA) || 0;
  const informe = {
    vuelta: new Date().toISOString(),
    resultado: e.RESULTADO,
    motivo: e.MOTIVO || null,
    error: e.ERROR || null,
    ultimaRecogida: ultima ? new Date(ultima * 1000).toISOString() : null,
    proximaRecogida: ultima ? new Date((ultima + Number(e.CADA) * 3600) * 1000).toISOString() : "en la próxima vuelta",
    codigo: e.CODIGO,
    ultimaOrden: e.ORDEN || null,
    enchufe: e.ENCHUFE || null,
    dispositivo: { modelo: e.MODELO || null, android: e.ANDROID || null, node: e.NODEV || null },
    bateria: bateria && {
      porcentaje: bateria.percentage,
      cargando: bateria.plugged !== "UNPLUGGED",
      estado: bateria.health,
      temperatura: bateria.temperature,
    },
  };
  require("fs").writeFileSync(e.DESTINO, JSON.stringify(informe, null, 2) + "\n");
'

# Las últimas líneas del registro, para poder ver el detalle de un fallo.
tail -n 200 "$LOG" > "$DIR_ESTADO/registro.txt"

# La rama de informes guarda solo el ÚLTIMO: se reescribe siempre el mismo
# commit en vez de acumular 48 al día que no le interesan a nadie.
git -C "$DIR_ESTADO" add -A
git -C "$DIR_ESTADO" commit -q --amend -m "Informe del recolector — $(date '+%Y-%m-%d %H:%M')" \
  && git -C "$DIR_ESTADO" push -q --force origin "$RAMA_ESTADO" \
  || echo "aviso: no se pudo subir el informe"

# El registro local no puede crecer sin límite en un móvil encendido meses.
if [ "$(wc -l < "$LOG")" -gt 3000 ]; then
  tail -n 1500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
