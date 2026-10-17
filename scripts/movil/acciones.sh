#!/data/data/com.termux/files/usr/bin/bash
# Las acciones que el panel de control puede pedirle al móvil. LISTA CERRADA.
#
#   bash acciones.sh <accion>
#
# Lo lanza ordenes.sh, con el candado de las vueltas ya tomado (nunca corre a
# la vez que una vuelta o una recogida). Cualquier cosa que no esté en el
# `case` de abajo se rechaza: aunque alguien consiguiera la clave del panel,
# solo podría pedir estas cosas, nunca ejecutar un comando suyo en el móvil.
# El nombre de la acción no se usa para nada más que para elegir la rama del
# `case`: ni se evalúa ni se pasa a otro comando.
#
# La misma lista está en lib/panel/ordenes.js y scripts/movil/ordenes.mjs.
#
# Todo lo que se imprime acaba en el informe PÚBLICO (ordenes-resultado.json),
# después de pasar por el filtro de ordenes.mjs. Aun así, aquí no se imprime
# nada que identifique: ni IPs, ni MACs, ni nombres de WiFi, ni números de
# serie.

set -u
DIR="$HOME/Movil"
BASE="$HOME/.recolector"

# Una vuelta de tarea.sh hecha a medida. No publica: lo hace ordenes.sh una
# sola vez, con el resultado de la orden ya anotado.
vuelta() {
  RECOLECTOR_PEDIDA="$1" RECOLECTOR_SIN_PUBLICAR=1 bash "$DIR/scripts/movil/tarea.sh" </dev/null
}

probar_yelmo() {
  local nav="$HOME/navegador" chrome
  chrome=$(command -v chromium-browser || command -v chromium) || { echo "❌ Chromium no está instalado"; return 1; }
  [ -d "$nav/node_modules/puppeteer-core" ] || { echo "❌ falta puppeteer-core en ~/navegador"; return 1; }
  cp "$DIR/scripts/movil/recolector-navegador.mjs" "$nav/recolector.mjs"
  ( cd "$nav" && CHROME="$chrome" timeout 240 node recolector.mjs --solo-probar </dev/null )
}

bucle_vivo() { ! flock -n "$BASE/bucle.candado" true 2>/dev/null; }

diagnostico() {
  echo "── versiones"
  echo "node:       $(node --version 2>/dev/null || echo 'no está')"
  echo "chromium:   $( (chromium-browser --version || chromium --version) 2>/dev/null | head -n1 || echo 'no está')"
  echo "puppeteer:  $(node -p 'require(process.argv[1]).version' "$HOME/navegador/node_modules/puppeteer-core/package.json" 2>/dev/null || echo 'no está')"
  echo "git:        $(git --version 2>/dev/null)"
  echo "android:    $(getprop ro.build.version.release 2>/dev/null) · $(getprop ro.product.model 2>/dev/null)"
  echo "encendido:  $(uptime 2>/dev/null | sed -E 's/.*up +//; s/, +[0-9]+ users?.*//; s/, +load.*//')"
  echo
  echo "── disco y memoria"
  df -h "$HOME" 2>/dev/null | awk 'NR==2 {print "disco:      " $4 " libres de " $2 " (" $5 " usado)"}'
  awk '/^MemTotal|^MemAvailable/ {printf "%-11s %d MB\n", ($1=="MemTotal:" ? "memoria:" : "disponible:"), $2/1024}' /proc/meminfo 2>/dev/null
  echo "copias:     $(du -sh "$DIR/data" 2>/dev/null | cut -f1) en data/, registro $(wc -l < "$BASE/ciclo.log" 2>/dev/null) líneas"
  echo
  echo "── código"
  echo "rama:       $(git -C "$DIR" rev-parse --abbrev-ref HEAD 2>/dev/null) en $(git -C "$DIR" rev-parse --short HEAD 2>/dev/null)"
  echo "cambios:    $(git -C "$DIR" status --porcelain 2>/dev/null | wc -l) ficheros sin subir"
  echo "informes:   $(git -C "$HOME/estado-movil" log -1 --format='%cd' --date=format:'%Y-%m-%d %H:%M' 2>/dev/null)"
  echo
  echo "── bucle y vueltas"
  if bucle_vivo; then echo "bucle:      vivo (pid $(cat "$BASE/bucle.pid" 2>/dev/null || echo '?'))"; else echo "bucle:      NO está corriendo"; fi
  # (pgrep -c y grep -c ya escriben 0 cuando no hay nada; sin «|| echo».)
  echo "procesos:   $(pgrep -fc "$BASE/bucle.sh" 2>/dev/null) bucles"
  echo "wake lock:  se pide en cada vuelta (termux-wake-lock); Android no deja consultarlo"
  echo "planific.:  $(termux-job-scheduler --pending 2>/dev/null | grep -c 'Job') tareas pendientes"
  echo "última:     recogida $(date -d "@$(cat "$BASE/ultima-recogida" 2>/dev/null || echo 0)" '+%Y-%m-%d %H:%M' 2>/dev/null), intento $(date -d "@$(cat "$BASE/ultimo-intento" 2>/dev/null || echo 0)" '+%Y-%m-%d %H:%M' 2>/dev/null)"
  echo
  echo "── batería"
  timeout 10 termux-battery-status 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { const b = JSON.parse(s); console.log(`batería:    ${b.percentage} %, ${b.plugged}, ${b.health}, ${b.temperature} °C`); }
      catch { console.log("batería:    sin datos"); }
    });'
  echo
  echo "── red (solo si llega, sin direcciones)"
  local t0
  t0=$(date +%s%N)
  if timeout 20 git -C "$DIR" ls-remote -q origin HEAD >/dev/null 2>&1; then
    echo "github:     responde ($(( ($(date +%s%N) - t0) / 1000000 )) ms)"
  else
    echo "github:     NO responde"
  fi
  if curl -fsS -o /dev/null -m 15 -w '' https://www.yelmocines.es/ 2>/dev/null; then echo "yelmo:      responde"; else echo "yelmo:      no responde o bloquea (normal sin navegador)"; fi
}

reiniciar_bucle() {
  local pid
  pid=$(cat "$BASE/bucle.pid" 2>/dev/null)
  [ -n "$pid" ] && kill "$pid" 2>/dev/null
  pkill -f "$BASE/bucle.sh" 2>/dev/null
  sleep 1
  # Sin los candados (8 del bucle, 9 de las vueltas): si el bucle nuevo se
  # quedara con el de las vueltas, ninguna vuelta podría volver a empezar.
  nohup bash "$BASE/bucle.sh" </dev/null >/dev/null 2>&1 8>&- 9>&- &
  sleep 3
  if bucle_vivo; then echo "bucle reiniciado (pid $(cat "$BASE/bucle.pid" 2>/dev/null || echo '?'))"; else echo "❌ el bucle no ha vuelto a arrancar"; return 1; fi
}

actualizar_paquetes() {
  local OPC="-o Dpkg::Options::=--force-confnew -o Dpkg::Options::=--force-confdef"
  echo "pkg update…"
  pkg update -y </dev/null 2>&1 | tail -n 5
  echo "pkg upgrade…"
  # shellcheck disable=SC2086
  pkg upgrade -y $OPC </dev/null 2>&1 | tail -n 25
  local r=${PIPESTATUS[0]}
  echo "chromium:   $( (chromium-browser --version || chromium --version) 2>/dev/null | head -n1)"
  echo "node:       $(node --version 2>/dev/null)"
  return "$r"
}

case "${1:-}" in
  informe)             vuelta informe ;;
  recoger)             vuelta recoger ;;
  recoger-yelmo)       vuelta yelmo ;;
  respaldo)            vuelta respaldo ;;
  probar-yelmo)        probar_yelmo ;;
  diagnostico)         diagnostico ;;
  reiniciar-bucle)     reiniciar_bucle ;;
  actualizar-paquetes) actualizar_paquetes ;;
  *) echo "acción no permitida: solo valen informe, recoger, recoger-yelmo, respaldo, probar-yelmo, diagnostico, reiniciar-bucle, actualizar-paquetes"; exit 2 ;;
esac
