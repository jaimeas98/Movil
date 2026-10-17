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
echo "{\"percentage\": ${BAT_PCT:-81}, \"plugged\": \"${BAT_PLUG:-PLUGGED_AC}\", \"health\": \"GOOD\", \"temperature\": 29.5}"' > "$S/bin/termux-battery-status"
echo '#!/bin/sh
case "$1" in ro.product.model) echo "${MODELO_PRUEBA:-Movil de prueba}";; ro.build.version.release) echo "14";; esac' > "$S/bin/getprop"
# Sin red de verdad: curl solo sirve ficheros locales (el enchufe simulado), y
# pkg (actualizar-paquetes) tarda un poco y dice qué haría.
echo '#!/bin/sh
for a in "$@"; do case "$a" in http://*|https://*) exit 7;; esac; done
exec '"$(command -v curl)"' "$@"' > "$S/bin/curl"
echo '#!/bin/sh
echo "pkg $* (simulado)"; sleep 2' > "$S/bin/pkg"
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

# mk2 y Arte Siete (la copia de respaldo): sin red en la simulación, fallan
# rápido; lo que se comprueba aquí es que eso no tumbe nada.
echo "globalThis.fetch = async () => { throw new Error('sin red en la simulación'); };" > "$S/sin-red.mjs"

export RECOLECTOR_SIN_BUCLE=1 HOME="$S/home" PATH="$S/bin:$PATH" LLAMADAS="$S/llamadas" NODE_OPTIONS="--import $S/sin-red.mjs"
: > "$LLAMADAS"
git config --global user.name sim; git config --global user.email sim@x; git config --global init.defaultBranch main

# "GitHub" local con el estado ACTUAL del directorio de trabajo, cambios sin
# commitear incluidos: se prueba lo que se va a subir, no lo que ya estaba.
git clone -q --bare "$RAIZ" "$S/origin.git"
git clone -q --branch "$RAMA" --single-branch "$S/origin.git" "$HOME/Movil" 2>/dev/null \
  || git clone -q "$S/origin.git" "$HOME/Movil"
git -C "$HOME/Movil" checkout -q -B "$RAMA"
rsync -a --exclude .git --exclude node_modules "$RAIZ/" "$HOME/Movil/" 2>/dev/null || cp -r "$RAIZ/scripts" "$RAIZ/data" "$RAIZ/lib" "$RAIZ/.github" "$HOME/Movil/"
rm -f "$HOME/Movil/data/forzar-recogida" "$HOME/Movil/data/orden.sh"   # avisos pendientes del repo real: la simulación empieza limpia
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

# El reloj de tarea.sh se fija con AHORA_PRUEBA para probar los turnos.
reloj(){ export AHORA_PRUEBA=$(date -d "$1" +%s); }
D=2026-11-02; D1=2026-11-03; D2=2026-11-04
ultimo_intento(){ date -d "$1" +%s > "$HOME/.recolector/ultimo-intento"; }

reloj "$D 07:05"; MOCK_YELMO=ok vuelta
[ "$(campo .resultado)" = "recogida y publicada" ] && [ "$(campo .motivo)" = "turno de las 07:00" ] \
  && git -C "$S/origin.git" show "$RAMA:data/yelmo.js" | grep -q premium-bahia-sur \
  && ok "turno de las 07:00: recoge y publica los dos cines" || mal "1ª vuelta: '$(campo .resultado)' / '$(campo .motivo)'"

reloj "$D 07:20"; a=$(commits); MOCK_YELMO=ok vuelta
[ "$(campo .resultado)" = "sin recogida: no tocaba" ] && [ "$(commits)" -eq "$a" ] && ok "dentro del mismo turno no repite ni gasta despliegue" || mal "no tocaba: '$(campo .resultado)'"

# Fallo en el turno de las 18:00 → reintento cada hora
reloj "$D 18:02"; a=$(commits); MOCK_YELMO=bloqueo vuelta
[ "$(campo .resultado)" = "fallo al recoger" ] && campo .error | grep -qi cloudflare && [ "$(commits)" -eq "$a" ] \
  && ok "con bloqueo: explica el motivo y no publica nada roto" || mal "bloqueo: '$(campo .resultado)'"
n=$(llamadas); reloj "$D 18:40"; MOCK_YELMO=bloqueo vuelta
[ "$(llamadas)" -eq "$n" ] && campo .resultado | grep -q "reintento a las 19:02" \
  && ok "tras un fallo espera una hora (informe: '$(campo .resultado)')" || mal "no esperó: '$(campo .resultado)'"
reloj "$D 19:05"; MOCK_YELMO=bloqueo vuelta
[ "$(llamadas)" -eq $(( n + 1 )) ] && campo .motivo | grep -q "reintento del turno de las 18:00" \
  && ok "pasada la hora, reintenta" || mal "reintento: '$(campo .motivo)'"
reloj "$D 20:10"; MOCK_YELMO=ok vuelta
[ "$(campo .resultado)" = "recogida y publicada" ] && ok "y cuando vuelve a funcionar, publica" || mal "recuperación: '$(campo .resultado)'"
[ "$(campo .proximaRecogida)" = "$(date -u -d "$D1 07:00" +%Y-%m-%dT%H:%M:%S.000Z)" ] \
  && ok "el informe dice cuándo es la próxima (turno de las 07:00)" || mal "próxima: '$(campo .proximaRecogida)'"

# Cerca del turno siguiente ya no reintenta: lo hará ese turno
reloj "$D1 07:01"; MOCK_YELMO=bloqueo vuelta; ultimo_intento "$D1 15:10"
n=$(llamadas); reloj "$D1 16:15"; MOCK_YELMO=ok vuelta
[ "$(llamadas)" -eq "$n" ] && campo .resultado | grep -q "18:00 está cerca" \
  && ok "a menos de 2 h del turno siguiente deja de reintentar" || mal "cerca del turno: '$(campo .resultado)'"
reloj "$D1 18:01"; MOCK_YELMO=ok vuelta
[ "$(campo .motivo)" = "turno de las 18:00" ] && [ "$(campo .resultado)" = "recogida y publicada" ] \
  && ok "y el turno siguiente recoge" || mal "turno siguiente: '$(campo .motivo)'"

subir touch "$T/data/forzar-recogida"; reloj "$D1 23:30"; MOCK_YELMO=ok vuelta
[ "$(campo .motivo)" = "pedida desde el repositorio" ] && ! git -C "$S/origin.git" cat-file -e "$RAMA:data/forzar-recogida" 2>/dev/null \
  && ok "atiende una recogida pedida desde fuera y borra el aviso" || mal "pedida: '$(campo .motivo)'"

# Un arreglo del recolector tras un fallo se prueba ya, sin esperar…
reloj "$D2 07:01"; MOCK_YELMO=bloqueo vuelta
n=$(llamadas); reloj "$D2 07:10"; MOCK_YELMO=ok vuelta
[ "$(llamadas)" -eq "$n" ] || mal "tras el bloqueo reintentó sin que cambiara nada"
subir sh -c "echo '// arreglo' >> '$T/scripts/movil/recolector-navegador.mjs'"; reloj "$D2 07:15"; MOCK_YELMO=ok vuelta
[ "$(campo .resultado)" = "recogida y publicada" ] && campo .motivo | grep -q "ha cambiado" \
  && ok "un arreglo del recolector tras un fallo se prueba en la vuelta siguiente" || mal "arreglo: '$(campo .resultado)' / '$(campo .motivo)'"
# …pero un cambio que no toca al recolector no sirve de excusa para insistir.
reloj "$D2 18:01"; MOCK_YELMO=bloqueo vuelta
n=$(llamadas); subir sh -c "echo x >> '$T/data/otra-cosa'"; reloj "$D2 18:20"; MOCK_YELMO=ok vuelta
[ "$(llamadas)" -eq "$n" ] && ok "otros cambios del repositorio no provocan reintentos" || mal "reintentó por un cambio ajeno"

# Una recogida corta (un cine de menos) no quita nada: se fusiona
reloj "$D2 19:05"; MOCK_YELMO=uno vuelta
[ "$(campo .resultado)" = "recogida y publicada" ] && git -C "$S/origin.git" show "$RAMA:data/yelmo.js" | grep -q premium-bahia-sur \
  && grep -q "se conserva el de la recogida anterior" "$HOME/.recolector/ciclo.log" \
  && ok "si falta un cine, se conserva el de la recogida anterior" || mal "un cine de menos: '$(campo .resultado)'"

subir sed -i 's/^CERCA=7200$/CERCA=7200  # cambio de prueba/' "$T/scripts/movil/tarea.sh"
nuevo=$(git -C "$T" rev-parse --short HEAD); MOCK_YELMO=ok vuelta
[ "$(campo .codigo)" = "$nuevo" ] && ok "un cambio subido se aplica en la vuelta siguiente" || mal "arrancó con $(campo .codigo), esperaba $nuevo"
grep -q "respaldo: no ha respondido ningún cine" "$HOME/.recolector/ciclo.log" \
  && ok "sin mk2 ni Arte Siete, la copia de respaldo no se toca ni tumba la vuelta" || mal "respaldo sin red"

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

# Batería: desenchufado y bajando, el informe lleva el ritmo y cuánto le queda
t0=$AHORA_PRUEBA
for i in 0 1 2 3 4; do export AHORA_PRUEBA=$(( t0 + i * 900 )); BAT_PLUG=UNPLUGGED BAT_PCT=$(( 60 - i * 3 )) MOCK_YELMO=ok vuelta; done
r=$(campo .bateria.ritmoPorHora); q=$(campo .bateria.horasHastaReserva)
[ "$r" = "12" ] && [ "$q" = "2.8" ] && ok "el informe calcula a qué ritmo baja la batería (12 %/h, 2,8 h hasta el 15 %)" || mal "previsión de batería: ritmo $r, horas $q"
BAT_PLUG=PLUGGED_AC BAT_PCT=50 MOCK_YELMO=ok vuelta
[ "$(campo .bateria.ritmoPorHora)" = "null" ] && ok "al volver a cargar, sin previsión de descarga" || mal "cargando con ritmo"
mv "$HOME/.recolector/bateria-historial.json" "$S/h.json"; echo "esto no es json" > "$HOME/.recolector/bateria-historial.json"
BAT_PLUG=UNPLUGGED MOCK_YELMO=ok vuelta
[ "$(campo .resultado)" != "" ] && ok "un historial de batería roto no impide el informe (el latido)" || mal "sin informe con historial roto"

# Bucle propio: una vuelta lo arranca si no está vivo, y solo uno a la vez
mkdir -p "$HOME/.termux/boot"
RECOLECTOR_SIN_BUCLE= MOCK_YELMO=ok vuelta; sleep 1
! flock -n "$HOME/.recolector/bucle.candado" true && ok "una vuelta arranca el bucle propio si no está corriendo" || mal "el bucle no arrancó"
RECOLECTOR_SIN_BUCLE= MOCK_YELMO=ok vuelta; sleep 1
[ "$(pgrep -fc "$HOME/.recolector/bucle.sh")" = 1 ] && ok "nunca hay dos bucles a la vez" || mal "hay $(pgrep -fc "$HOME/.recolector/bucle.sh") bucles"
grep -q "bucle.sh" "$HOME/.termux/boot/recolector.sh" && ok "al encender el móvil también arranca el bucle" || mal "Termux:Boot sin bucle"
pkill -f "$HOME/.recolector/bucle.sh"; sleep 1

# ── Historiales para el panel ───────────────────────────────────────────────
E(){ git -C "$S/origin.git" show "estado-movil:$1" 2>/dev/null; }
n=$(E historial.jsonl | wc -l)
[ "$n" -ge 20 ] && E historial.jsonl | tail -n1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s);process.exit(l.t&&l.resultado&&"bateria" in l&&l.codigo?0:1)})' \
  && ok "historial.jsonl: una línea por vuelta ($n), con resultado, batería y código" || mal "historial.jsonl: $n líneas"
E recogidas.jsonl | tail -n1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s);process.exit(l.cines?.["yelmo-bahia-sur"]?.dias>=1&&l.duracionS>=0&&l.motivo?0:1)})' \
  && ok "recogidas.jsonl: días y películas por cine y duración de cada recogida" || mal "recogidas.jsonl: '$(E recogidas.jsonl | tail -n1 | cut -c1-200)'"
E bateria-historial.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(Array.isArray(JSON.parse(s))?0:1))' \
  && ok "bateria-historial.json publicado (y solo si es JSON válido)" || mal "bateria-historial.json"
viejo=$(date -u -d '8 days ago' +%Y-%m-%dT%H:%M:%S.000Z)
sed -i "1i {\"t\":\"$viejo\",\"resultado\":\"vuelta de hace 8 días\"}" "$HOME/.recolector/historial.jsonl"
MOCK_YELMO=ok vuelta
! E historial.jsonl | grep -q "hace 8 días" && ok "historial.jsonl solo guarda 7 días" || mal "historial sin recortar"
mv "$HOME/.recolector/historial.jsonl" "$S/hist.bak"; mkdir "$HOME/.recolector/historial.jsonl"
antes=$(campo .vuelta); sleep 1; MOCK_YELMO=ok vuelta
[ "$(campo .vuelta)" != "$antes" ] && ok "un historial que no se puede escribir no impide el informe (el latido)" || mal "sin informe con historial roto"
rmdir "$HOME/.recolector/historial.jsonl"; mv "$S/hist.bak" "$HOME/.recolector/historial.jsonl"

# ── Órdenes del panel (rama ordenes-movil) ─────────────────────────────────
O="$S/ordenes"; mkdir -p "$O" && ( cd "$O" && git init -q && git remote add origin "$S/origin.git" && git checkout -q --orphan ordenes-movil )
# orden id accion [pedida]: la añade a ordenes.json y la sube, como el panel.
orden(){
  ( cd "$O" && ID="$1" ACCION="$2" PEDIDA="${3:-$(date -u +%Y-%m-%dT%H:%M:%S.000Z)}" node -e '
    const fs=require("fs"); let d={ordenes:[]}; try{d=JSON.parse(fs.readFileSync("ordenes.json","utf8"))}catch{}
    d.ordenes.push({id:process.env.ID,accion:process.env.ACCION,pedida:process.env.PEDIDA,parametros:{}});
    fs.writeFileSync("ordenes.json",JSON.stringify({ordenes:d.ordenes.slice(-20)},null,2));' \
    && git add -A && git commit -qm "orden $1" && git push -q origin ordenes-movil )
}
R(){ E ordenes-resultado.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const r=JSON.parse(s).resultados.find(x=>x.id==='$1');console.log(r?r$2:'')}catch{console.log('')}})"; }
# Cada prueba empieza como si hubiera pasado el tiempo: sin el registro de
# límites del móvil (ordenes-limites.json). Las de límites usan ordenes_tal_cual.
LIM="$HOME/.recolector/ordenes-limites.json"
ordenes(){ rm -f "$LIM"; bash "$HOME/.recolector/ordenes.sh"; }
ordenes_tal_cual(){ bash "$HOME/.recolector/ordenes.sh"; }
export MOCK_YELMO=ok

[ -f "$HOME/.recolector/ordenes.sh" ] && ok "cada vuelta deja ordenes.sh fuera del repositorio" || mal "falta ~/.recolector/ordenes.sh"
ordenes; [ -z "$(E ordenes-resultado.json)" ] && ok "sin rama de órdenes no hace nada (ni falla)" || mal "resultados sin órdenes"

orden o-20261102-1000-aa01 diagnostico; ordenes
[ "$(R o-20261102-1000-aa01 .estado)" = hecha ] && R o-20261102-1000-aa01 .salida | grep -q "node:" \
  && ok "una orden del panel se ejecuta y su resultado se publica en el acto" || mal "diagnóstico: '$(R o-20261102-1000-aa01 .estado)'"
R o-20261102-1000-aa01 .salida | grep -Eq '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' && mal "¡el diagnóstico publica una IP!" || ok "el diagnóstico no publica IPs"
for c in id accion estado inicio fin codigo salida; do R o-20261102-1000-aa01 ".$c" | grep -q . || mal "al resultado le falta $c"; done

orden o-20261102-1001-aa02 'rm -rf ~'; orden o-20261102-1002-aa03 'informe;touch' ; orden o-20261102-1003-aa04 borrar-todo; ordenes
[ "$(R o-20261102-1001-aa02 .estado)" = rechazada ] && [ "$(R o-20261102-1002-aa03 .estado)" = rechazada ] \
  && [ "$(R o-20261102-1003-aa04 .estado)" = rechazada ] && [ "$(R o-20261102-1003-aa04 .codigo)" = 2 ] \
  && ok "lo que no está en la lista cerrada se rechaza y se dice" || mal "rechazo: '$(R o-20261102-1001-aa02 .estado)' '$(R o-20261102-1003-aa04 .estado)'"
grep -q "orden o-20261102-1003-aa04: borrar-todo" "$HOME/.recolector/ciclo.log" && mal "¡ejecutó una acción fuera de la lista!" || ok "y no se intenta ejecutar"
bash "$HOME/Movil/scripts/movil/acciones.sh" 'diagnostico; touch x' >/dev/null; [ $? = 2 ] && ok "acciones.sh rechaza por su cuenta lo que no es de la lista" || mal "acciones.sh aceptó algo raro"

orden o-20261102-1004-aa05 informe; ordenes; ordenes; orden o-20261102-1005-aa06 diagnostico; ordenes
[ "$(grep -c 'orden o-20261102-1004-aa05: informe' "$HOME/.recolector/ciclo.log")" = 1 ] && [ "$(grep -c 'orden o-20261102-1000-aa01: diagnostico' "$HOME/.recolector/ciclo.log")" = 1 ] \
  && ok "cada orden se ejecuta una sola vez, aunque la rama cambie después" || mal "órdenes repetidas"
[ "$(campo .resultado)" = "sin recogida: informe pedido desde el panel" ] && [ "$(R o-20261102-1004-aa05 .estado)" = hecha ] \
  && ok "«informe» refresca estado.json en el acto" || mal "informe: '$(campo .resultado)'"
E historial.jsonl | tail -n 3 | grep -q '"orden":"o-20261102-1004-aa05"' && ok "el historial apunta qué vuelta pidió el panel" || mal "historial sin la orden"

n=$(llamadas); orden o-20261102-1006-aa07 recoger; ordenes
[ "$(llamadas)" -gt "$n" ] && [ "$(campo .motivo)" = "pedida desde el panel" ] && [ "$(R o-20261102-1006-aa07 .estado)" = hecha ] \
  && E recogidas.jsonl | tail -n1 | grep -q o-20261102-1006-aa07 \
  && ok "«recoger» recoge ya aunque no toque, y queda en recogidas.jsonl" || mal "recoger: '$(campo .motivo)' / '$(R o-20261102-1006-aa07 .estado)'"
n=$(llamadas); orden o-20261102-1007-aa08 respaldo; ordenes
[ "$(llamadas)" -eq "$n" ] && campo .resultado | grep -q "copia de respaldo" \
  && ok "«respaldo» solo hace la copia de mk2 y Arte Siete, sin tocar Yelmo" || mal "respaldo: '$(campo .resultado)'"
orden o-20261102-1008-aa09 probar-yelmo; ordenes
[ "$(R o-20261102-1008-aa09 .estado)" = hecha ] && ok "«probar-yelmo» prueba el recolector sin publicar" || mal "probar-yelmo: '$(R o-20261102-1008-aa09 .salida)'"
orden o-20261102-1009-aa10 informe "$(date -u -d '7 hours ago' +%Y-%m-%dT%H:%M:%S.000Z)"; ordenes
[ "$(R o-20261102-1009-aa10 .estado)" = caducada ] && ok "una orden de hace más de 6 h ya no se ejecuta (caducada)" || mal "caducada: '$(R o-20261102-1009-aa10 .estado)'"
( exec 9>"$HOME/.recolector/candado"; flock 9; sleep 6 ) & bloq=$!; sleep 0.5
orden o-20261102-1010-aa11 diagnostico; RECOLECTOR_ESPERA_S=1 ordenes
[ -z "$(R o-20261102-1010-aa11 .estado)" ] && ok "con una vuelta en marcha, la orden espera (nunca dos cosas a la vez)" || mal "se ejecutó con el candado tomado"
kill $bloq 2>/dev/null; wait $bloq 2>/dev/null; ordenes
[ "$(R o-20261102-1010-aa11 .estado)" = hecha ] && ok "y se hace en cuanto queda libre" || mal "la orden aplazada no se hizo"

orden o-20261102-1011-aa12 actualizar-paquetes; ordenes
[ "$(R o-20261102-1011-aa12 .estado)" = en-curso ] && ok "«actualizar-paquetes» va en segundo plano y avisa de que está en curso" || mal "actualizar: '$(R o-20261102-1011-aa12 .estado)'"
MOCK_YELMO=ok vuelta; tail -n 2 "$HOME/.recolector/ciclo.log" | grep -q "ya hay otra vuelta" && ok "mientras se actualiza, no empieza ninguna vuelta" || mal "vuelta durante la actualización"
for _ in $(seq 1 20); do [ "$(R o-20261102-1011-aa12 .estado)" = hecha ] && break; sleep 0.5; done
[ "$(R o-20261102-1011-aa12 .estado)" = hecha ] && R o-20261102-1011-aa12 .salida | grep -q "pkg upgrade" \
  && ok "y al acabar publica su resultado" || mal "actualizar sin resultado: '$(R o-20261102-1011-aa12 .estado)'"
[ "$(E ordenes-resultado.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).resultados.length))')" -le 20 ] \
  && ok "ordenes-resultado.json guarda como mucho 20" || mal "demasiados resultados"
orden o-20261102-1012-aa13 diagnostico; sh -c "cd '$O' && sed -i 's/\"diagnostico\"/\"diagnostico\",\"x\":\"-----BEGIN OPENSSH PRIVATE KEY-----\"/' ordenes.json && git commit -qam x && git push -q origin ordenes-movil"
ordenes; [ "$(R o-20261102-1012-aa13 .estado)" = hecha ] && ok "un ordenes.json con campos de más no rompe nada" || mal "campos de más"

# ── Revisión de seguridad: límites en el MÓVIL (M2), órdenes raras (L3) y
# nada que identifique en lo publicado (L1) ────────────────────────────────
rm -f "$LIM"
orden o-20261102-1100-ab01 respaldo; orden o-20261102-1101-ab02 respaldo; orden o-20261102-1102-ab03 recoger-yelmo; ordenes_tal_cual
[ "$(R o-20261102-1100-ab01 .estado)" = hecha ] && [ "$(R o-20261102-1101-ab02 .estado)" = rechazada ] && R o-20261102-1101-ab02 .salida | grep -q "demasiado pronto" \
  && [ "$(R o-20261102-1102-ab03 .estado)" = hecha ] \
  && ok "M2: el móvil aplica por su cuenta la espera de cada acción (dos «respaldo» seguidas: la segunda, rechazada y dice por qué)" \
  || mal "M2 espera: '$(R o-20261102-1101-ab02 .estado)' '$(R o-20261102-1101-ab02 .salida)'"
orden o-20261102-1103-ab04 respaldo; ordenes_tal_cual
[ "$(R o-20261102-1103-ab04 .estado)" = rechazada ] && ok "M2: y lo recuerda en su propio registro entre una pasada y otra" || mal "M2 sin memoria: '$(R o-20261102-1103-ab04 .estado)'"
node -e 'const t=Date.now()-600e3;require("fs").writeFileSync(process.argv[1],JSON.stringify(Array.from({length:10},(_,i)=>({id:"o-20261102-0900-x"+String(i).padStart(3,"0"),accion:"x",t}))))' "$LIM"
orden o-20261102-1104-ab05 informe; ordenes_tal_cual
[ "$(R o-20261102-1104-ab05 .estado)" = rechazada ] && R o-20261102-1104-ab05 .salida | grep -q "por hora" \
  && ok "M2: como mucho 10 órdenes por hora" || mal "M2 tope: '$(R o-20261102-1104-ab05 .estado)' '$(R o-20261102-1104-ab05 .salida)'"
rm -f "$LIM"
orden o-20261102-1105-ab06 actualizar-paquetes; orden o-20261102-1106-ab07 diagnostico; ordenes_tal_cual
for _ in $(seq 1 20); do [ "$(R o-20261102-1105-ab06 .estado)" = hecha ] && break; sleep 0.5; done
[ -z "$(R o-20261102-1106-ab07 .estado)" ] && ordenes_tal_cual
[ "$(R o-20261102-1105-ab06 .estado)" = hecha ] && [ "$(R o-20261102-1106-ab07 .estado)" = hecha ] \
  && ok "M2: una orden que espera tras una actualización en segundo plano no choca con su propio límite" || mal "tras actualizar: '$(R o-20261102-1106-ab07 .estado)' '$(R o-20261102-1106-ab07 .salida)'"
orden o-20261102-1107-ab08 actualizar-paquetes; ordenes_tal_cual
[ "$(R o-20261102-1107-ab08 .estado)" = rechazada ] && ok "M2: actualizar-paquetes, como mucho una al día" || mal "dos actualizaciones: '$(R o-20261102-1107-ab08 .estado)'"

rm -f "$LIM"
sh -c "cd '$O' && node -e '
  const fs=require(\"fs\"); const d=JSON.parse(fs.readFileSync(\"ordenes.json\",\"utf8\")); const ahora=new Date().toISOString();
  d.ordenes.push({id:\"o-20261102-1110-ac01\",accion:\"reiniciar-bucle\",pedida:{toString:1}});
  d.ordenes.push({id:\"o-20261102-1111-ac02\",accion:\"diagnostico\",pedida:ahora,parametros:\"x\"});
  d.ordenes.push(null, 7, {id:[\"o-20261102-1112-ac03\"],accion:\"informe\",pedida:ahora});
  d.ordenes.push({id:\"o-20261102-1113-ac04\",accion:\"informe\",pedida:ahora,parametros:{}});
  fs.writeFileSync(\"ordenes.json\",JSON.stringify({ordenes:d.ordenes.slice(-20)}));' && git commit -qam raras && git push -q origin ordenes-movil"
ordenes_tal_cual
[ "$(R o-20261102-1110-ac01 .estado)" = rechazada ] && [ "$(R o-20261102-1111-ac02 .estado)" = rechazada ] && [ "$(R o-20261102-1113-ac04 .estado)" = hecha ] \
  && ok "L3: una orden mal formada se rechaza ella sola y la buena de la misma tanda se hace" || mal "L3: '$(R o-20261102-1110-ac01 .estado)' '$(R o-20261102-1113-ac04 .estado)'"

rm -f "$LIM"; orden o-20261102-1114-ac05 diagnostico; MODELO_PRUEBA="M2002F4LG 192.168.1.37 jaime@example.com fe80::1c2b:3fff:fe4a:1" ordenes_tal_cual
MODELO_PRUEBA="M2002F4LG 192.168.1.37 jaime@example.com" MOCK_YELMO=ok vuelta
fuga=0
for f in ordenes-resultado.json registro.txt estado.json; do
  E "$f" | grep -Eq '192\.168\.1\.37|jaime@example\.com|fe80::' && { fuga=1; mal "L1: $f publica una IP o un correo"; }
done
E registro.txt | grep -q "IP omitida" && [ "$fuga" = 0 ] && ok "L1: ni el resultado, ni registro.txt, ni estado.json publican IPs ni correos" || [ "$fuga" = 1 ] || mal "L1: registro.txt sin filtrar"

# El bucle: recoge las órdenes en el minuto, se actualiza solo y se reinicia.
pkill -f "$HOME/.recolector/bucle.sh"; sleep 1; rm -f "$LIM"
cp "$HOME/Movil/scripts/movil/bucle.sh" "$HOME/.recolector/bucle.sh"
RECOLECTOR_MINUTO_S=1 RECOLECTOR_VUELTA_S=3600 nohup bash "$HOME/.recolector/bucle.sh" </dev/null >/dev/null 2>&1 &
sleep 3; pid=$(cat "$HOME/.recolector/bucle.pid")
orden o-20261102-1013-aa14 diagnostico
for _ in $(seq 1 30); do [ "$(R o-20261102-1013-aa14 .estado)" = hecha ] && break; sleep 0.5; done
[ "$(R o-20261102-1013-aa14 .estado)" = hecha ] && ok "el bucle recoge una orden en su minuto, sin esperar a la vuelta de 15" || mal "el bucle no recogió la orden"
{ head -n1 "$HOME/.recolector/bucle.sh"; echo 'touch "$HOME/.recolector/reejecutado"'; tail -n +2 "$HOME/.recolector/bucle.sh"; } > "$S/b2" && mv "$S/b2" "$HOME/.recolector/bucle.sh"
for _ in $(seq 1 20); do [ -f "$HOME/.recolector/reejecutado" ] && break; sleep 0.5; done
[ -f "$HOME/.recolector/reejecutado" ] && [ "$(cat "$HOME/.recolector/bucle.pid")" = "$pid" ] && [ "$(pgrep -fc "$HOME/.recolector/bucle.sh")" = 1 ] \
  && ok "si cambia bucle.sh, el bucle se vuelve a ejecutar con la versión nueva (mismo proceso)" || mal "el bucle no se actualizó solo"
orden o-20261102-1014-aa15 reiniciar-bucle
for _ in $(seq 1 30); do [ "$(R o-20261102-1014-aa15 .estado)" = hecha ] && break; sleep 0.5; done
sleep 1; nuevo_pid=$(cat "$HOME/.recolector/bucle.pid")
[ "$(R o-20261102-1014-aa15 .estado)" = hecha ] && [ "$nuevo_pid" != "$pid" ] && kill -0 "$nuevo_pid" 2>/dev/null && [ "$(pgrep -fc "$HOME/.recolector/bucle.sh")" = 1 ] \
  && ok "«reiniciar-bucle» deja un bucle nuevo, y solo uno" || mal "reiniciar: '$(R o-20261102-1014-aa15 .estado)' $pid→$nuevo_pid, $(pgrep -fc "$HOME/.recolector/bucle.sh") bucles"
( exec 9>"$HOME/.recolector/candado"; flock -w 5 9 ) && ok "y el bucle nuevo no se queda con el candado de las vueltas" || mal "candado secuestrado por el bucle nuevo"
pkill -f "$HOME/.recolector/bucle.sh"; sleep 1

# Un bucle de la versión anterior (sin órdenes ni pid) se cambia por el nuevo.
# (Como el de antes: toma el candado del bucle y no deja pid. Sin vueltas
# dentro, para que no se cruce con la de la prueba.)
printf '#!/bin/bash\nexec 8>"$HOME/.recolector/bucle.candado"\nflock -n 8 || exit 0\nwhile true; do sleep 900; done\n' > "$HOME/.recolector/bucle.sh"
# (Y ojo: su `sleep 900` hereda el candado; la vuelta tiene que pararlo también.)
rm -f "$HOME/.recolector/bucle.pid"
nohup bash "$HOME/.recolector/bucle.sh" </dev/null >/dev/null 2>&1 & viejo=$!; sleep 1
RECOLECTOR_SIN_BUCLE= MOCK_YELMO=ok vuelta; sleep 2
! kill -0 "$viejo" 2>/dev/null && [ -n "$(cat "$HOME/.recolector/bucle.pid" 2>/dev/null)" ] && [ "$(pgrep -fc "$HOME/.recolector/bucle.sh")" = 1 ] \
  && ok "un bucle de la versión anterior se cambia solo por el nuevo" || mal "el bucle viejo sigue ($(pgrep -fc "$HOME/.recolector/bucle.sh") bucles)"
pkill -f "$HOME/.recolector/bucle.sh"; flock -w 60 "$HOME/.recolector/candado" true; sleep 1

echo; [ $fallos -eq 0 ] && echo "Todo correcto" || { echo "$fallos FALLOS"; exit 1; }
