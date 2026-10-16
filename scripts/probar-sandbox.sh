#!/usr/bin/env bash
# Se ejecuta DENTRO de bubblewrap (./run.sh --probar-sandbox). Cada línea: OK = como debe ser.
fallos=0
ok()    { printf '  OK     %s\n' "$1"; }
fallo() { printf '  FALLO  %s\n' "$1"; fallos=$((fallos + 1)); }
debe_fallar() { # debe_fallar <descripción> <comando...>
  local d="$1"; shift
  if "$@" 2>/dev/null; then fallo "$d"; else ok "$d"; fi
}
debe_funcionar() {
  local d="$1"; shift
  if "$@" 2>/dev/null; then ok "$d"; else fallo "$d"; fi
}

echo "Home real ($REAL_HOME):"
debe_fallar "no se ve ~/.ssh"              test -e "$REAL_HOME/.ssh"
debe_fallar "no se ve ~/.config"           test -e "$REAL_HOME/.config"
debe_fallar "no se ven otros archivos del home" bash -c "ls -A '$REAL_HOME' | grep -qv '^\(legend-linux\|.local\|.Xauthority\)$'"
echo "Proyecto ($PROJ):"
debe_fallar "no se puede modificar run.sh"      bash -c ": >> '$PROJ/run.sh'"
debe_fallar "no se puede modificar src/main.js"  bash -c ": >> '$PROJ/src/main.js'"
debe_fallar "no se puede crear archivos en src/" touch "$PROJ/src/.prueba"
debe_fallar "no se puede modificar tools/"       bash -c ": >> '$PROJ/tools/electron-v11.5.0/electron'"
debe_funcionar "sí se puede escribir en perfil/" bash -c "touch '$PROJ/perfil/.prueba' && rm '$PROJ/perfil/.prueba'"
echo "Sistema:"
debe_fallar "no se puede escribir en /usr ni /etc" bash -c ": >> /etc/hostname || : >> /usr/bin/bash"
debe_fallar "no hay bus de sesión D-Bus"   test -e "$XDG_RUNTIME_DIR/bus"
debe_fallar "no se ve el socket de Hyprland/Wayland" bash -c "ls '$XDG_RUNTIME_DIR' | grep -q 'wayland\|hypr'"
debe_fallar "no se ven procesos del sistema" bash -c "[ \$(ls /proc | grep -c '^[0-9]') -gt 10 ]"
debe_fallar "no hay cámara (/dev/video*)"  bash -c "ls /dev/video* >/dev/null"
echo "Necesario para jugar:"
debe_funcionar "DNS resuelve el servidor del juego" bash -c "getent hosts gamebox3.creaction-network.com >/dev/null"
debe_funcionar "socket de X11 visible"          test -S "/tmp/.X11-unix/X${DISPLAY#*:}"
if [ -n "${XAUTHORITY:-}" ]; then debe_funcionar "autorización X11 legible" test -r "$XAUTHORITY"; fi
echo
if [ "$fallos" -eq 0 ]; then echo "Todo correcto."; else echo "$fallos comprobaciones fallidas."; exit 1; fi
