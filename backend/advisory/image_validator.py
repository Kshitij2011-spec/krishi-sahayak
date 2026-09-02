"""
image_validator.py
==================
Pre-inference validation for uploaded plant images.
Uses only Pillow (already available) — no new dependencies.

Validation checks (in order):
  1. Byte-level: minimum size (filters out 0-byte/corrupt uploads)
  2. Format check: must be decodable as an image by Pillow
  3. Dimension check: minimum 100×100 px (avoids meaningless thumbnails)
  4. Mode check: must be RGB or RGBA (rejects palette/grayscale edge cases
     that confuse the MobileNet model, which expects 3-channel input)

What this does NOT do:
  - It does not guarantee the image shows a plant leaf (that would require
    a separate classifier). It only rejects obviously invalid inputs.
  - It does not apply any transformation to the image bytes.

Returns:
  (is_valid: bool, error_message: str | None)
"""

import io
import logging

logger = logging.getLogger(__name__)

# Minimum file size in bytes — anything smaller is corrupt or empty
MIN_BYTES = 5_000        # 5 KB

# Minimum image dimensions (width × height in pixels)
MIN_DIM = 100            # both axes must be >= this

# Maximum file size we are willing to download/process
MAX_BYTES = 15_000_000   # 15 MB


def validate_image_bytes(image_bytes: bytes) -> tuple[bool, str | None]:
    """
    Validate raw image bytes before sending to the HF inference API.

    Args:
        image_bytes: raw bytes fetched from the Supabase public URL

    Returns:
        (True, None)          — image is acceptable
        (False, error_str)    — image is invalid; error_str explains why
    """
    # 1. Size bounds
    nbytes = len(image_bytes)
    if nbytes < MIN_BYTES:
        return False, (
            f"Image file is too small ({nbytes} bytes). "
            "Please upload a clear, well-lit photo of the affected leaf or crop."
        )
    if nbytes > MAX_BYTES:
        return False, (
            f"Image file is too large ({nbytes // 1_000_000} MB). "
            "Please compress the image to under 15 MB before uploading."
        )

    # 2. Decodability + format + dimensions
    try:
        from PIL import Image, UnidentifiedImageError
        img = Image.open(io.BytesIO(image_bytes))
        img.verify()  # checks for corruption without fully decoding

        # Re-open after verify (verify() leaves the file in an unusable state)
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size
        mode = img.mode

    except Exception as exc:
        logger.warning("Image decode failed: %s", exc)
        return False, (
            "The uploaded file could not be read as an image. "
            "Please upload a JPEG or PNG photograph."
        )

    # 3. Dimension check
    if width < MIN_DIM or height < MIN_DIM:
        return False, (
            f"Image resolution ({width}×{height} px) is too low. "
            "Please upload a photo of at least 100×100 pixels for reliable analysis."
        )

    # 4. Mode check — MobileNet expects RGB input
    if mode not in ("RGB", "RGBA", "L"):
        return False, (
            f"Unsupported image colour mode ({mode}). "
            "Please upload a standard colour photograph (JPEG/PNG)."
        )

    return True, None
