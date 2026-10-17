#!/data/data/com.termux/files/usr/bin/bash
# Instalación del recolector en un móvil Android con Termux: el primero, o uno
# nuevo que sustituye a otro que se ha roto (docs/movil/RECUPERACION.md).
#
#   curl -fsSL https://raw.githubusercontent.com/jaimeas98/Movil/claude/puerto-santa-maria-restaurants-NxChu/scripts/movil/instalar.sh | bash
#
# Lo único que pide es escribir un código de 8 letras en github.com/login/device
# (desde cualquier dispositivo con GitHub abierto). Todo lo demás es automático,
# salvo unos ajustes de Android que ningún programa puede tocar: los dice al
# final, según la marca del móvil.
#
# QUÉ DEJA MONTADO
#  · Un bucle propio (bucle.sh) que da una vuelta cada 15 minutos y, entre
#    vuelta y vuelta, mira cada minuto las órdenes del panel. El planificador
#    de Android y Termux:Boot lo vuelven a arrancar si muere o si el móvil se
#    reinicia.
#  · En cada vuelta el móvil se trae la última versión del código: si Claude
#    arregla algo y lo sube, en la vuelta siguiente ya se está usando.
#  · Dos veces al día recoge la cartelera de Yelmo (con Chromium) y hace copia
#    de mk2 y Arte Siete, y lo publica en la rama de la web.
#  · En cada vuelta deja un informe en la rama `estado-movil` (el latido), que
#    leen el panel y el vigilante de GitHub.
#  · Ejecuta la orden de data/orden.sh (una sola vez cada una) y las del panel
#    de control (rama ordenes-movil, solo las acciones de acciones.sh).
#
# SI SUSTITUYE A OTRO MÓVIL
# No hace falta nada del anterior: todo lo que importa está en GitHub.
#  · Las ramas que ya existen (estado-movil, ordenes-movil) se usan tal cual:
#    se clonan, no se crean de nuevo. El historial de vueltas y recogidas que
#    enseña el panel sigue donde estaba.
#  · La clave del móvil anterior se BORRA de GitHub en el mismo paso en que se
#    registra la nueva: si aquel móvil apareciera (o lo tuviera otra persona),
#    ya no podría escribir en el repositorio.
#  · Las órdenes que ya había (las del panel y data/orden.sh) se dan por
#    vistas: no se repite nada de lo que se le pidió al móvil anterior.
#  · La primera vuelta recoge Yelmo sí o sí: no hereda esperas ni límites.
#
# Nada entra en el móvil desde fuera: no se abre ningún puerto ni se instala
# ningún servidor SSH. El móvil solo SALE hacia GitHub y hacia los cines, y
# solo ejecuta código de este repositorio.
#
# Se puede volver a ejecutar sin miedo: cada paso comprueba si ya está hecho.
#
# ENSAYO: scripts/movil/ensayo-recuperacion.sh lo ejecuta entero en un Termux
# falso. Para eso, y solo si las pone el ensayo, hay dos variables: ENSAYO_REPO
# (el "GitHub" local) y ENSAYO_TTY (de dónde se lee lo que se teclea). En el
# móvil no existen y todo va como siempre.

# TODO el script va dentro de una función que se llama en la última línea. Con
# `curl | bash`, bash lee el script de la tubería según lo va ejecutando: si
# algún comando leyera de la entrada estándar, se comería el resto del script y
# la instalación se cortaría a medias sin avisar. Así bash lo lee entero antes
# de empezar. Por la misma razón, los comandos llevan </dev/null y las
# preguntas al usuario leen de /dev/tty.
principal() {
  set -euo pipefail

  local REPO="${ENSAYO_REPO:-git@github.com:jaimeas98/Movil.git}"
  local TTY="${ENSAYO_TTY:-/dev/tty}"
  local REPO_SLUG="jaimeas98/Movil"
  local RAMA_APP="claude/puerto-santa-maria-restaurants-NxChu"
  local RAMA_ESTADO="estado-movil"
  local RAMA_ORDENES="ordenes-movil"
  local DIR="$HOME/Movil"
  local DIR_ESTADO="$HOME/estado-movil"
  local BASE="$HOME/.recolector"
  local CLAVE="$HOME/.ssh/id_recolector"
  # Todas las claves de móviles recolectores se llaman así ("recolector-movil
  # (modelo, fecha)"): es como se reconocen las de un móvil anterior.
  local TITULO_CLAVE="recolector-movil"

  paso()  { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
  ok()    { printf '   \033[32m✓\033[0m %s\n' "$*"; }
  aviso() { printf '   \033[31m!\033[0m %s\n' "$*"; }

  # Lo que se le pregunta a Android: modelo, marca y versión. Nada de números
  # de serie: el modelo acaba en el título de la clave y en informes públicos.
  local MODELO MARCA ANDROID
  MODELO=$(getprop ro.product.model 2>/dev/null | tr -cd 'A-Za-z0-9 ._+()-' | cut -c1-40 || true)
  MARCA=$(getprop ro.product.manufacturer 2>/dev/null | tr '[:upper:]' '[:lower:]' || true)
  ANDROID=$(getprop ro.build.version.release 2>/dev/null || true)
  printf '\nMóvil: %s · Android %s\n' "${MODELO:-desconocido}" "${ANDROID:-?}"

  paso "1/7  Paquetes (tarda unos minutos la primera vez)"
  # force-confnew: si un paquete trae un fichero de configuración nuevo, se
  # acepta sin preguntar. Si preguntara, la instalación se quedaría esperando.
  local OPC="-o Dpkg::Options::=--force-confnew -o Dpkg::Options::=--force-confdef"
  pkg update -y </dev/null
  # upgrade y no solo update: Chromium se compila contra las librerías más
  # nuevas y, con un Termux a medio actualizar, ni arranca ("cannot locate
  # symbol __hash_memory", visto el 13-10-2026).
  pkg upgrade -y $OPC </dev/null
  # procps (pgrep) y util-linux (flock) los usan el bucle y las vueltas.
  pkg install -y $OPC git nodejs-lts openssh termux-api util-linux procps gh x11-repo </dev/null
  # x11-repo añade un repositorio de paquetes: hay que leer su índice antes de
  # pedirle Chromium, o en un Termux recién instalado "no existe".
  pkg update -y </dev/null
  # Chromium recoge la cartelera de Yelmo: Cloudflare bloquea a cualquier
  # cliente que no sea un navegador (ver recolector-navegador.mjs).
  if ! pkg install -y $OPC chromium </dev/null; then
    aviso "No se ha podido instalar Chromium. Suele ser la red: vuelve a ejecutar el mismo comando."
    aviso "(Chromium para Termux necesita un móvil de 64 bits: este es $(uname -m).)"
    exit 1
  fi
  mkdir -p "$HOME/navegador"
  ( cd "$HOME/navegador" && { [ -f package.json ] || npm init -y >/dev/null; } \
    && npm install --no-audit --no-fund puppeteer-core </dev/null >/dev/null )
  ok "paquetes instalados (incluido Chromium)"

  # Sin la app Termux:API, termux-battery-status y termux-job-scheduler se
  # quedan colgados para siempre: mejor saberlo ahora que con el bucle parado.
  if timeout 20 termux-battery-status </dev/null >/dev/null 2>&1; then
    ok "la app Termux:API responde"
  else
    cat <<'EOF'

   Falta la app Termux:API, o no es de la misma tienda que Termux.
   Instálala desde F-Droid (la misma de donde sacaste Termux), ábrela una vez
   y vuelve a ejecutar el mismo comando: lo hecho no se repite.
EOF
    exit 1
  fi

  paso "2/7  Clave del móvil para GitHub"
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  [ -f "$CLAVE" ] || ssh-keygen -q -t ed25519 -N "" -C "$TITULO_CLAVE" -f "$CLAVE" </dev/null
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

  # El permiso del código da acceso a TODOS los repositorios de Jaime: en
  # cuanto la clave nueva está puesta (y la vieja quitada), se borra. En Termux
  # el token se guarda en claro en hosts.yml, así que también se borra a mano.
  borrar_permiso() {
    gh auth logout --hostname github.com </dev/null >/dev/null 2>&1 || true
    rm -f "$HOME/.config/gh/hosts.yml"
  }

  # Quita de GitHub las claves de móviles recolectores anteriores: todas las
  # que se llaman como las nuestras y no son la de este móvil. Un móvil roto,
  # perdido o vendido se queda así sin poder escribir en el repositorio. Las
  # claves con otro nombre no se tocan.
  retirar_claves_viejas() {
    local mia lista id titulo clave quitadas=0
    mia=$(cut -d' ' -f1,2 "$CLAVE.pub")
    if ! lista=$(gh api "repos/$REPO_SLUG/keys" --paginate --jq '.[] | [.id, .title, .key] | @tsv' </dev/null); then
      aviso "no se ha podido ver qué claves hay en GitHub: mira en github.com/$REPO_SLUG/settings/keys"
      aviso "y borra las «$TITULO_CLAVE (…)» que no sean la de hoy."
      return 0
    fi
    while IFS=$'\t' read -r id titulo clave; do
      [ -n "$id" ] || continue
      case "$titulo" in "$TITULO_CLAVE"*) ;; *) continue ;; esac
      [ "$clave" = "$mia" ] && continue
      if gh api -X DELETE "repos/$REPO_SLUG/keys/$id" </dev/null >/dev/null; then
        ok "quitada de GitHub la clave del móvil anterior: $titulo"
        quitadas=$((quitadas + 1))
      else
        aviso "no se ha podido quitar «$titulo»: bórrala a mano en github.com/$REPO_SLUG/settings/keys"
      fi
    done <<< "$lista"
    [ "$quitadas" -gt 0 ] || ok "no había claves de otros móviles"
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

   Si aquí abajo pone "Press Enter", pulsa Intro (no se abre nada).

   Ese permiso solo se usa un momento: para que este móvil registre su propia
   clave, que SOLO sirve para este repositorio, y para quitar la del móvil
   anterior. Justo después se borra.

EOF
    # Pase lo que pase a partir de aquí, también si algo falla a medias, el
    # permiso no se queda en el móvil.
    trap borrar_permiso EXIT
    # BROWSER=true evita que intente abrir un navegador en este móvil, que
    # probablemente no tiene la sesión de GitHub iniciada.
    BROWSER=true gh auth login --hostname github.com --git-protocol ssh \
      --skip-ssh-key --web <"$TTY"

    gh repo deploy-key add "$CLAVE.pub" --repo "$REPO_SLUG" --allow-write \
      --title "$TITULO_CLAVE (${MODELO:-móvil}, $(date +%Y-%m-%d))" </dev/null \
      || echo "   (si dice que la clave ya existe, no pasa nada)"
    retirar_claves_viejas

    borrar_permiso
    trap - EXIT
    ok "permiso temporal borrado del móvil"

    for _ in $(seq 1 12); do clave_aceptada && break; sleep 5; done
    clave_aceptada || { echo "GitHub aún no acepta la clave. Vuelve a ejecutar el mismo comando."; exit 1; }
    ok "GitHub acepta la clave de este móvil"
  fi

  paso "3/7  Código de la cartelera"
  [ -d "$DIR/.git" ] || git clone --branch "$RAMA_APP" --single-branch "$REPO" "$DIR" </dev/null
  git -C "$DIR" config user.name "Recolector (móvil)"
  git -C "$DIR" config user.email "recolector@movil.invalid"
  ok "código en $DIR"

  paso "4/7  Rama de informes"
  # Rama aparte y sin historia común con la web: aquí solo va el último informe.
  # vercel.json desactiva sus despliegues, así que escribir en ella a menudo no
  # gasta ninguno. Si ya existe (lo normal al cambiar de móvil) se clona: lleva
  # el historial que enseña el panel y los resultados de las órdenes.
  if [ ! -d "$DIR_ESTADO/.git" ]; then
    if git ls-remote --exit-code --heads "$REPO" "$RAMA_ESTADO" </dev/null >/dev/null 2>&1; then
      git clone -q --branch "$RAMA_ESTADO" --single-branch "$REPO" "$DIR_ESTADO" </dev/null
      ok "rama de informes clonada (ya existía)"
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
      ok "rama de informes creada"
    fi
  fi
  git -C "$DIR_ESTADO" config user.name "Recolector (móvil)"
  git -C "$DIR_ESTADO" config user.email "recolector@movil.invalid"

  paso "5/7  Lo que dejó el móvil anterior"
  mkdir -p "$BASE"
  # Los historiales "de verdad" viven en ~/.recolector y a la rama va una copia
  # (ver historiales.mjs). En un móvil nuevo se recuperan de esa copia: si no,
  # la primera vuelta publicaría un historial vacío encima de 7 días de datos.
  # El de batería NO: es de otra batería, y mezclarlo daría un ritmo de
  # descarga falso (y avisos falsos del vigilante). Son solo 24 h.
  local f
  for f in historial.jsonl recogidas.jsonl; do
    if [ ! -f "$BASE/$f" ] && [ -f "$DIR_ESTADO/$f" ]; then
      cp "$DIR_ESTADO/$f" "$BASE/$f"
      ok "$f recuperado ($(wc -l < "$BASE/$f" | tr -d ' ') líneas)"
    fi
  done

  # La orden de data/orden.sh que haya ahora ya la ejecutó el móvil anterior:
  # se da por hecha. Una orden NUEVA (otro contenido) sí se ejecutará.
  if [ -f "$DIR/data/orden.sh" ] && [ ! -f "$BASE/orden-hecha" ]; then
    sha1sum "$DIR/data/orden.sh" | cut -c1-12 > "$BASE/orden-hecha"
    ok "data/orden.sh del móvil anterior dada por hecha"
  fi

  # Las órdenes del panel que ya hay: ninguna se repite aquí (ver heredar() en
  # ordenes.mjs). Solo la primera vez: ordenes-hechas existe desde entonces.
  if [ ! -f "$BASE/ordenes-hechas" ]; then
    local hay=0
    git ls-remote --exit-code --heads "$REPO" "$RAMA_ORDENES" </dev/null >/dev/null 2>&1 || hay=$?
    if [ "$hay" = 0 ]; then
      git -C "$DIR" fetch -q origin "+refs/heads/$RAMA_ORDENES:refs/remotes/origin/$RAMA_ORDENES" </dev/null
      local ordenes_json
      ordenes_json=$(git -C "$DIR" show "origin/$RAMA_ORDENES:ordenes.json" 2>/dev/null || true)
      printf '%s' "$ordenes_json" \
        | node "$DIR/scripts/movil/ordenes.mjs" heredar "$BASE/ordenes-hechas" "$DIR_ESTADO/ordenes-resultado.json" \
        | sed 's/^/   ✓ /'
    elif [ "$hay" = 2 ]; then
      : > "$BASE/ordenes-hechas"
      ok "el panel aún no ha mandado ninguna orden"
    else
      aviso "no se ha podido mirar la rama de órdenes (¿sin red?). Vuelve a ejecutar el mismo comando."
      exit 1
    fi
  fi

  # Que la primera vuelta recoja YA: sin la espera de un fallo anterior ni la
  # huella de su intento (lo que tarea.sh usa para no insistir).
  rm -f "$BASE/ultima-recogida" "$BASE/ultimo-intento" "$BASE/intento-codigo" "$BASE/bloqueado"

  paso "6/7  Programar las vueltas"
  # El arranque de cada vuelta, el bucle y las órdenes viven FUERA del
  # repositorio a propósito: ver ciclo.sh. (bucle.sh y ordenes.sh los mantiene
  # al día tarea.sh en cada vuelta; ciclo.sh, solo esto.)
  for f in ciclo.sh bucle.sh ordenes.sh; do
    cp "$DIR/scripts/movil/$f" "$BASE/$f"
  done
  chmod +x "$BASE/ciclo.sh"

  # El planificador de Android, como red de seguridad: si Android cierra Termux,
  # una tarea del JobScheduler la vuelve a lanzar el propio sistema, y esa
  # vuelta arranca el bucle si no está vivo (ver tarea.sh). El timeout, por si
  # Termux:API dejara de responder: colgaría la instalación.
  local PROGRAMAR="termux-job-scheduler --job-id 7 --script $BASE/ciclo.sh --period-ms 900000 --persisted true --network any"
  timeout 30 termux-job-scheduler --cancel --job-id 7 </dev/null >/dev/null 2>&1 || true
  timeout 30 $PROGRAMAR </dev/null >/dev/null || aviso "no se ha podido programar la tarea de Android (la red de seguridad); el bucle va igual"

  # Al encender el móvil: wake lock, tarea y bucle. tarea.sh lo reescribe en
  # cada vuelta con este mismo contenido.
  mkdir -p "$HOME/.termux/boot"
  printf '#!/data/data/com.termux/files/usr/bin/bash\ntermux-wake-lock\n%s\nnohup bash %s/bucle.sh </dev/null >/dev/null 2>&1 &\n' "$PROGRAMAR" "$BASE" \
    > "$HOME/.termux/boot/recolector.sh"
  chmod +x "$HOME/.termux/boot/recolector.sh"
  ok "una vuelta cada 15 minutos, también tras reiniciar"

  paso "7/7  Primera vuelta, ahora mismo (recoge Yelmo: 1-4 min)"
  local antes despues resultado
  antes=$(git ls-remote "$REPO" "refs/heads/$RAMA_ESTADO" </dev/null 2>/dev/null | cut -f1 || true)
  # Esta vuelta deja también el bucle en marcha (tarea.sh lo arranca si no lo
  # está).
  bash "$BASE/ciclo.sh" </dev/null || true
  tail -n 12 "$BASE/ciclo.log" 2>/dev/null | sed 's/^/   /' || true
  echo
  despues=$(git ls-remote "$REPO" "refs/heads/$RAMA_ESTADO" </dev/null 2>/dev/null | cut -f1 || true)
  if [ -n "$despues" ] && [ "$despues" != "$antes" ]; then
    ok "primer informe publicado: el panel ya ve este móvil"
  else
    aviso "el informe no ha llegado a GitHub. Mira la red y vuelve a ejecutar el mismo comando."
  fi
  resultado=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).resultado||"")}catch{}' "$DIR_ESTADO/estado.json" 2>/dev/null || true)
  case "$resultado" in
    "recogida y publicada"|"recogida, sin cambios que publicar") ok "Yelmo: $resultado" ;;
    *) aviso "Yelmo: ${resultado:-sin resultado}. Claude lo verá en el informe; no hace falta repetir nada." ;;
  esac
  sleep 2
  if flock -n "$BASE/bucle.candado" true 2>/dev/null; then
    aviso "el bucle no se ha quedado en marcha: la tarea de Android lo arrancará en menos de 15 min"
  else
    ok "bucle en marcha"
  fi

  # Las recogidas van a las 07:00 y las 18:00 de la hora del MÓVIL.
  local zona
  zona=$(getprop persist.sys.timezone 2>/dev/null || true)
  if [ -n "$zona" ] && [ "$zona" != "Europe/Madrid" ]; then
    aviso "la zona horaria del móvil es «$zona»: las recogidas irían a las 07:00 y 18:00 de esa"
    aviso "hora. Ajustes → Fecha y hora → zona horaria automática (o Madrid)."
  fi

  ajustes_android
}

# Lo que queda por hacer a mano, según la marca. Son ajustes de Android que
# ningún programa puede cambiar sin root; sin ellos el sistema acaba cerrando
# Termux con la pantalla bloqueada y el móvil deja de dar señales.
ajustes_android() {
  cat <<'EOF'

Instalado. A partir de aquí Claude puede revisarlo y cambiarlo todo desde el
repositorio, sin tocar este móvil.

Lo ÚNICO que queda son unos toques en los ajustes de Android:

  1. Abre la app Termux:Boot una vez (abrir y cerrar, nada más).
EOF
  case "${MARCA:-}" in
    xiaomi|redmi|poco)
      cat <<'EOF'

  2. Ajustes → Aplicaciones → Administrar aplicaciones → en Termux,
     Termux:API y Termux:Boot:
       · Inicio automático: ACTIVADO
       · Ahorro de batería: "Sin restricciones"

  3. App Seguridad → Batería → ⚙ (arriba) →
     "Limpiar memoria al bloquear el dispositivo": DESACTIVADO

  4. Recientes → mantén pulsada la tarjeta de Termux → candado.
EOF
      ;;
    samsung)
      cat <<'EOF'

  2. Ajustes → Aplicaciones → Termux → Batería → "Sin restricciones".
     Lo mismo en Termux:API y Termux:Boot.

  3. Ajustes → Batería → Límites de uso en segundo plano:
       · "Poner en suspensión apps no usadas": DESACTIVADO
       · Si Termux sale en "Apps en suspensión" o "en suspensión profunda",
         quítalo de ahí.

  4. Recientes → toca el icono de Termux (arriba de su tarjeta) →
     "Mantener abierta".
EOF
      ;;
    *)
      cat <<'EOF'

  2. Ajustes → Aplicaciones → Termux → Batería (o "Uso de batería de la
     app") → "Sin restricciones". Lo mismo en Termux:API y Termux:Boot.

  3. Si tu móvil tiene "Inicio automático", "Apps en segundo plano" o un
     candado en Recientes, actívalos para Termux. Cada marca lo esconde en
     un sitio: https://dontkillmyapp.com dice dónde.
EOF
      ;;
  esac
  cat <<'EOF'

  Opcional, y recomendable con Android 12 o 13: bash ~/Movil/scripts/movil/ajustes-android.sh
  (quita el límite de procesos de Android, que puede cerrar Chromium a medias).
  Con Android 14 o más es un interruptor: Opciones de desarrollador →
  "Desactivar restricciones de procesos secundarios".

Cuando acabes, deja el móvil enchufado y bloqueado, y díselo a Claude.
EOF
}

principal "$@"
