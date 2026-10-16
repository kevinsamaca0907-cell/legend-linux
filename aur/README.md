# Paquete del AUR

`PKGBUILD` y `.SRCINFO` del paquete [`legend-linux`](https://aur.archlinux.org/packages/legend-linux).
Instala el cliente en `/usr/lib/legend-linux` con la misma estructura que el repositorio, el comando
`legend-linux` (enlace a `run.sh`), el `.desktop` de esta carpeta (con la acción **Modo ligero**) y los iconos.
`run.sh` guarda el perfil en `~/.local/share/legend-linux` (igual que desde el código).

Electron 11.5.0 y Flash 32.0.0.344 no se redistribuyen: el PKGBUILD los descarga de las mismas fuentes que
`instalar.sh` y los verifica con SHA-256.

## Publicar una versión

1. Sube `version` en `src/package.json` y `pkgver` en el `PKGBUILD` (vuelve `pkgrel=1`), y crea la etiqueta:
   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```
2. Pon la suma del tarball de la etiqueta (el primer `SKIP` de `sha256sums`) y regenera `.SRCINFO`:
   ```bash
   cd aur
   updpkgsums                          # paquete pacman-contrib
   makepkg --printsrcinfo > .SRCINFO
   makepkg -si                         # prueba: compila e instala
   legend-linux --probar-sandbox       # debe acabar en "Todo correcto."
   ```
3. Primera vez (necesita cuenta en aur.archlinux.org con tu clave SSH pública):
   ```bash
   git clone ssh://aur@aur.archlinux.org/legend-linux.git aur-repo
   cp PKGBUILD .SRCINFO aur-repo/ && cd aur-repo
   git add PKGBUILD .SRCINFO && git commit -m "legend-linux 0.1.0" && git push
   ```
   En las siguientes versiones: copiar los dos archivos al mismo `aur-repo`, commit y push.

> [!NOTE]
> El AUR acepta paquetes que descargan software propietario de su fuente original (como aquí Flash), pero
> los moderadores pueden pedir cambios. El `.desktop` lo coge del tarball de la etiqueta, no del repo del AUR.
