#!/usr/bin/env bash
# Simulación completa del recolector del móvil, para ejecutar ANTES de subir
# cualquier cambio a scripts/movil/. El móvil aplica solo lo que haya en el
# repositorio, así que un fallo aquí lo dejaría roto sin que nadie lo viera.
#
# Monta un Termux falso, un "GitHub" local y un Yelmo simulado, y comprueba
# las vueltas de principio a fin. No toca la red ni el repositorio real.
#
#   bash scripts/movil/probar.sh
set -u
RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
RAMA=claude/puerto-santa-maria-restaurants-NxChu
S=$(mktemp -d); trap 'rm -rf "$S"' EXIT
mkdir -p "$S/bin" "$S/home"

for c in termux-wake-lock termux-wake-unlock termux-job-scheduler; do printf '#!/bin/sh\nexit 0\n' > "$S/bin/$c"; done
echo '#!/bin/sh
echo "{\"percentage\": ${BAT_PCT:-81}, \"plugged\": \"PLUGGED_AC\", \"health\": \"GOOD\", \"temperature\": 29.5}"' > "$S/bin/termux-battery-status"
echo '#!/bin/sh
case "$1" in ro.product.model) echo "Movil de prueba";; ro.build.version.release) echo "14";; esac' > "$S/bin/getprop"
chmod +x "$S/bin/"*

# Chromium y puppeteer-core simulados: el recolector real se ejecuta entero,
# pero lo que "responde Yelmo" lo decide MOCK_YELMO (ok, bloqueo, uno).
printf '#!/bin/sh\nexit 0\n' > "$S/bin/chromium-browser"; chmod +x "$S/bin/chromium-browser"
P="$S/home/navegador/node_modules/puppeteer-core"; mkdir -p "$P"
echo '{"name":"puppeteer-core","type":"module","exports":"./index.js"}' > "$P/package.json"
cat > "$P/index.js" <<'EOF'
import { appendFileSync } from 'node:fs';
const hoy = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid' }).format(new Date());
const cine = (Key) => ({ Key, VistaId: '1', Dates: [{ Movies: [{ Title: 'Peli ' + Key, RunTime: 100,
  Formats: [{ Name: '2D', Language: 'Español', Showtimes: [{ Time: '20:00', ShowtimeId: '1', TimeFilter: hoy + ' 22:30:00' }] }] }] }] });
const modo = () => process.env.MOCK_YELMO;
const pagina = {
  setUserAgent: async () => {}, setViewport: async () => {}, setExtraHTTPHeaders: async () => {},
  evaluateOnNewDocument: async () => {}, title: async () => 'Yelmo Cines',
  goto: async () => { appendFileSync(process.env.LLAMADAS, 'x'); return { status: () => (modo() === 'bloqueo' ? 403 : 200) }; },
  createCDPSession: async () => ({ send: async (m) => {
    if (m === 'Page.getFrameTree') return { frameTree: { frame: { id: 'f' } } };
    if (m === 'Page.createIsolatedWorld') return { executionContextId: 1 };
    const cines = modo() === 'uno' ? [cine('area-sur')] : [cine('premium-bahia-sur'), cine('area-sur')];
    return { result: { value: { status: 200, texto: JSON.stringify({ d: { Cinemas: cines } }) } } };
  } }),
};
export default { launch: async () => ({ newPage: async () => pagina, version: async () => 'Chrome/155.0.0.0', close: async () => {} }) };
EOF

export HOME="$S/home" PATH="$S/bin:$PATH" LLAMADAS="$S/llamadas"
: > "$LLAMADAS"
git config --global user.name sim; git config --global user.email sim@x; git config --global init.defaultBranch main

# "GitHub" local con el estado ACTUAL del directorio de trabajo, cambios sin
# commitear incluidos: se prueba lo que se va a subir, no lo que ya estaba.
git clone -q --bare "$RAIZ" "$S/origin.git"
git clone -q --branch "$RAMA" --single-branch "$S/origin.git" "$HOME/Movil" 2>/dev/null \
  || git clone -q "$S/origin.git" "$HOME/Movil"
git -C "$HOME/Movil" checkout -q -B "$RAMA"
rsync -a --exclude .git --exclude node_modules "$RAIZ/" "$HOME/Movil/" 2>/dev/null || cp -r "$RAIZ/scripts" "$RAIZ/data" "$RAIZ/lib" "$HOME/Movil/"
git -C "$HOME/Movil" add -A && git -C "$HOME/Movil" commit -qm "estado a probar" --allow-empty && git -C "$HOME/Movil" push -q -f origin "HEAD:$RAMA"
mkdir -p "$HOME/estado-movil" && ( cd "$HOME/estado-movil" && git init -q && git remote add origin "$S/origin.git" \
  && git checkout -q --orphan estado-movil && echo x > LEEME.txt && git add . && git commit -qm init && git push -q -u origin estado-movil )
mkdir -p "$HOME/.recolector" && cp "$HOME/Movil/scripts/movil/ciclo.sh" "$HOME/.recolector/ciclo.sh"

fallos=0; ok(){ echo "ok    $*"; }; mal(){ echo "FALLO $*"; fallos=$((fallos+1)); }
campo(){ git -C "$S/origin.git" show estado-movil:estado.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s)$1))"; }
vuelta(){ bash "$HOME/.recolector/ciclo.sh"; }
commits(){ git -C "$S/origin.git" rev-list --count "$RAMA"; }
llamadas(){ wc -c < "$LLAMADAS" | tr -d ' '; }
T="$S/fuera"; git clone -q --branch "$RAMA" "$S/origin.git" "$T"
subir(){ git -C "$T" pull -q --rebase origin "$RAMA"; "$@"; git -C "$T" add -A; git -C "$T" commit -qm "desde fuera"; git -C "$T" push -q origin "HEAD:$RAMA"; }

MOCK_YELMO=ok vuelta
[ "$(campo .resultado)" = "recogida y publicada" ] && git -C "$S/origin.git" show "$RAMA:data/yelmo.js" | grep -q premium-bahia-sur \
  && ok "1ª vuelta: recoge y publica los dos cines" || mal "1ª vuelta: '$(campo .resultado)'"

sleep 1; a=$(commits); MOCK_YELMO=ok vuelta
[ "$(campo .resultado)" = "sin recogida: no tocaba" ] && [ "$(commits)" -eq "$a" ] && ok "si no toca, no recoge ni gasta despliegue" || mal "no tocaba: '$(campo .resultado)'"

subir touch "$T/data/forzar-recogida"; echo 0 > "$HOME/.recolector/ultimo-intento"; MOCK_YELMO=ok vuelta
[ "$(campo .motivo)" = "pedida desde el repositorio" ] && ! git -C "$S/origin.git" cat-file -e "$RAMA:data/forzar-recogida" 2>/dev/null \
  && ok "atiende una recogida pedida desde fuera y borra el aviso" || mal "pedida: '$(campo .motivo)'"

subir touch "$T/data/forzar-recogida"; echo 0 > "$HOME/.recolector/ultimo-intento"; a=$(commits); MOCK_YELMO=bloqueo vuelta
[ "$(campo .resultado)" = "fallo al recoger" ] && campo .error | grep -qi cloudflare && [ "$(commits)" -eq "$a" ] \
  && ok "con bloqueo: explica el motivo y no publica nada roto" || mal "bloqueo: '$(campo .resultado)'"
n=$(llamadas); for i in 1 2 3; do MOCK_YELMO=bloqueo vuelta; done
[ "$(llamadas)" -eq "$n" ] && ok "tras un fallo no insiste contra el bloqueo" || mal "insistió $(( $(llamadas) - n )) veces"
echo $(( $(date +%s) - 7300 )) > "$HOME/.recolector/ultimo-intento"; MOCK_YELMO=ok vuelta
[ "$(campo .resultado)" = "recogida y publicada" ] && ok "pasada la espera, reintenta" || mal "reintento: '$(campo .resultado)'"

# Un arreglo del recolector tras un fallo se prueba ya, sin esperar 24 h…
subir touch "$T/data/forzar-recogida"; echo 0 > "$HOME/.recolector/ultimo-intento"; MOCK_YELMO=bloqueo vuelta
n=$(llamadas); MOCK_YELMO=ok vuelta
[ "$(llamadas)" -eq "$n" ] || mal "tras el bloqueo reintentó sin que cambiara nada"
subir sh -c "echo '// arreglo' >> '$T/scripts/movil/recolector-navegador.mjs'"; MOCK_YELMO=ok vuelta
[ "$(campo .resultado)" = "recogida y publicada" ] && campo .motivo | grep -q "ha cambiado" \
  && ok "un arreglo del recolector tras un fallo se prueba en la vuelta siguiente" || mal "arreglo: '$(campo .resultado)' / '$(campo .motivo)'"
# …pero un cambio que no toca al recolector no sirve de excusa para insistir.
subir touch "$T/data/forzar-recogida"; echo 0 > "$HOME/.recolector/ultimo-intento"; MOCK_YELMO=bloqueo vuelta
n=$(llamadas); subir sh -c "echo x >> '$T/data/otra-cosa'"; MOCK_YELMO=ok vuelta
[ "$(llamadas)" -eq "$n" ] && ok "otros cambios del repositorio no provocan reintentos" || mal "reintentó por un cambio ajeno"

# Si un día viene un cine de menos, se conserva la instantánea completa
echo $(( $(date +%s) - 7300 )) > "$HOME/.recolector/ultimo-intento"; a=$(commits); MOCK_YELMO=uno vuelta
[ "$(campo .resultado)" = "fallo al recoger" ] && [ "$(commits)" -eq "$a" ] \
  && git -C "$S/origin.git" show "$RAMA:data/yelmo.js" | grep -q premium-bahia-sur \
  && ok "con un cine de menos no pisa la instantánea buena" || mal "un cine de menos: '$(campo .resultado)'"
git -C "$T" pull -q --rebase origin "$RAMA"; subir git -C "$T" rm -q data/forzar-recogida
echo $(( $(date +%s) - 7300 )) > "$HOME/.recolector/ultimo-intento"; echo 0 > "$HOME/.recolector/ultima-recogida"; MOCK_YELMO=ok vuelta
[ "$(campo .resultado)" != "fallo al recoger" ] || mal "no se recuperó tras el cine de menos: '$(campo .error)'"

subir sed -i 's/^CADA_HORAS=11$/CADA_HORAS=11  # cambio de prueba/' "$T/scripts/movil/tarea.sh"
nuevo=$(git -C "$T" rev-parse --short HEAD); MOCK_YELMO=ok vuelta
[ "$(campo .codigo)" = "$nuevo" ] && ok "un cambio subido se aplica en la vuelta siguiente" || mal "arrancó con $(campo .codigo), esperaba $nuevo"

( exec 9>"$HOME/.recolector/candado"; flock 9; sleep 3 ) & sleep 0.5; MOCK_YELMO=ok vuelta; wait
tail -n 3 "$HOME/.recolector/ciclo.log" | grep -q "ya hay otra vuelta" && ok "no se solapan dos vueltas" || mal "candado"
[ "$(git -C "$S/origin.git" rev-list --count estado-movil)" -eq 1 ] && ok "la rama de informes no acumula commits" || mal "informes acumulan"

# Canal de órdenes: se ejecuta una sola vez y nunca filtra una clave privada
subir sh -c "cat > '$T/data/orden.sh' <<'EOF'
echo hola-desde-el-movil
echo x >> \"\$HOME/veces-orden\"
echo '-----BEGIN OPENSSH PRIVATE KEY-----'
echo SECRETO-QUE-NO-DEBE-SALIR
echo '-----END OPENSSH PRIVATE KEY-----'
EOF"
MOCK_YELMO=ok vuelta; MOCK_YELMO=ok vuelta
sal=$(git -C "$S/origin.git" show estado-movil:orden-salida.txt 2>/dev/null)
echo "$sal" | grep -q hola-desde-el-movil && ok "una orden subida se ejecuta y devuelve su salida" || mal "la orden no se ejecutó"
[ "$(wc -l < "$HOME/veces-orden" 2>/dev/null)" = "1" ] && ok "la orden se ejecuta una sola vez" || mal "la orden se ejecutó $(wc -l < "$HOME/veces-orden" 2>/dev/null) veces"
echo "$sal" | grep -q SECRETO && mal "¡una clave privada llegó al informe público!" || ok "una clave privada nunca llega al informe público"

# Enchufe: corta al 80 % y reanuda al 40 %
printf 'ENCENDER=file://%s/on\nAPAGAR=file://%s/off\n' "$S" "$S" > "$HOME/.recolector/enchufe.conf"
touch "$S/off"; rm -f "$S/on"
BAT_PCT=81 MOCK_YELMO=ok vuelta
campo .enchufe | grep -q "apagado al 81" && ok "enchufe: corta la carga al pasar del 80 %" || mal "enchufe al 81: '$(campo .enchufe)'"
touch "$S/on"; BAT_PCT=35 MOCK_YELMO=ok vuelta
campo .enchufe | grep -q "encendido al 35" && ok "enchufe: reanuda la carga al bajar del 40 %" || mal "enchufe al 35: '$(campo .enchufe)'"
rm -f "$S/on"; BAT_PCT=30 MOCK_YELMO=ok vuelta
campo .enchufe | grep -q "ERROR" && ok "enchufe: si no responde, el informe lo avisa" || mal "fallo de enchufe no avisado: '$(campo .enchufe)'"

echo; [ $fallos -eq 0 ] && echo "Todo correcto" || { echo "$fallos FALLOS"; exit 1; }
