"""
backend/ml/local_disease_model.py
==================================
Local CPU inference for PlantVillage MobileNetV2 disease detection.

Model: linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification
       (38-class PlantVillage, MobileNetV2 224x224)

Design:
  - Lazy-loaded on first inference request; cached in module globals.
  - Uses AutoModelForImageClassification (HF Transformers) for the model.
  - Uses explicit torchvision transforms for preprocessing — avoids the
    MobileNetV2FeatureExtractor→MobileNetV2ImageProcessor rename in
    transformers 5.x which broke AutoImageProcessor on this model.
    Transform spec matches the model's preprocessor_config.json exactly:
      resize shortest edge → 256, center-crop 224x224,
      ToTensor, Normalize mean/std = [0.5, 0.5, 0.5].
  - torch.no_grad() + model.eval() for efficiency on CPU.
  - Returns same top-1 + top-2 structure expected by app.py.
  - Raises LocalModelUnavailableError on any load/inference failure so
    the caller (app.py) can fall back to HF API or return 503 cleanly.

Usage:
    from backend.ml.local_disease_model import predict, LocalModelUnavailableError

    try:
        raw_label, score, top2_label, top2_score = predict(pil_image)
    except LocalModelUnavailableError as e:
        # torch not installed or model failed to load
        ...
"""

import logging

logger = logging.getLogger(__name__)

# ── Module-level cache ────────────────────────────────────────────────────────
_model = None
_transform = None
_load_error = None    # Stores the exception if load was attempted but failed
_load_attempted = False

MODEL_ID = "linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification"


class LocalModelUnavailableError(RuntimeError):
    """Raised when local inference is not possible (missing deps or model error)."""
    pass


def _build_transform():
    """
    Build a torchvision transform pipeline that replicates the model's
    preprocessor_config.json exactly:
      - Resize so shortest edge = 256 (BILINEAR)
      - CenterCrop to 224x224
      - ToTensor (scales [0,255] → [0,1])
      - Normalize mean=[0.5,0.5,0.5] std=[0.5,0.5,0.5]
    """
    from torchvision import transforms
    return transforms.Compose([
        transforms.Resize(256),         # shortest edge → 256
        transforms.CenterCrop(224),     # center-crop to 224x224
        transforms.ToTensor(),          # [0,255] uint8 → [0.0,1.0] float32
        transforms.Normalize(
            mean=[0.5, 0.5, 0.5],
            std=[0.5, 0.5, 0.5],
        ),
    ])


def _normalize_to_hf_format(label: str) -> str:
    """
    Convert the model's id2label human-readable format to the
    PlantVillage '___' separator format expected by _parse_hf_label in app.py.

    The local model returns labels like:
        'Tomato with Late Blight'      → 'Tomato___Late_Blight'
        'Corn (Maize) with Common Rust'→ 'Corn_(Maize)___Common_Rust'
        'Apple Healthy'                → 'Apple___healthy'
        'Apple - Healthy'              → 'Apple___healthy'

    The HF API returns labels like:
        'Tomato___Late_blight'
    """
    # Already in ___ format (e.g. if upstream changes)
    if "___" in label:
        return label

    # Format: "Crop with Disease"
    if " with " in label:
        crop_part, disease_part = label.split(" with ", 1)
        crop_norm    = crop_part.strip().replace(" ", "_")
        disease_norm = disease_part.strip().replace(" ", "_")
        return f"{crop_norm}___{disease_norm}"

    # Format: "Crop - Healthy" or "Crop Healthy"
    for suffix in [" - Healthy", " -Healthy", " Healthy"]:
        if label.endswith(suffix):
            crop_norm = label[: -len(suffix)].strip().replace(" ", "_")
            return f"{crop_norm}___healthy"

    # Unrecognised format — return as-is; _parse_hf_label will fall to else branch
    logger.warning("[LOCAL ML] Unrecognised id2label format: %r", label)
    return label


def _load_model():
    """
    Attempt to load the model and preprocessing pipeline once.
    Sets module-level _model, _transform, _load_error, _load_attempted.
    Thread safety: acceptable for Flask single-worker dev / gunicorn --preload.
    """
    global _model, _transform, _load_error, _load_attempted
    _load_attempted = True

    # 1. Check torch, torchvision, and transformers are importable
    try:
        import torch                                              # noqa: F401
        import torchvision                                       # noqa: F401
        from transformers import AutoModelForImageClassification  # noqa: F401
    except ImportError as e:
        msg = (
            f"[LOCAL ML] torch/torchvision/transformers not installed — "
            f"local inference unavailable. ({e})"
        )
        logger.warning(msg)
        print(msg)
        _load_error = LocalModelUnavailableError(
            "torch, torchvision, or transformers not installed. "
            "Run: pip install torch torchvision "
            "--index-url https://download.pytorch.org/whl/cpu "
            "&& pip install transformers Pillow"
        )
        return

    # 2. Load model weights (downloads to HF cache on first run, cached after)
    try:
        from transformers import AutoModelForImageClassification

        print(f"[LOCAL ML] Loading disease detection model: {MODEL_ID} ...")
        logger.info("[LOCAL ML] Loading disease detection model: %s", MODEL_ID)

        _model = AutoModelForImageClassification.from_pretrained(MODEL_ID)
        _model.eval()

        # Build preprocessing pipeline from known preprocessor_config.json values
        _transform = _build_transform()

        n_labels = len(_model.config.id2label)
        print(f"[LOCAL ML] Model loaded successfully — {n_labels} classes")
        logger.info("[LOCAL ML] Model loaded successfully — %d classes", n_labels)
        _load_error = None

    except Exception as e:
        msg = f"[LOCAL ML] Model load failed: {e}"
        logger.error(msg)
        print(msg)
        _load_error = LocalModelUnavailableError(f"Model load failed: {e}")


def _ensure_loaded():
    """Load model on first call; raise LocalModelUnavailableError if unavailable."""
    if not _load_attempted:
        _load_model()
    if _load_error is not None:
        raise _load_error
    if _model is None or _transform is None:
        raise LocalModelUnavailableError("Model not loaded (unknown state).")


def predict(pil_image):
    """
    Run local MobileNetV2 inference on a PIL Image.

    Parameters
    ----------
    pil_image : PIL.Image.Image
        Already-decoded and validated PIL image (any mode — converted to RGB).

    Returns
    -------
    (raw_label, score, top2_raw_label, top2_score)
        raw_label        str   e.g. 'Tomato___Late_blight'
        score            float 0.0–1.0 top-1 confidence
        top2_raw_label   str|None
        top2_score       float|None

    Raises
    ------
    LocalModelUnavailableError
        If torch/transformers are not installed or model failed to load.
    RuntimeError
        If inference itself fails unexpectedly.
    """
    import torch
    import torch.nn.functional as F

    _ensure_loaded()

    print("[LOCAL ML] Running MobileNetV2 inference")
    logger.debug("[LOCAL ML] Running MobileNetV2 inference")

    # Ensure RGB (handles RGBA / grayscale / palette images from the field)
    if pil_image.mode != "RGB":
        pil_image = pil_image.convert("RGB")

    # Preprocess via torchvision transforms → tensor shape [1, 3, 224, 224]
    tensor = _transform(pil_image).unsqueeze(0)

    # Inference — CPU, no gradient
    with torch.no_grad():
        outputs = _model(pixel_values=tensor)

    # Softmax over logits → class probabilities
    probs = F.softmax(outputs.logits, dim=-1)[0]  # shape (num_classes,)

    # Top-2 predictions
    top2_probs, top2_indices = torch.topk(probs, k=min(2, len(probs)))

    top1_idx   = top2_indices[0].item()
    top1_score = top2_probs[0].item()
    raw_label  = _normalize_to_hf_format(_model.config.id2label[top1_idx])

    top2_raw_label = None
    top2_score_val = None
    if len(top2_indices) > 1:
        top2_idx       = top2_indices[1].item()
        top2_score_val = top2_probs[1].item()
        top2_raw_label = _normalize_to_hf_format(_model.config.id2label[top2_idx])

    return raw_label, float(top1_score), top2_raw_label, (
        float(top2_score_val) if top2_score_val is not None else None
    )
