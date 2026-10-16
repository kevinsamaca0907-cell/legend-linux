#!/usr/bin/env bash
# Añade Legend Online al menú de aplicaciones del usuario (KDE, GNOME, XFCE...) con su icono.
# Solo escribe en ~/.local/share (sin sudo). Si se mueve la carpeta del cliente, hay que volver a ejecutarlo.
#   ./instalar-escritorio.sh              menú de aplicaciones
#   ./instalar-escritorio.sh --escritorio menú + acceso directo en el escritorio
#   ./instalar-escritorio.sh --quitar     quita el menú, el acceso directo y los iconos
set -euo pipefail
cd "$(dirname "$0")"
PROJ="$PWD"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
APPS="$DATA/applications"
ICONS="$DATA/icons/hicolor"
NAME=legend-linux
SIZES=(16 24 32 48 64 128 256 512)
DESK_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"

refresh() {
  command -v update-desktop-database >/dev/null && update-desktop-database -q "$APPS" || true
  command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -f -t "$ICONS" 2>/dev/null || true
  for k in kbuildsycoca6 kbuildsycoca5; do command -v "$k" >/dev/null && { "$k" >/dev/null 2>&1 || true; break; }; done
}

if [[ "${1:-}" == --quitar ]]; then
  rm -f "$APPS/$NAME.desktop" "$DESK_DIR/$NAME.desktop"
  for n in "${SIZES[@]}"; do rm -f "$ICONS/${n}x${n}/apps/$NAME.png"; done
  refresh
  echo "Legend Online quitado del menú."
  exit 0
fi

for n in "${SIZES[@]}"; do
  install -Dm644 "iconos/$NAME-$n.png" "$ICONS/${n}x${n}/apps/$NAME.png"
done

# Exec entre comillas por si la ruta tiene espacios; se escapan los caracteres especiales del formato .desktop.
exec_path="$(printf '%s' "$PROJ/run.sh" | sed -e 's/\\/\\\\\\\\/g' -e 's/["`$]/\\\\&/g')"
mkdir -p "$APPS"
cat > "$APPS/$NAME.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Legend Online
Comment=Cliente nativo de Legend Online para Linux
Exec="$exec_path"
Path=$PROJ
Icon=$NAME
Terminal=false
Categories=Game;
StartupWMClass=$NAME
Actions=ligero;

[Desktop Action ligero]
Name=Modo ligero (PC básico)
Exec="$exec_path" --ligero
DESKTOP
chmod 755 "$APPS/$NAME.desktop"
echo "Añadido al menú de aplicaciones: $APPS/$NAME.desktop"

if [[ "${1:-}" == --escritorio ]]; then
  mkdir -p "$DESK_DIR"
  install -m755 "$APPS/$NAME.desktop" "$DESK_DIR/$NAME.desktop"
  # GNOME exige marcar el lanzador como de confianza; KDE se conforma con el bit de ejecución.
  command -v gio >/dev/null && gio set "$DESK_DIR/$NAME.desktop" metadata::trusted true 2>/dev/null || true
  echo "Acceso directo en el escritorio: $DESK_DIR/$NAME.desktop"
fi
refresh
