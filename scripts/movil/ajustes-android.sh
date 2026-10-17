#!/data/data/com.termux/files/usr/bin/bash
# Ajustes de Android que ninguna pantalla de configuración permite hacer en
# Android 12 y 13, aplicados SIN PC: Termux se conecta por depuración
# inalámbrica a su propio móvil y los ejecuta con permisos de ADB. Se hace UNA
# vez por móvil (si se cambia de móvil, otra vez en el nuevo). Vale para
# cualquier marca; necesita Android 11 o más (la depuración inalámbrica).
#
#   bash ~/Movil/scripts/movil/ajustes-android.sh
#
# QUÉ CAMBIA
#  · Desactiva el "asesino de procesos fantasma" de Android 12, que cierra
#    procesos de apps en segundo plano sin avisar. En Android 14 hay un
#    interruptor para esto; en el 12 solo se puede por ADB.
#  · Mete Termux y sus complementos en la lista blanca de ahorro de energía
#    (Doze): el sistema deja de dormirlos.
#  · Les permite ejecutarse en segundo plano y los saca del "cubo" de apps
#    poco usadas, que Android va restringiendo cada vez más.
#
# Todos sobreviven a un reinicio. Si alguno falla, el script sigue con los
# demás y al final dice cuáles han entrado.

set -u
paso() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32m✓\033[0m %s\n' "$*"; }
fallo(){ printf '   \033[31m✗\033[0m %s\n' "$*"; }

# Sin depuración inalámbrica (Android 10 o menos) no hay forma sin PC. Y ahí
# tampoco hace tanta falta: el "asesino de procesos fantasma" llegó con el 12.
version=$(getprop ro.build.version.release 2>/dev/null | cut -d. -f1)
if [ -n "$version" ] && [ "$version" -lt 11 ] 2>/dev/null; then
  echo "Este móvil tiene Android $version: sin depuración inalámbrica no se puede, y"
  echo "tampoco tiene el límite de procesos de Android 12. Basta con los ajustes de batería."
  exit 0
fi

paso "1/4  Herramientas"
pkg install -y android-tools >/dev/null && ok "adb instalado" || { fallo "no se pudo instalar adb"; exit 1; }

paso "2/4  Emparejar Termux con el propio móvil"
cat <<'EOF'
   a) Opciones de desarrollador → activa "Depuración inalámbrica" (el móvil
      tiene que estar en tu WiFi). Están en Ajustes → Sistema (en Xiaomi,
      Ajustes → Ajustes adicionales). Si no aparecen: Ajustes → Información
      del teléfono → toca 7 veces "Número de compilación" (en Xiaomi, "Versión
      de MIUI" o "de HyperOS").
   b) Pon la pantalla DIVIDIDA: Termux en una mitad y Ajustes en la otra.
      (Recientes → mantén pulsado Termux → "Pantalla dividida".) Hace falta
      porque el código de emparejamiento desaparece si cambias de app.
   c) En Ajustes: "Depuración inalámbrica" → "Vincular dispositivo con
      código de vinculación". Te saldrá un código de 6 cifras y un puerto.
EOF
read -r -p "   Puerto de VINCULACIÓN (el que sale junto al código): " puerto_par </dev/tty
read -r -p "   Código de 6 cifras: " codigo </dev/tty
if adb pair "localhost:$puerto_par" "$codigo" 2>&1 | grep -qi "success"; then
  ok "emparejado"
else
  fallo "no se pudo emparejar. Revisa que la ventana del código siga abierta y vuelve a ejecutar el script."
  exit 1
fi

echo
echo "   Ahora en la pantalla principal de \"Depuración inalámbrica\" verás"
echo "   \"Dirección IP y puerto\" (algo como 192.168.1.23:41234). Ese puerto es OTRO."
read -r -p "   Puerto de CONEXIÓN: " puerto </dev/tty
if adb connect "localhost:$puerto" 2>&1 | grep -qi "connected"; then
  ok "conectado"
else
  fallo "no se pudo conectar"; exit 1
fi
A() { adb -s "localhost:$puerto" shell "$@" 2>&1; }

paso "3/4  Aplicar los ajustes"
PAQUETES="com.termux com.termux.api com.termux.boot"

# Asesino de procesos fantasma de Android 12. El primer comando impide que
# Google sobrescriba el valor en la siguiente sincronización de configuración.
A device_config set_sync_disabled_for_tests persistent >/dev/null
A device_config put activity_manager max_phantom_processes 2147483647 >/dev/null
A settings put global settings_enable_monitor_phantom_procs false >/dev/null
[ "$(A device_config get activity_manager max_phantom_processes | tr -d '\r')" = "2147483647" ] \
  && ok "límite de procesos fantasma desactivado" || fallo "límite de procesos fantasma"

for p in $PAQUETES; do
  if ! A pm path "$p" | grep -q package; then fallo "$p no está instalado"; continue; fi
  A dumpsys deviceidle whitelist "+$p" >/dev/null
  A cmd appops set "$p" RUN_IN_BACKGROUND allow >/dev/null
  A cmd appops set "$p" RUN_ANY_IN_BACKGROUND allow >/dev/null
  A am set-standby-bucket "$p" active >/dev/null
  if A dumpsys deviceidle whitelist | grep -q "$p"; then
    ok "$p: fuera del ahorro de energía y con permiso en segundo plano"
  else
    fallo "$p: no entró en la lista blanca"
  fi
done

paso "4/4  Cerrar"
adb disconnect "localhost:$puerto" >/dev/null 2>&1
cat <<'EOF'
   Ya puedes desactivar "Depuración inalámbrica": los ajustes se quedan.

   Si algún paso ha salido con ✗, dímelo tal cual y lo miro.
EOF
