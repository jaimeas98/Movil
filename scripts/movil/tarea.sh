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
if [ -z "${RECOLECTOR_SIN_BUCLE:-}" ]; then   # RECOLECTOR_SIN_BUCLE: solo para probar.sh
  cmp -s "$DIR/scripts/movil/bucle.sh" "$BASE/bucle.sh" || cp "$DIR/scripts/movil/bucle.sh" "$BASE/bucle.sh"
  if flock -n "$BASE/bucle.candado" true 2>/dev/null; then
    echo "el bucle propio no estaba corriendo: lo arranco"
    nohup bash "$BASE/bucle.sh" </dev/null >/dev/null 2>&1 9>&- &
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
  ( cd "$nav" && DESTINO="$DIR/data/yelmo.js" CHROME="$chrome" timeout 240 node recolector.mjs ) && return 0
  local r=$?
  [ "$r" = 124 ] && echo "❌ cortado a los 4 minutos (¿Yelmo o la red muy lentos?)"
  return "$r"
}

if [ -n "$motivo" ]; then
  echo "recogiendo: $motivo"
  echo "$ahora" > "$BASE/ultimo-intento"
  echo "$huella_rec" > "$BASE/intento-codigo"
  yelmo_ok=""
  if salida=$(recolectar 2>&1); then yelmo_ok=1; fi
  echo "$salida"

  # Copia de mk2 y Arte Siete. Va aparte de Yelmo y nunca hace fallar la
  # vuelta: si no responden, se conserva la copia anterior.
  ( cd "$DIR" && DESTINO=data/respaldo.js timeout 180 node --no-warnings scripts/movil/respaldo-cines.mjs 2>&1 ) || true

  if [ -n "$yelmo_ok" ]; then
    echo "$ahora" > "$BASE/ultima-recogida"
    [ -f data/forzar-recogida ] && git rm -q data/forzar-recogida
  else
    error=$(printf '%s' "$salida" | tail -n 6)
  fi
  git add data/yelmo.js data/respaldo.js 2>/dev/null

  if git diff --cached --quiet; then
    publicado="sin cambios que publicar"
  else
    git commit -q -m "Cartelera de Yelmo — $(date '+%Y-%m-%d %H:%M') (móvil)"
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
      rm -f "$BASE/ultima-recogida"   # el turno vuelve a quedar pendiente: se reintenta en una hora
    fi
  fi

  if [ -z "$yelmo_ok" ]; then resultado="fallo al recoger"
  elif [ "$publicado" = "publicada" ]; then resultado="recogida y publicada"
  elif [ "$publicado" = "no se pudo publicar" ]; then resultado="recogida, pero no se pudo publicar"
  else resultado="recogida, sin cambios que publicar"
  fi
  echo "resultado: $resultado"
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
# La batería, además, se anota en un historial local (24 h) para calcular a
# qué ritmo baja cuando está desenchufado: el vigilante de GitHub avisa por la
# previsión, no solo por el porcentaje (ver scripts/movil/bateria.mjs).
RESULTADO="$resultado" ERROR="$error" MOTIVO="$motivo" BATERIA="$bateria" ENCHUFE="$enchufe" \
ORDEN="$(cat "$BASE/orden-hecha" 2>/dev/null)" \
ULTIMA="$ultima_ahora" PROXIMA="$proxima" AHORA="$ahora" \
CODIGO="$codigo" \
MODELO="$(getprop ro.product.model 2>/dev/null)" \
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
tail -n 200 "$LOG" > "$DIR_ESTADO/registro.txt"

# El vigilante de GitHub se dispara con cada informe, y para eso su workflow
# tiene que estar también en esta rama (GitHub usa el de la rama empujada).
mkdir -p "$DIR_ESTADO/.github/workflows"
cp "$DIR/.github/workflows/vigilante-movil.yml" "$DIR_ESTADO/.github/workflows/" 2>/dev/null || true

# La rama de informes guarda solo el ÚLTIMO: se reescribe siempre el mismo
# commit en vez de acumular 48 al día que no le interesan a nadie.
git -C "$DIR_ESTADO" add -A
git -C "$DIR_ESTADO" commit -q --amend -m "Informe del recolector — $(date '+%Y-%m-%d %H:%M')"
if ! git -C "$DIR_ESTADO" push -q --force origin "$RAMA_ESTADO"; then
  # Si GitHub no deja a esta clave subir ficheros de workflow, el informe
  # (el latido) tiene que llegar igual: se reintenta sin el workflow.
  git -C "$DIR_ESTADO" rm -rq --cached .github 2>/dev/null && rm -rf "$DIR_ESTADO/.github" \
    && git -C "$DIR_ESTADO" commit -q --amend -m "Informe del recolector — $(date '+%Y-%m-%d %H:%M')" \
    && git -C "$DIR_ESTADO" push -q --force origin "$RAMA_ESTADO" \
    && echo "aviso: informe subido sin el workflow del vigilante" \
    || echo "aviso: no se pudo subir el informe"
fi

# El registro local no puede crecer sin límite en un móvil encendido meses.
if [ "$(wc -l < "$LOG")" -gt 3000 ]; then
  tail -n 1500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
