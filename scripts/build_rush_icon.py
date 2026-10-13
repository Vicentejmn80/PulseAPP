from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "public" / "icons"
ROOT.mkdir(parents=True, exist_ok=True)
NEON = (204, 255, 0, 255)
INK = (0, 0, 0, 255)
FONT = Path(r"C:\Windows\Fonts\arialbd.ttf")


def draw(size: int, pad: float, name: str) -> None:
    image = Image.new("RGBA", (size, size), NEON)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(FONT), int(size * (0.62 if pad == 0 else 0.46)))
    box = font.getbbox("R")
    width = box[2] - box[0]
    height = box[3] - box[1]
    x = (size - width) / 2 - box[0]
    y = (size - height) / 2 - box[1] + size * pad
    draw.text((x, y), "R", font=font, fill=INK)
    image.convert("RGB").save(ROOT / name, "PNG")


draw(180, 0, "rush-ios-180.png")
draw(192, 0, "rush-any-192.png")
draw(512, 0, "rush-any-512.png")
draw(192, 0.04, "rush-maskable-192.png")
draw(512, 0.04, "rush-maskable-512.png")
print("ok", ROOT)
