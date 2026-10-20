import base64
import io
import random
import secrets
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFilter

IMAGE_WIDTH = 320
IMAGE_HEIGHT = 160
PIECE_SIZE = 44


@dataclass(frozen=True, slots=True)
class CaptchaImagePair:
    target_x: int
    background: str
    piece: str


def _mix(
    start: tuple[int, int, int], end: tuple[int, int, int], ratio: float
) -> tuple[int, int, int]:
    return tuple(round(a + (b - a) * ratio) for a, b in zip(start, end, strict=True))


def _build_background(rng: random.Random) -> Image.Image:
    start = (rng.randint(170, 220), rng.randint(190, 225), rng.randint(185, 220))
    end = (rng.randint(80, 130), rng.randint(120, 170), rng.randint(120, 170))
    image = Image.new("RGB", (IMAGE_WIDTH, IMAGE_HEIGHT))
    draw = ImageDraw.Draw(image)

    for x in range(IMAGE_WIDTH):
        draw.line((x, 0, x, IMAGE_HEIGHT), fill=_mix(start, end, x / IMAGE_WIDTH))

    palette = [
        (255, 255, 255, 34),
        (18, 95, 85, 42),
        (211, 163, 67, 38),
        (44, 80, 120, 30),
    ]
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for _ in range(10):
        x = rng.randint(-40, IMAGE_WIDTH + 20)
        y = rng.randint(-30, IMAGE_HEIGHT + 20)
        radius = rng.randint(18, 70)
        overlay_draw.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            fill=rng.choice(palette),
        )
    overlay_draw.line(
        (0, rng.randint(30, 130), IMAGE_WIDTH, rng.randint(30, 130)),
        fill=(255, 255, 255, 38),
        width=2,
    )
    image = Image.alpha_composite(image.convert("RGBA"), overlay).filter(
        ImageFilter.GaussianBlur(radius=0.4)
    )
    return image.convert("RGB")


def _encode_png(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def generate_captcha_image() -> CaptchaImagePair:
    rng = random.Random(secrets.randbits(64))
    background = _build_background(rng)
    target_x = rng.randint(35, IMAGE_WIDTH - PIECE_SIZE - 24)
    target_y = (IMAGE_HEIGHT - PIECE_SIZE) // 2

    piece = background.crop(
        (target_x, target_y, target_x + PIECE_SIZE, target_y + PIECE_SIZE)
    ).convert("RGBA")
    piece_mask = Image.new("L", piece.size, 0)
    ImageDraw.Draw(piece_mask).rounded_rectangle(
        (0, 0, PIECE_SIZE - 1, PIECE_SIZE - 1), radius=8, fill=255
    )
    piece.putalpha(piece_mask)
    piece_draw = ImageDraw.Draw(piece)
    piece_draw.rounded_rectangle(
        (1, 1, PIECE_SIZE - 2, PIECE_SIZE - 2),
        radius=8,
        outline=(255, 255, 255, 210),
        width=2,
    )

    background_draw = ImageDraw.Draw(background)
    background_draw.rounded_rectangle(
        (target_x, target_y, target_x + PIECE_SIZE, target_y + PIECE_SIZE),
        radius=8,
        fill=(244, 241, 232),
        outline=(255, 255, 255),
        width=2,
    )

    return CaptchaImagePair(
        target_x=target_x,
        background=_encode_png(background),
        piece=_encode_png(piece),
    )
