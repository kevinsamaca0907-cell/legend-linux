"""Descarga las páginas del launcher (login.php, game.php sin token) para análisis.

Uso: uv run --with curl_cffi python -I scripts/fetch_pages.py <carpeta_salida>
Solo lectura: GET con un User-Agent de navegador, sin modificar nada.
"""
import sys
from pathlib import Path

from curl_cffi import requests

BASE = "https://gamebox3.creaction-network.com/gamebox/2.4.1/template"
COMMON = "lg=es&gameid=loes&version=3.4.7.0&channel=oas"
PAGES = {
    "login.html": f"{BASE}/login.php?{COMMON}&maintype=play&page=login&account=oas&playertype=logingame",
    "common_login.html": f"{BASE}/common_login.php?{COMMON}&page=account&playertype=logingame",
    "small_load.html": f"{BASE}/small_load.php?{COMMON}&page=account&playertype=logingame",
    "game_sin_token.html": f"{BASE}/game.php?channel=oas&token=&lg=es&gameid=loes&name=&version=3.4.7.0&gamename=Legend%20Online",
}
STATIC = "https://gamebox3.creaction-network.com/gamebox/2.4.1/static"
SCRIPTS = {
    f"js/{n.rsplit('/', 1)[1]}": f"{STATIC}/{n}"
    for n in (
        "package/oas.common.js", "package/oas.lang.js", "package/oas.new.library.js",
        "package/oas.slider.js", "scripts/oas.gamebox.js", "scripts/oas.game.js",
        "scripts/oas.login.js", "scripts/oas.smallload.js",
    )
}
SCRIPTS["js/fb_login_helper.js"] = "https://gamebox3.creaction-network.com/gamebox/fb_login_helper.js"
PAGES.update(SCRIPTS)


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    s = requests.Session(impersonate="chrome")
    for name, url in PAGES.items():
        r = s.get(url, timeout=30)
        (out / name).parent.mkdir(parents=True, exist_ok=True)
        (out / name).write_bytes(r.content)
        print(f"{r.status_code} {len(r.content):>8} {name} -> {r.url}")


if __name__ == "__main__":
    main()
