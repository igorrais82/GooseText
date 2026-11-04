"""
Генерирует логотип GooseText: «гусь-буква G».

Знак: белая дуга буквы G, верхний конец которой превращается в голову гуся
с тёмным клювом. Фон — тёплый оранжевый сквиркл с градиентом и бликом.

Запуск:
  python tools/make-logo.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public" / "icons"
ASSETS = ROOT / "assets"

SS = 4  # суперсемплинг
BASE = 512
SIZE = BASE * SS

STOPS = [
    (0.0, (255, 196, 138)),   # #FFC48A
    (0.45, (249, 115, 22)),   # #F97316
    (1.0, (178, 58, 12)),     # #B23A0C
]

WHITE = (255, 255, 255, 255)
BEAK = (124, 45, 18, 255)     # #7C2D12
EYE = (124, 45, 18, 255)
BEAK_LINE = (255, 237, 213, 190)


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def gradient(size: int) -> Image.Image:
    """Диагональный градиент по трём остановкам."""
    xs = np.linspace(0, 1, size, dtype=np.float32)[None, :]
    ys = np.linspace(0, 1, size, dtype=np.float32)[:, None]
    t = xs * 0.45 + ys * 0.55

    out = np.zeros((size, size, 3), dtype=np.float32)
    for i in range(len(STOPS) - 1):
        a_pos, a_col = STOPS[i]
        b_pos, b_col = STOPS[i + 1]
        band = (t >= a_pos) & (t <= b_pos)
        local = np.clip((t - a_pos) / (b_pos - a_pos), 0, 1)
        for channel in range(3):
            value = a_col[channel] + (b_col[channel] - a_col[channel]) * local
            out[:, :, channel] = np.where(band, value, out[:, :, channel])

    data = np.clip(out, 0, 255).astype(np.uint8)
    return Image.fromarray(data, "RGB").convert("RGBA")


def shine(size: int) -> Image.Image:
    """Мягкий блик в левом верхнем углу."""
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32) / size
    dist = np.sqrt((xs - 0.28) ** 2 + (ys - 0.18) ** 2) / 0.85
    alpha = np.clip(1.0 - dist, 0, 1) ** 1.4 * 0.34
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[:, :, :3] = 255
    rgba[:, :, 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def squircle_mask(size: int, radius: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def rounded_polygon(draw: ImageDraw.ImageDraw, points, radius: float, fill) -> None:
    """Полигон со скруглёнными вершинами — клюв выглядит мягко."""
    draw.polygon(points, fill=fill)
    for x, y in points:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def draw_mark(draw: ImageDraw.ImageDraw, scale: float, offset: tuple[float, float]) -> None:
    """Рисует знак в системе координат 200×200."""
    ox, oy = offset
    sx = sy = scale

    def p(x: float, y: float) -> tuple[float, float]:
        return (ox + x * sx, oy + y * sy)

    # дуга буквы G: центр (92, 104), радиус 56, открыта сверху справа
    draw.arc([p(36, 48), p(148, 160)], start=0, end=322, fill=WHITE, width=round(25 * sx))

    # перекладина G, она же соединяет дугу с правой стойкой
    draw.rounded_rectangle([p(92, 95), p(153, 115)], radius=10 * sx, fill=WHITE)

    # клюв рисуем до головы, чтобы голова перекрыла его основание
    draw.polygon([p(140, 69), p(176, 77), p(140, 85)], fill=BEAK)

    # голова гуся на верхнем конце дуги
    draw.ellipse([p(107, 58), p(145, 96)], fill=WHITE)

    draw.line([p(148, 77), p(170, 77)], fill=BEAK_LINE, width=max(1, round(2 * sx)))

    # глаз и блик
    draw.ellipse([p(115.5, 63.5), p(122.5, 70.5)], fill=EYE)
    draw.ellipse([p(118.5, 65.0), p(121.0, 67.5)], fill=WHITE)


def compose(size: int, padding_ratio: float = 0.0, rounded: bool = True) -> Image.Image:
    """Собирает готовую иконку заданного размера."""
    big = SIZE
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    bg = gradient(big)
    if rounded:
        mask = squircle_mask(big, radius=big * 0.235)
        canvas.paste(bg, (0, 0), mask)
    else:
        canvas.paste(bg, (0, 0))

    canvas = Image.alpha_composite(canvas, shine(big))

    inner = big * (1 - padding_ratio * 2)
    offset = big * padding_ratio
    scale = inner / 200
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw_mark(draw, scale, (offset, offset))
    canvas = Image.alpha_composite(canvas, layer)
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)

    master = compose(1024)
    master.save(ROOT / "tools" / "logo-preview.png")

    compose(512).save(PUBLIC / "icon-512.png")
    compose(192).save(PUBLIC / "icon-192.png")
    compose(512, padding_ratio=0.12, rounded=False).save(PUBLIC / "maskable-512.png")

    # Windows .ico: несколько размеров, чтобы иконка была чёткой везде
    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
    compose(256).save(ASSETS / "goosetext.ico", format="ICO", sizes=ico_sizes)

    print("готово: public/icons/*, assets/goosetext.ico, tools/logo-preview.png")


if __name__ == "__main__":
    main()
