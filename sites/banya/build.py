#!/usr/bin/env python3
"""Собирает сайт из папки src/ в один файл index.html.

Стили, скрипты, шрифты и фотографии оказываются внутри страницы, поэтому
index.html можно открыть двойным щелчком, отправить файлом или залить
на любой хостинг. Заодно текст проходит через простой типограф: короткие
предлоги и союзы не остаются в конце строки, тире не переносится в начало.

Запуск: python3 build.py
"""

import base64
import io
import pathlib
import re

try:  # Pillow необязателен: с ним фото ужимаются в WebP, без него встраиваются как есть
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "index.html"

MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
}

# Слова, которые не должны висеть в конце строки.
SHORT_WORDS = (
    "в|во|с|со|к|ко|у|о|об|и|а|но|да|на|не|ни|по|до|из|за|от|для|без|при|под|над|про|что|как"
)
SHORT_RE = re.compile(
    r"(?<![А-Яа-яЁёA-Za-z0-9\-])(" + SHORT_WORDS + r") +(?=[А-Яа-яЁёA-Za-z0-9«„(])",
    re.IGNORECASE,
)
# Куски разметки, внутри которых текст не трогаем.
SKIP_RE = re.compile(
    r"(<script\b.*?</script>|<style\b.*?</style>|<textarea\b.*?</textarea>|<title>.*?</title>|<[^>]+>)",
    re.DOTALL | re.IGNORECASE,
)


MAX_PHOTO_SIDE = 1600  # больше на сайте не нужно даже для просмотра на весь экран
BLANK_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"


def data_uri(path: pathlib.Path) -> str:
    mime = MIME[path.suffix.lower()]
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def photo_uri(path: pathlib.Path) -> str:
    """Фото для встраивания: уменьшаем до разумного размера и сжимаем в WebP."""
    if Image is None or path.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        return data_uri(path)
    with Image.open(path) as im:
        im = im.convert("RGB")
        im.thumbnail((MAX_PHOTO_SIDE, MAX_PHOTO_SIDE))
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=82, method=6)
    webp = buf.getvalue()
    if len(webp) >= path.stat().st_size:
        return data_uri(path)
    return f"data:image/webp;base64,{base64.b64encode(webp).decode('ascii')}"


def embed_photos(html: str) -> str:
    """Каждое фото кладём в страницу один раз. Повторы получают пустую
    заглушку и data-same — main.js подставит им уже встроенное фото."""
    seen = set()

    def replace(m: re.Match) -> str:
        name = m.group(1)
        if name in seen:
            return f'src="{BLANK_GIF}" data-same="{name}"'
        seen.add(name)
        return f'src="{photo_uri(SRC / "img" / name)}" data-key="{name}"'

    return re.sub(r'src="img/([^"]+)"', replace, html)


HYPHEN_RE = re.compile(r"(?<![А-Яа-яЁёA-Za-z])([А-Яа-яЁё]+-[А-Яа-яЁё]+)(?![А-Яа-яЁё])")


def typograph(text: str) -> str:
    text = HYPHEN_RE.sub(r'<span class="nw">\1</span>', text)
    text = SHORT_RE.sub(r"\1&nbsp;", text)
    text = re.sub(r" +— ", "&nbsp;— ", text)
    text = re.sub(r"(\d) (\d{3})(?!\d)", r"\1&nbsp;\2", text)
    text = re.sub(r"(\d) (₽|человек|часа|км)", r"\1&nbsp;\2", text)
    return text


def typograph_html(html: str) -> str:
    parts = SKIP_RE.split(html)
    return "".join(part if SKIP_RE.fullmatch(part) else typograph(part) for part in parts)


def main() -> None:
    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    config_js = (SRC / "config.js").read_text(encoding="utf-8")
    main_js = (SRC / "main.js").read_text(encoding="utf-8")

    html = typograph_html(html)

    # шрифты лежат прямо в файле, ждать сеть не нужно: показываем текст сразу своим шрифтом,
    # без подмены системного (она сдвигала вёрстку первого экрана)
    css = css.replace("font-display: swap;", "font-display: block;")
    css = re.sub(
        r'url\("fonts/([^"]+)"\)',
        lambda m: f'url("{data_uri(SRC / "fonts" / m.group(1))}")',
        css,
    )

    # шрифты уже внутри стилей — предзагрузка не нужна
    html = re.sub(r'\n\s*<link rel="preload"[^>]+>', "", html)
    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}</style>")
    html = html.replace('href="favicon.svg"', f'href="{data_uri(SRC / "favicon.svg")}"')
    html = embed_photos(html)
    html = html.replace(
        '<script src="config.js"></script>',
        "<script>\n/* ===== НАСТРОЙКИ САЙТА (можно править прямо здесь) ===== */\n"
        + config_js
        + "</script>",
    )
    html = html.replace('<script src="main.js"></script>', f"<script>\n{main_js}</script>")

    leftovers = re.findall(r'(?:src|href)="(?:img|fonts)/[^"]+"|<script src=|href="style\.css"', html)
    if leftovers:
        raise SystemExit(f"Не всё встроилось: {leftovers[:5]}")

    banner = "<!-- Собрано из папки src/ скриптом build.py. Правьте файлы в src/ и запускайте: python3 build.py -->\n"
    html = html.replace("<!doctype html>\n", "<!doctype html>\n" + banner, 1)
    OUT.write_text(html, encoding="utf-8")
    print(f"{OUT.name}: {OUT.stat().st_size / 1024:.0f} КБ")


if __name__ == "__main__":
    main()
