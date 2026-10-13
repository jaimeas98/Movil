# Orden 3 — Instalar Chromium en el móvil y probar si un navegador de verdad
# puede leer la cartelera de Yelmo (curl y Node están bloqueados por Cloudflare).
#
# Instalarlo tarda varios minutos y las órdenes se cortan a los 5, así que se
# lanza aparte. Al acabar, fuerza una vuelta para subir el resultado ya, sin
# esperar a la siguiente.

SALIDA="$HOME/estado-movil/navegador.txt"
nohup bash -c '
  termux-wake-lock
  exec > "'"$SALIDA"'" 2>&1
  echo "inicio: $(date "+%Y-%m-%d %H:%M:%S")"
  echo "── instalando Chromium (x11-repo)…"
  pkg install -y -o Dpkg::Options::=--force-confnew x11-repo </dev/null >/dev/null 2>&1
  pkg install -y -o Dpkg::Options::=--force-confnew chromium </dev/null 2>&1 | tail -n 3
  CHROME=$(command -v chromium-browser || command -v chromium)
  echo "binario: ${CHROME:-NO ENCONTRADO}"
  [ -n "$CHROME" ] && "$CHROME" --version 2>&1 | head -1
  echo "── instalando puppeteer-core…"
  mkdir -p "$HOME/navegador" && cd "$HOME/navegador"
  [ -f package.json ] || npm init -y >/dev/null 2>&1
  npm install --no-audit --no-fund puppeteer-core 2>&1 | tail -n 2
  cp "$HOME/Movil/scripts/movil/navegador-prueba.mjs" ./prueba.mjs
  echo "── prueba"
  CHROME="$CHROME" timeout 180 node prueba.mjs 2>&1
  echo "fin: $(date "+%Y-%m-%d %H:%M:%S")"
  termux-wake-unlock
  bash "$HOME/.recolector/ciclo.sh"
' >/dev/null 2>&1 &
echo "instalación de Chromium lanzada en segundo plano; resultado en navegador.txt"
