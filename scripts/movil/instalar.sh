#!/data/data/com.termux/files/usr/bin/bash
# Instalación del recolector en el móvil. Se ejecuta UNA SOLA VEZ, en Termux.
#
#   curl -fsSL https://raw.githubusercontent.com/jaimeas98/Movil/claude/puerto-santa-maria-restaurants-NxChu/scripts/movil/instalar.sh | bash
#
# o, si ya tienes el repositorio clonado en el móvil:
#
#   bash scripts/movil/instalar.sh
#
# QUÉ DEJA MONTADO
#  · Cada 30 minutos el móvil se trae la última versión del código. Si Claude
#    arregla algo y lo sube, en la vuelta siguiente ya se está usando.
#  · Dos veces al día recoge la cartelera de Yelmo y la publica.
#  · En cada vuelta deja un informe en la rama `estado-movil` —qué ha hecho,
#    si ha fallado y por qué, batería, versión de Android—, que se puede leer
#    desde cualquier sesión sin tocar el móvil.
#
# Nada entra en el móvil desde fuera: no se abre ningún puerto ni se instala
# ningún servidor SSH. El móvil solo SALE hacia GitHub y hacia Yelmo, y solo
# ejecuta código de este repositorio.

set -euo pipefail

REPO="git@github.com:jaimeas98/Movil.git"
RAMA_APP="claude/puerto-santa-maria-restaurants-NxChu"
RAMA_ESTADO="estado-movil"
DIR="$HOME/Movil"
DIR_ESTADO="$HOME/estado-movil"
BASE="$HOME/.recolector"

paso() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }

paso "1/6  Paquetes"
pkg update -y
# util-linux trae flock, que impide que se solapen dos vueltas si una se alarga.
pkg install -y git nodejs-lts openssh termux-api util-linux

paso "2/6  Clave para publicar en GitHub"
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
if [ ! -f "$HOME/.ssh/id_recolector" ]; then
  ssh-keygen -q -t ed25519 -N "" -C "recolector-movil" -f "$HOME/.ssh/id_recolector"
fi
cat > "$HOME/.ssh/config" <<'EOF'
Host github.com
  IdentityFile ~/.ssh/id_recolector
  IdentitiesOnly yes
EOF
ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null

cat <<EOF

Esta clave es SOLO para este repositorio: si algún día pierdes el móvil, la
borras en GitHub y deja de tener acceso a todo lo demás.

  1. Abre   https://github.com/jaimeas98/Movil/settings/keys/new
  2. Title: recolector-movil
  3. Pega esto en "Key":

$(cat "$HOME/.ssh/id_recolector.pub")

  4. Marca "Allow write access" y guarda.

EOF
read -r -p "Pulsa Intro cuando la hayas añadido… " _ </dev/tty

# ssh -T devuelve 1 aunque la autenticación haya ido bien: se mira el texto.
if ! ssh -T git@github.com 2>&1 | grep -qi "successfully authenticated"; then
  echo "GitHub no acepta la clave todavía. Revisa el paso 2 y vuelve a ejecutar este script."
  exit 1
fi
echo "GitHub acepta la clave."

paso "3/6  Código de la cartelera"
if [ ! -d "$DIR/.git" ]; then
  git clone --branch "$RAMA_APP" --single-branch "$REPO" "$DIR"
fi
git -C "$DIR" config user.name "Recolector (móvil)"
git -C "$DIR" config user.email "recolector@movil.invalid"

paso "4/6  Rama de informes"
# Rama aparte y sin historia común con la web: aquí solo va el último informe.
# vercel.json desactiva los despliegues de esta rama, así que escribir en ella
# cada media hora no gasta ni un despliegue.
if [ ! -d "$DIR_ESTADO/.git" ]; then
  if git ls-remote --exit-code --heads "$REPO" "$RAMA_ESTADO" >/dev/null 2>&1; then
    git clone --branch "$RAMA_ESTADO" --single-branch "$REPO" "$DIR_ESTADO"
  else
    mkdir -p "$DIR_ESTADO"
    git -C "$DIR_ESTADO" init -q
    git -C "$DIR_ESTADO" remote add origin "$REPO"
    git -C "$DIR_ESTADO" checkout -q --orphan "$RAMA_ESTADO"
    printf 'Informes del recolector del móvil. Los escribe scripts/movil/tarea.sh.\n' > "$DIR_ESTADO/LEEME.txt"
    git -C "$DIR_ESTADO" add LEEME.txt
    git -C "$DIR_ESTADO" -c user.name="Recolector (móvil)" -c user.email="recolector@movil.invalid" \
      commit -q -m "Rama de informes del recolector"
    git -C "$DIR_ESTADO" push -q -u origin "$RAMA_ESTADO"
  fi
fi
git -C "$DIR_ESTADO" config user.name "Recolector (móvil)"
git -C "$DIR_ESTADO" config user.email "recolector@movil.invalid"

paso "5/6  Programar las vueltas"
mkdir -p "$BASE"
# El arranque de cada vuelta vive FUERA del repositorio a propósito: ver ciclo.sh.
cp "$DIR/scripts/movil/ciclo.sh" "$BASE/ciclo.sh"
chmod +x "$BASE/ciclo.sh"

# El planificador de Android y no un cron dentro de Termux: si Android cierra
# Termux, un cron muere con él; una tarea del JobScheduler la vuelve a lanzar
# el propio sistema. Y como el móvil está siempre cargando, no entra en reposo
# profundo y las vueltas no se retrasan.
termux-job-scheduler --cancel --job-id 7 >/dev/null 2>&1 || true
termux-job-scheduler \
  --job-id 7 \
  --script "$BASE/ciclo.sh" \
  --period-ms 1800000 \
  --persisted true \
  --network any

# Red de seguridad al reiniciar el móvil: vuelve a registrar la tarea.
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/recolector.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
termux-job-scheduler --job-id 7 --script "$BASE/ciclo.sh" --period-ms 1800000 --persisted true --network any
EOF
chmod +x "$HOME/.termux/boot/recolector.sh"

paso "6/6  Primera vuelta, ahora mismo"
# Forzamos la recogida en esta primera vuelta en vez de esperar a que toque.
rm -f "$BASE/ultima-recogida"
bash "$BASE/ciclo.sh" || true
echo "Registro de esta vuelta:"
tail -n 25 "$BASE/ciclo.log" || true

cat <<'EOF'

Listo. A partir de aquí no hace falta tocar nada más en Termux.

Quedan cuatro ajustes del propio Android que un script no puede hacer. Son los
que evitan que el sistema cierre Termux por su cuenta:

  1. Ajustes → Aplicaciones → Termux, Termux:API y Termux:Boot →
     Batería → "Sin restricciones" (en las tres).

  2. Abre Termux:Boot una vez. Solo con abrirla queda activada.

  3. Si tu Android es 12 o superior, desactiva el límite de procesos:
     Ajustes → Opciones de desarrollador →
     "Desactivar restricciones de procesos secundarios".
     (Si no aparece esa opción, dímelo: se hace con un comando desde un PC.)

  4. Mira tu marca en https://dontkillmyapp.com — Samsung, Xiaomi y Huawei
     añaden sus propios cierres agresivos y cada una se desactiva distinto.

Y uno de cuidado del propio móvil: si tiene la opción de limitar la carga al
80 % (Samsung "Proteger batería", Pixel "Carga adaptativa"), actívala. Un móvil
enchufado siempre al 100 % envejece la batería mucho más rápido.
EOF
