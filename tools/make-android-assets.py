"""Генерация иконок и заставок Android из логотипа GooseText."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "icons"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

CREAM = (255, 247, 240)

icon = Image.open(SRC / "icon-512.png").convert("RGBA")
maskable = Image.open(SRC / "maskable-512.png").convert("RGBA")

# фон адаптивной иконки — угол maskable-иконки (градиент оранжевый)
bg = maskable.getpixel((4, 4))

LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

for density, size in LEGACY.items():
    out = RES / f"mipmap-{density}"
    out.mkdir(parents=True, exist_ok=True)
    resized = icon.resize((size, size), Image.LANCZOS)
    resized.save(out / "ic_launcher.png")
    resized.save(out / "ic_launcher_round.png")

for density, size in FOREGROUND.items():
    out = RES / f"mipmap-{density}"
    out.mkdir(parents=True, exist_ok=True)
    maskable.resize((size, size), Image.LANCZOS).save(out / "ic_launcher_foreground.png")

# значения цвета: иконка и заставка
(RES / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    "<resources>\n"
    f'    <color name="ic_launcher_background">#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}</color>\n'
    "</resources>\n",
    encoding="utf-8",
)

# заставка: кремовый фон и логотип по центру
SPLASH = {
    "port-mdpi": (320, 480),
    "port-hdpi": (480, 800),
    "port-xhdpi": (720, 1280),
    "port-xxhdpi": (960, 1600),
    "port-xxxhdpi": (1280, 1920),
    "land-mdpi": (480, 320),
    "land-hdpi": (800, 480),
    "land-xhdpi": (1280, 720),
    "land-xxhdpi": (1600, 960),
    "land-xxxhdpi": (1920, 1280),
}

for name, (width, height) in SPLASH.items():
    canvas = Image.new("RGBA", (width, height), CREAM + (255,))
    logo_size = int(min(width, height) * 0.28)
    logo = icon.resize((logo_size, logo_size), Image.LANCZOS)
    canvas.alpha_composite(logo, ((width - logo_size) // 2, (height - logo_size) // 2))
    folder = RES / f"drawable-{name}"
    folder.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(folder / "splash.png")

base = Image.new("RGBA", (480, 480), CREAM + (255,))
logo = icon.resize((140, 140), Image.LANCZOS)
base.alpha_composite(logo, (170, 170))
base.convert("RGB").save(RES / "drawable" / "splash.png")

print("иконки и заставки готовы")
print("фон адаптивной иконки:", f"#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}")
