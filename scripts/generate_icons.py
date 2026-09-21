"""Regenera los iconos PNG de la PWA a partir de las formas de icon.svg."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SCALE = 3


def cubic(start, control_a, control_b, end, steps=30):
    points = []
    for step in range(1, steps + 1):
        t = step / steps
        u = 1 - t
        points.append((
            u**3 * start[0] + 3 * u**2 * t * control_a[0] + 3 * u * t**2 * control_b[0] + t**3 * end[0],
            u**3 * start[1] + 3 * u**2 * t * control_a[1] + 3 * u * t**2 * control_b[1] + t**3 * end[1],
        ))
    return points


def spade_outline():
    point = (256, 102)
    path = [point]
    curves = [
        ((234, 155), (140, 206), (140, 284)),
        ((140, 335), (177, 368), (220, 368)),
        ((234, 368), (246, 364), (256, 357)),
        ((249, 386), (233, 404), (205, 410)),
    ]
    for first, second, end in curves:
        path.extend(cubic(point, first, second, end))
        point = end
    for end in [(205, 428), (307, 428), (307, 410)]:
        path.append(end)
        point = end
    curves = [
        ((279, 404), (263, 386), (256, 357)),
        ((266, 364), (278, 368), (292, 368)),
        ((335, 368), (372, 335), (372, 284)),
        ((372, 206), (278, 155), (256, 102)),
    ]
    for first, second, end in curves:
        path.extend(cubic(point, first, second, end))
        point = end
    return [(round(x * SCALE), round(y * SCALE)) for x, y in path]


canvas = Image.new("RGB", (512 * SCALE, 512 * SCALE), "#101e1b")
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle((0, 0, 512 * SCALE - 1, 512 * SCALE - 1), radius=112 * SCALE, fill="#101e1b")
draw.ellipse((62 * SCALE, 62 * SCALE, 450 * SCALE, 450 * SCALE), fill="#1b382c", outline="#dbf48c", width=10 * SCALE)
draw.polygon(spade_outline(), fill="#dbf48c")
font = ImageFont.truetype("C:/Windows/Fonts/georgiab.ttf", 108 * SCALE)
bounds = draw.textbbox((0, 0), "P", font=font)
width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
draw.text(((512 * SCALE - width) / 2 - bounds[0], 286 * SCALE - height / 2 - bounds[1]), "P", fill="#13231c", font=font)

for size, filename in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(PUBLIC / filename, optimize=True)
