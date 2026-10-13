#!/data/data/com.termux/files/usr/bin/bash
# Instalación del recolector en el móvil. Se ejecuta UNA SOLA VEZ, en Termux:
#
#   curl -fsSL https://raw.githubusercontent.com/jaimeas98/Movil/claude/puerto-santa-maria-restaurants-NxChu/scripts/movil/instalar.sh | bash
#
# Lo único que pide es escribir un código de 8 letras en github.com/login/device
# (desde cualquier dispositivo con GitHub abierto). Todo lo demás es automático.
#
# QUÉ DEJA MONTADO
#  · Cada 15 minutos el móvil se trae la última versión del código. Si Claude
#    arregla algo y lo sube, en la vuelta siguiente ya se está usando.
#  · Dos veces al día recoge la cartelera de Yelmo (con Chromium) y la publica.
#  · En cada vuelta deja un informe en la rama `estado-movil`, que se puede leer
#    desde cualquier sesión sin tocar el móvil.
#  · Ejecuta las órdenes que se le dejen en data/orden.sh (una sola vez cada una).
#
# Nada entra en el móvil desde fuera: no se abre ningún puerto ni se instala
# ningún servidor SSH. El móvil solo SALE hacia GitHub y hacia Yelmo, y solo
# ejecuta código de este repositorio.
#
# Se puede volver a ejecutar sin miedo: cada paso comprueba si ya está hecho.

# TODO el script va dentro de una función que se llama en la última línea. Con
# `curl | bash`, bash lee el script de la tubería según lo va ejecutando: si
# algún comando leyera de la entrada estándar, se comería el resto del script y
# la instalación se cortaría a medias sin avisar. Así bash lo lee entero antes
# de empezar. Por la misma razón, los comandos llevan </dev/null y las
# preguntas al usuario leen de /dev/tty.
principal() {
  set -euo pipefail

  local REPO="git@github.com:jaimeas98/Movil.git"
  local REPO_SLUG="jaimeas98/Movil"
  local RAMA_APP="claude/puerto-santa-maria-restaurants-NxChu"
  local RAMA_ESTADO="estado-movil"
  local DIR="$HOME/Movil"
  local DIR_ESTADO="$HOME/estado-movil"
  local BASE="$HOME/.recolector"
  local CLAVE="$HOME/.ssh/id_recolector"

  paso() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
  ok()   { printf '   \033[32m✓\033[0m %s\n' "$*"; }

  paso "1/6  Paquetes (tarda unos minutos la primera vez)"
  # force-confnew: si un paquete trae un fichero de configuración nuevo, se
  # acepta sin preguntar. Si preguntara, la instalación se quedaría esperando.
  local OPC="-o Dpkg::Options::=--force-confnew -o Dpkg::Options::=--force-confdef"
  pkg update -y </dev/null
  # upgrade y no solo update: Chromium se compila contra las librerías más
  # nuevas y, con un Termux a medio actualizar, ni arranca ("cannot locate
  # symbol __hash_memory", visto el 13-10-2026).
  pkg upgrade -y $OPC </dev/null
  pkg install -y $OPC git nodejs-lts openssh termux-api util-linux gh x11-repo </dev/null
  # Chromium recoge la cartelera de Yelmo: Cloudflare bloquea a cualquier
  # cliente que no sea un navegador (ver recolector-navegador.mjs).
  pkg install -y $OPC chromium </dev/null
  mkdir -p "$HOME/navegador"
  ( cd "$HOME/navegador" && { [ -f package.json ] || npm init -y >/dev/null; } \
    && npm install --no-audit --no-fund puppeteer-core </dev/null >/dev/null )
  ok "paquetes instalados (incluido Chromium)"

  paso "2/6  Clave del móvil para GitHub"
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  [ -f "$CLAVE" ] || ssh-keygen -q -t ed25519 -N "" -C "recolector-movil" -f "$CLAVE" </dev/null
  cat > "$HOME/.ssh/config" <<'EOF'
Host github.com
  IdentityFile ~/.ssh/id_recolector
  IdentitiesOnly yes
EOF
  grep -q "github.com" "$HOME/.ssh/known_hosts" 2>/dev/null \
    || ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null

  # `ssh -T` a GitHub SIEMPRE sale con código 1, incluso cuando la clave vale
  # (GitHub no da shell). Con pipefail, un `ssh … | grep` fallaría siempre, así
  # que se guarda la salida y se busca el texto aparte.
  clave_aceptada() {
    local r
    r=$(ssh -T -o ConnectTimeout=15 git@github.com </dev/null 2>&1) || true
    printf '%s' "$r" | grep -qi "successfully authenticated"
  }

  if clave_aceptada; then
    ok "GitHub ya acepta la clave de este móvil"
  else
    cat <<'EOF'

   Ahora te va a salir un CÓDIGO de 8 letras (tipo ABCD-1234).

     1. Abre  https://github.com/login/device
        en CUALQUIER dispositivo donde tengas GitHub abierto (tu móvil de
        siempre vale).
     2. Escribe el código y pulsa "Authorize".

   Ese permiso solo se usa un momento: para que el móvil registre su propia
   clave, que SOLO sirve para este repositorio. Justo después se borra.

EOF
    # BROWSER=true evita que intente abrir un navegador en este móvil, que
    # probablemente no tiene la sesión de GitHub iniciada.
    BROWSER=true gh auth login --hostname github.com --git-protocol ssh \
      --skip-ssh-key --web </dev/tty

    gh repo deploy-key add "$CLAVE.pub" --repo "$REPO_SLUG" \
      --allow-write --title "recolector-movil ($(getprop ro.product.model 2>/dev/null || echo móvil))" </dev/null \
      || echo "   (si dice que la clave ya existe, no pasa nada)"

    # El permiso del código da acceso a TODOS tus repositorios. Ya no hace falta:
    # se borra del móvil y se queda solo la clave limitada a este repositorio.
    gh auth logout --hostname github.com </dev/null >/dev/null 2>&1 || true
    # Y por si `gh` hubiera pedido confirmación: en Termux el token se guarda en
    # este fichero en claro, así que se borra a mano.
    rm -f "$HOME/.config/gh/hosts.yml"
    ok "permiso temporal borrado del móvil"

    for _ in $(seq 1 12); do clave_aceptada && break; sleep 5; done
    clave_aceptada || { echo "GitHub aún no acepta la clave. Vuelve a ejecutar el mismo comando."; exit 1; }
    ok "GitHub acepta la clave de este móvil"
  fi

  paso "3/6  Código de la cartelera"
  [ -d "$DIR/.git" ] || git clone --branch "$RAMA_APP" --single-branch "$REPO" "$DIR" </dev/null
  git -C "$DIR" config user.name "Recolector (móvil)"
  git -C "$DIR" config user.email "recolector@movil.invalid"
  ok "código en $DIR"

  paso "4/6  Rama de informes"
  # Rama aparte y sin historia común con la web: aquí solo va el último informe.
  # vercel.json desactiva sus despliegues, así que escribir en ella a menudo no
  # gasta ninguno.
  if [ ! -d "$DIR_ESTADO/.git" ]; then
    if git ls-remote --exit-code --heads "$REPO" "$RAMA_ESTADO" </dev/null >/dev/null 2>&1; then
      git clone --branch "$RAMA_ESTADO" --single-branch "$REPO" "$DIR_ESTADO" </dev/null
    else
      mkdir -p "$DIR_ESTADO"
      git -C "$DIR_ESTADO" init -q
      git -C "$DIR_ESTADO" remote add origin "$REPO"
      git -C "$DIR_ESTADO" checkout -q --orphan "$RAMA_ESTADO"
      printf 'Informes del recolector del móvil. Los escribe scripts/movil/tarea.sh.\n' > "$DIR_ESTADO/LEEME.txt"
      git -C "$DIR_ESTADO" add LEEME.txt
      git -C "$DIR_ESTADO" -c user.name="Recolector (móvil)" -c user.email="recolector@movil.invalid" \
        commit -q -m "Rama de informes del recolector"
      git -C "$DIR_ESTADO" push -q -u origin "$RAMA_ESTADO" </dev/null
    fi
  fi
  git -C "$DIR_ESTADO" config user.name "Recolector (móvil)"
  git -C "$DIR_ESTADO" config user.email "recolector@movil.invalid"
  ok "rama de informes lista"

  paso "5/6  Programar las vueltas"
  mkdir -p "$BASE"
  # El arranque de cada vuelta vive FUERA del repositorio a propósito: ver ciclo.sh.
  cp "$DIR/scripts/movil/ciclo.sh" "$BASE/ciclo.sh"
  chmod +x "$BASE/ciclo.sh"

  # El planificador de Android y no un cron dentro de Termux: si Android cierra
  # Termux, un cron muere con él; una tarea del JobScheduler la vuelve a lanzar
  # el propio sistema, también con la pantalla bloqueada.
  local PROGRAMAR="termux-job-scheduler --job-id 7 --script $BASE/ciclo.sh --period-ms 900000 --persisted true --network any"
  termux-job-scheduler --cancel --job-id 7 </dev/null >/dev/null 2>&1 || true
  $PROGRAMAR </dev/null >/dev/null

  # Red de seguridad al reiniciar el móvil: vuelve a registrar la tarea.
  mkdir -p "$HOME/.termux/boot"
  printf '#!/data/data/com.termux/files/usr/bin/bash\ntermux-wake-lock\n%s\n' "$PROGRAMAR" \
    > "$HOME/.termux/boot/recolector.sh"
  chmod +x "$HOME/.termux/boot/recolector.sh"
  ok "una vuelta cada 15 minutos, también tras reiniciar"

  paso "6/6  Primera vuelta, ahora mismo"
  rm -f "$BASE/ultima-recogida" "$BASE/ultimo-intento"
  bash "$BASE/ciclo.sh" </dev/null || true
  tail -n 12 "$BASE/ciclo.log" 2>/dev/null | sed 's/^/   /'

  cat <<'EOF'

Instalado. A partir de aquí Claude puede revisarlo y cambiarlo todo desde el
repositorio, sin tocar este móvil.

Lo ÚNICO que queda son unos toques en los ajustes de Android, que ningún
programa puede hacer por ti. En un Xiaomi son imprescindibles: si no, MIUI
cierra Termux en cuanto bloqueas la pantalla.

  1. Abre la app Termux:Boot una vez (abrir y cerrar, nada más).

  2. Ajustes → Aplicaciones → Administrar aplicaciones → en Termux,
     Termux:API y Termux:Boot:
       · Inicio automático: ACTIVADO
       · Ahorro de batería: "Sin restricciones"

  3. App Seguridad → Batería → ⚙ (arriba) →
     "Limpiar memoria al bloquear el dispositivo": DESACTIVADO

  4. Recientes → mantén pulsada la tarjeta de Termux → candado.

Cuando acabes, deja el móvil enchufado y bloqueado, y díselo a Claude.
EOF
}

principal "$@"
