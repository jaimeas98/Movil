# Orden 4 — Arreglar Chromium y repetir la prueba.
#
# La orden 3 instaló Chromium pero no arrancaba: "cannot locate symbol
# __hash_memory". Chromium está compilado contra un libc++ más nuevo que el
# del móvil, porque la instalación solo actualizó el índice de paquetes, no
# los paquetes. Se actualiza todo Termux, se termina la configuración que dpkg
# dejó a medias y se reinstala Chromium.

SALIDA="$HOME/estado-movil/navegador.txt"
nohup bash -c '
  termux-wake-lock
  exec > "'"$SALIDA"'" 2>&1
  echo "inicio: $(date "+%Y-%m-%d %H:%M:%S")"
  OPC="-o Dpkg::Options::=--force-confnew -o Dpkg::Options::=--force-confdef"
  echo "── terminar configuración pendiente"
  dpkg --configure -a </dev/null 2>&1 | tail -n 2
  echo "── actualizar todo Termux (tarda)…"
  pkg update -y </dev/null >/dev/null 2>&1
  pkg upgrade -y $OPC </dev/null 2>&1 | tail -n 3
  echo "── reinstalar Chromium"
  pkg install -y --reinstall $OPC libc++ chromium </dev/null 2>&1 | tail -n 3
  CHROME=$(command -v chromium-browser || command -v chromium)
  echo "binario: ${CHROME:-NO ENCONTRADO}"
  "$CHROME" --version 2>&1 | head -2
  echo "── prueba"
  cd "$HOME/navegador" && cp "$HOME/Movil/scripts/movil/navegador-prueba.mjs" ./prueba.mjs
  CHROME="$CHROME" timeout 180 node prueba.mjs 2>&1
  echo "fin: $(date "+%Y-%m-%d %H:%M:%S")"
  termux-wake-unlock
  bash "$HOME/.recolector/ciclo.sh"
' >/dev/null 2>&1 &
echo "actualización y reinstalación de Chromium lanzadas en segundo plano; resultado en navegador.txt"
