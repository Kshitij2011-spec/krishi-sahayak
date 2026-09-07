"""
Krishi-Sahayak Flask API
========================
ML-only backend: crop recommendation, fertilizer dosage, pest detection (Day 3).
Everything else (advisory history, feedback, file storage) goes through Supabase directly.
"""
import os
import sys
import io
import numpy as np
import joblib
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import traceback

# ── sys.path fix ─────────────────────────────────────────────────────────────
# Must happen BEFORE any 'from backend.*' import so it resolves whether Flask
# is started from the project root OR from inside backend/.
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

try:
    from dotenv import load_dotenv
    # Load backend/.env safely if it exists (for local dev)
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

# ── Optional: PIL for local inference ────────────────────────────────────────
try:
    from PIL import Image as _PIL_Image
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False

# ── Optional: local MobileNetV2 inference (torch + transformers) ──────────────
# Falls back to HF Inference API if these packages are not installed.
try:
    from backend.ml.local_disease_model import predict as _local_predict, LocalModelUnavailableError
    _LOCAL_ML_AVAILABLE = True
    print("[LOCAL ML] local_disease_model imported successfully")
except ImportError as _e:
    _LOCAL_ML_AVAILABLE = False
    _local_predict = None
    LocalModelUnavailableError = None
    print(f"[LOCAL ML] local_disease_model not available (ImportError: {_e}) — will use HF API fallback")

from backend.advisory.engine import run_advisory
from backend.extension import extension_bp
from backend.advisory.weather import get_weather_context
from backend.advisory.pest_risk import get_pest_risks
from backend.advisory.image_validator import validate_image_bytes
from backend.advisory.disease_meta import get_disease_meta

app = Flask(__name__)
app.register_blueprint(extension_bp)
# ── CORS ─────────────────────────────────────────────────────────────────────
# Explicit origin allowlist — do NOT use "*" (breaks preflight on credentialed
# requests and is rejected by some browsers on file-upload endpoints).
_CORS_ORIGINS = [
    # Production Vercel frontend
    "https://krishi-sahayak3.vercel.app",
    # Local development
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
# Allow the deployer to add extra origins via a Render environment variable
# without touching code (e.g. custom domains, preview Vercel URLs).
# Supports comma-separated values:
#   FRONTEND_URL=https://krishi-sahayak3.vercel.app,https://preview-url.vercel.app
for _extra_origin in os.environ.get("FRONTEND_URL", "").split(","):
    _extra_origin = _extra_origin.strip().rstrip("/")   # strip spaces + trailing slash
    if _extra_origin and _extra_origin not in _CORS_ORIGINS:
        _CORS_ORIGINS.append(_extra_origin)

CORS(
    app,
    origins=_CORS_ORIGINS,
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    supports_credentials=False,
    vary_header=True,
)

# ── CORS safety net for error responses ──────────────────────────────────────
# flask-cors 5.x does NOT inject CORS headers on 4xx/5xx responses, so the
# browser sees "No Access-Control-Allow-Origin" even on e.g. 503 MODEL_UNAVAILABLE.
# This after_request hook ensures the header is present on EVERY response for
# any origin in the allowlist.
@app.after_request
def _inject_cors_on_errors(response):
    origin = request.headers.get("Origin", "")
    if origin in _CORS_ORIGINS:
        # Always ensure the origin header is present (fixes 4xx/5xx responses
        # where flask-cors 5.x skips injection).
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        # For OPTIONS preflight: flask-cors 5.x sometimes omits Allow-Headers
        # causing "content-type not allowed by Access-Control-Allow-Headers".
        if request.method == "OPTIONS":
            response.headers["Access-Control-Allow-Headers"] = \
                "Content-Type, Authorization"
            response.headers["Access-Control-Allow-Methods"] = \
                "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response.headers["Access-Control-Max-Age"] = "3600"
    return response



# ---------------------------------------------------------------------------
# Load model at startup
# ---------------------------------------------------------------------------
MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")
model = None
label_encoder = None
FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]

try:
    model = joblib.load(os.path.join(MODEL_DIR, "crop_model.pkl"))
    label_encoder = joblib.load(os.path.join(MODEL_DIR, "label_encoder.pkl"))
    print(f"[OK] Model loaded - {len(label_encoder.classes_)} crop classes")
except Exception as e:
    print(f"[WARN] Model not loaded: {e}. /api/recommend-crop will return 503.")

# ---------------------------------------------------------------------------
# Ideal NPK values per crop (kg/ha) – used for fertilizer formula
# ---------------------------------------------------------------------------
IDEAL_NPK = {
    "rice":        {"N": 80, "P": 40, "K": 40},
    "maize":       {"N": 80, "P": 40, "K": 20},
    "chickpea":    {"N": 40, "P": 60, "K": 80},
    "kidneybeans": {"N": 20, "P": 60, "K": 20},
    "pigeonpeas":  {"N": 20, "P": 60, "K": 20},
    "mothbeans":   {"N": 20, "P": 40, "K": 20},
    "mungbean":    {"N": 20, "P": 40, "K": 20},
    "blackgram":   {"N": 40, "P": 60, "K": 20},
    "lentil":      {"N": 20, "P": 60, "K": 20},
    "pomegranate": {"N": 20, "P": 10, "K": 40},
    "banana":      {"N": 100, "P": 75, "K": 50},
    "mango":       {"N": 20, "P": 20, "K": 30},
    "grapes":      {"N": 20, "P": 120, "K": 200},
    "watermelon":  {"N": 100, "P": 10, "K": 50},
    "muskmelon":   {"N": 100, "P": 10, "K": 50},
    "apple":       {"N": 20, "P": 120, "K": 200},
    "orange":      {"N": 20, "P": 10, "K": 10},
    "papaya":      {"N": 50, "P": 50, "K": 50},
    "coconut":     {"N": 20, "P": 10, "K": 30},
    "cotton":      {"N": 120, "P": 40, "K": 20},
    "jute":        {"N": 80, "P": 40, "K": 40},
    "coffee":      {"N": 100, "P": 20, "K": 30},
}

# ---------------------------------------------------------------------------
# Reason templates – explain top contributing features
# ---------------------------------------------------------------------------
FEATURE_LABELS = {
    "N": "Nitrogen",
    "P": "Phosphorus",
    "K": "Potassium",
    "temperature": "Temperature",
    "humidity": "Humidity",
    "ph": "Soil pH",
    "rainfall": "Rainfall",
}

FEATURE_UNITS = {
    "N": "kg/ha",
    "P": "kg/ha",
    "K": "kg/ha",
    "temperature": "°C",
    "humidity": "%",
    "ph": "",
    "rainfall": "mm",
}


def generate_reasons(input_values, crop, importances):
    """Generate 3 human-readable reason strings based on feature importances."""
    indexed = sorted(
        zip(FEATURES, importances, input_values), key=lambda x: -x[1]
    )
    reasons = []
    for feat, imp, val in indexed[:3]:
        unit = FEATURE_UNITS[feat]
        label = FEATURE_LABELS[feat]
        val_str = f"{val:.1f}" if isinstance(val, float) else str(val)
        reasons.append(
            f"{label} level ({val_str}{' ' + unit if unit else ''}) "
            f"is well-suited for {crop} cultivation"
        )
    return reasons


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "krishi-sahayak-api",
        "model_loaded": model is not None,
    })


@app.route("/api/recommend-crop", methods=["POST"])
def recommend_crop():
    if model is None:
        return jsonify({"error": "Model not loaded"}), 503

    data = request.get_json(force=True)

    # Validate required fields
    missing = [f for f in ["n", "p", "k", "temperature", "humidity", "ph", "rainfall"] if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    try:
        features = np.array([[
            float(data["n"]),
            float(data["p"]),
            float(data["k"]),
            float(data["temperature"]),
            float(data["humidity"]),
            float(data["ph"]),
            float(data["rainfall"]),
        ]])
    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400

    # Predict
    proba = model.predict_proba(features)[0]
    top_indices = np.argsort(proba)[::-1]

    pred_encoded = top_indices[0]
    crop = label_encoder.inverse_transform([pred_encoded])[0]
    confidence = float(proba[pred_encoded])

    alt_encoded = top_indices[1]
    alt_crop = label_encoder.inverse_transform([alt_encoded])[0]
    alt_confidence = float(proba[alt_encoded])

    # Get feature importances for reasons
    importances = model.feature_importances_
    reasons = generate_reasons(features[0], crop, importances)

    response_data = {
        "crop": crop,
        "confidence": round(confidence, 4),
        "reasons": reasons,
    }

    if confidence < 0.7:
        response_data["alternative"] = {
            "crop": alt_crop,
            "confidence": round(alt_confidence, 4)
        }

    return jsonify(response_data)


@app.route("/api/fertilizer", methods=["POST"])
def fertilizer():
    data = request.get_json(force=True)

    missing = [f for f in ["crop", "n", "p", "k"] if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    crop = data["crop"].lower().strip()
    try:
        n_actual = float(data["n"])
        p_actual = float(data["p"])
        k_actual = float(data["k"])
    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400

    ideal = IDEAL_NPK.get(crop)
    if not ideal:
        # Fallback to a generic recommendation
        ideal = {"N": 60, "P": 40, "K": 30}

    # Calculate deficit and convert to fertilizer bags
    # Urea = 46% N, DAP = 46% P2O5 (≈20% P), MOP = 60% K2O (≈50% K)
    n_deficit = max(0, ideal["N"] - n_actual)
    p_deficit = max(0, ideal["P"] - p_actual)
    k_deficit = max(0, ideal["K"] - k_actual)

    # Convert kg/ha to kg/acre (1 ha ≈ 2.47 acres)
    urea_kg_acre = round((n_deficit / 0.46) / 2.47, 1)
    dap_kg_acre = round((p_deficit / 0.20) / 2.47, 1)
    mop_kg_acre = round((k_deficit / 0.50) / 2.47, 1)

    return jsonify({
        "crop": crop,
        "urea_kg_acre": urea_kg_acre,
        "dap_kg_acre": dap_kg_acre,
        "mop_kg_acre": mop_kg_acre,
        "note": f"Based on soil deficit from ideal NPK for {crop}. "
                f"N deficit: {n_deficit:.0f}, P deficit: {p_deficit:.0f}, K deficit: {k_deficit:.0f} kg/ha.",
    })


# ---------------------------------------------------------------------------
# Confidence tier thresholds for /api/detect-pest
# ---------------------------------------------------------------------------
# HIGH   : score >= 0.75 → present as a diagnosis
# MEDIUM : 0.45 <= score < 0.75 → caution; suggest retaking image
# LOW    : score < 0.45 → escalate to agriculture officer
#
# Rationale: The MobileNet model was trained on PlantVillage lab-condition
# images. Field photos taken by farmers are lower quality, so a higher
# threshold than typical (0.75 vs 0.60) is appropriate before presenting
# a result as a reliable diagnosis.
# ---------------------------------------------------------------------------
_CONF_HIGH   = 0.75
_CONF_MEDIUM = 0.45


def _parse_hf_label(raw_label: str) -> tuple[str, str, str]:
    """
    Parse a PlantVillage-style label into components.

    Input:  'Tomato___Late_blight'
    Output: (human_label, crop_name, disease_name)
            ('Tomato - Late blight', 'tomato', 'Late blight')
    """
    if "___" in raw_label:
        parts = raw_label.split("___", 1)
        crop_raw    = parts[0].replace("_", " ").strip()
        disease_raw = parts[1].replace("_", " ").strip()
        human_label = f"{crop_raw} - {disease_raw}"
        return human_label, crop_raw.lower(), disease_raw
    else:
        human_label = raw_label.replace("_", " ")
        return human_label, "unknown", human_label


@app.route("/api/detect-pest", methods=["POST"])
def detect_pest():
    """
    Disease / pest detection via HF MobileNet model.

    Request (JSON):
        image_url   str   required  Supabase public URL of the uploaded image
        latitude    float optional
        longitude   float optional
        trap_count  int   optional
        crop_stage  str   optional

    Response (backward-compatible — existing fields preserved):
        label              str    Human-readable 'Crop - Disease'
        confidence         float  0.0–1.0
        escalate           bool   True when confidence < HIGH threshold
        forecast           dict   IPM data from pest_risk.json
        --- new fields ---
        crop               str    Detected crop name
        disease            str    Detected disease/condition name
        confidence_tier    str    'high' | 'medium' | 'low'
        severity           str    'None'|'Low'|'Medium'|'High'|'Unknown'
        explanation        str    Plain-language description of the condition
        is_healthy         bool   True when label contains 'healthy'
        validation_note    str|null  Set if image quality warning was issued
    """
    data = request.get_json(force=True)
    if "image_url" not in data:
        return jsonify({"error": "Missing image_url"}), 400

    image_url = data["image_url"]

    # ── Step 1: Fetch image bytes ────────────────────────────────────────
    try:
        img_response = requests.get(image_url, timeout=10)
        img_response.raise_for_status()
        image_bytes = img_response.content
    except Exception as e:
        return jsonify({"error": f"Failed to fetch image: {e}"}), 400

    # ── Step 2: Image validation (pre-inference) ─────────────────────────
    is_valid, validation_error = validate_image_bytes(image_bytes)
    if not is_valid:
        return jsonify({
            "error": "image_validation_failed",
            "message": validation_error,
        }), 422

    # ── Step 3: Inference — local MobileNetV2 first, HF API fallback ─────
    #
    # PRIMARY: local CPU inference via backend.ml.local_disease_model
    #   - zero HF inference credits
    #   - requires torch + transformers installed locally
    # FALLBACK: remote HF Inference API
    #   - used when torch/transformers not available (e.g. Render free tier)
    #   - requires HF_API_TOKEN env var
    # ---------------------------------------------------------------------------
    raw_label = None
    score = 0.0
    top2_results = None   # dict-like with 'label' and 'score' keys, or None

    # --- Try local inference ---
    _used_local = False
    if _LOCAL_ML_AVAILABLE and _PIL_AVAILABLE:
        try:
            pil_image = _PIL_Image.open(io.BytesIO(image_bytes))
            raw_label, score, top2_raw_label, top2_score_val = _local_predict(pil_image)
            if top2_raw_label is not None:
                top2_results = {"label": top2_raw_label, "score": top2_score_val}
            _used_local = True
        except LocalModelUnavailableError as e:
            # torch not installed or model failed to load — fall through to HF API
            app.logger.warning("[LOCAL ML] Unavailable, falling back to HF API: %s", e)
        except Exception as e:
            # Unexpected inference error — fall through to HF API
            app.logger.warning("[LOCAL ML] Inference error, falling back to HF API: %s", e)

    # --- Fallback: HF Inference API ---
    if not _used_local:
        hf_token = os.environ.get("HF_API_TOKEN")
        if not hf_token:
            return jsonify({
                "status": "error",
                "error_code": "MODEL_UNAVAILABLE",
                "message": (
                    "Local disease detection model is temporarily unavailable "
                    "and HF_API_TOKEN is not configured. "
                    "Please install torch and transformers for local inference."
                ),
            }), 503
        try:
            api_url = (
                "https://router.huggingface.co/hf-inference/models/"
                "linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification"
            )
            headers = {
                "Authorization": f"Bearer {hf_token}",
                "Content-Type": "application/octet-stream",
            }
            hf_response = requests.post(
                api_url, headers=headers, data=image_bytes, timeout=30
            )
            if hf_response.status_code == 503:
                return jsonify({
                    "status": "error",
                    "error_code": "MODEL_UNAVAILABLE",
                    "message": "Disease detection model is temporarily unavailable. Please try again shortly.",
                    "retry_in": hf_response.json().get("estimated_time", 20),
                }), 503
            hf_response.raise_for_status()
            results = hf_response.json()
            if not results or not isinstance(results, list):
                return jsonify({"error": "Unexpected response format from HF API"}), 500
            raw_label    = results[0].get("label", "Unknown")
            score        = results[0].get("score", 0.0)
            top2_results = results[1] if len(results) > 1 else None
        except Exception as e:
            return jsonify({
                "status": "error",
                "error_code": "MODEL_UNAVAILABLE",
                "message": "Disease detection is temporarily unavailable. Please try again later.",
            }), 503

    if raw_label is None:
        return jsonify({
            "status": "error",
            "error_code": "MODEL_UNAVAILABLE",
            "message": "Local disease detection model is temporarily unavailable.",
        }), 503

    # ── Step 4: Parse label ───────────────────────────────────────────────
    human_label, detected_crop, disease_name = _parse_hf_label(raw_label)
    is_healthy = "healthy" in disease_name.lower()

    # ── Step 5: Three-tier confidence classification ──────────────────────
    if score >= _CONF_HIGH:
        confidence_tier = "high"
        escalate        = False
    elif score >= _CONF_MEDIUM:
        confidence_tier = "medium"
        escalate        = True   # show caution; do not present as firm diagnosis
    else:
        confidence_tier = "low"
        escalate        = True   # escalate to agriculture officer

    # ── Step 6: Disease metadata (severity + explanation) ─────────────────
    # Healthy crops get special handling
    if is_healthy:
        disease_meta = {
            "severity": "None",
            "explanation": "The crop appears healthy. No signs of disease or pest damage detected.",
            "matched_key": "healthy",
        }
    else:
        disease_meta = get_disease_meta(disease_name)

    # ── Step 7: Image quality warning (post-inference) ────────────────────
    # Even if validation passed, a low-confidence result may indicate a
    # poor-quality field photo. Surface this as a validation_note.
    validation_note = None
    if confidence_tier == "low":
        validation_note = (
            "The model could not confidently identify a condition in this image. "
            "This may be due to image angle, lighting, or because the image does not "
            "show a plant leaf clearly. Please try again with a closer, well-lit photo."
        )
    elif confidence_tier == "medium":
        validation_note = (
            "The model detected a possible condition but with moderate confidence. "
            "For a more reliable result, take a close-up photo of the affected leaf "
            "in good lighting."
        )

    # ── Step 8: Fetch weather + IPM (unchanged from original) ────────────
    latitude   = data.get("latitude")
    longitude  = data.get("longitude")
    trap_count = data.get("trap_count")
    crop_stage = data.get("crop_stage")

    weather_context = None
    if latitude and longitude:
        weather_context = get_weather_context(
            {"latitude": latitude, "longitude": longitude}
        )

    pest_risk_context = get_pest_risks(
        crop=detected_crop,
        state="Maharashtra",
        district="Unknown",
        season="kharif",
        weather_context=weather_context,
        trap_count=trap_count,
        crop_stage=crop_stage,
    )

    # ── Step 9: Build response (backward-compatible + enriched) ──────────
    return jsonify({
        # ── Original fields (unchanged) ──
        "label":      human_label,
        "confidence": round(score, 4),
        "escalate":   escalate,
        "forecast":   pest_risk_context,
        # ── New enriched fields ──
        "crop":             detected_crop,
        "disease":          disease_name if not is_healthy else "Healthy",
        "confidence_tier":  confidence_tier,
        "severity":         disease_meta["severity"],
        "explanation":      disease_meta["explanation"],
        "is_healthy":       is_healthy,
        "validation_note":  validation_note,
        "top2_label":       (
            _parse_hf_label(top2_results["label"])[0]
            if top2_results else None
        ),
        "top2_confidence":  (
            round(top2_results["score"], 4)
            if top2_results else None
        ),
    })


import datetime
import random

@app.route("/api/mandi-price", methods=["POST"])
def mandi_price():
    data = request.get_json(force=True)
    if not data or "commodity" not in data or "district" not in data:
        return jsonify({"error": "Missing commodity or district"}), 400

    commodity = data["commodity"]
    district = data["district"]

    api_key = os.environ.get("DATA_GOV_IN_API_KEY")
    if api_key:
        url = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
        params = {
            "api-key": api_key,
            "format": "json",
            "filters[commodity]": commodity,
            "filters[district]": district
        }
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            api_data = response.json()
            if api_data.get("records"):
                record = api_data["records"][0]
                return jsonify({
                    "commodity": record.get("commodity", commodity),
                    "district": record.get("district", district),
                    "min_price": record.get("min_price"),
                    "max_price": record.get("max_price"),
                    "modal_price": record.get("modal_price"),
                    "arrival_date": record.get("arrival_date"),
                    "is_fallback": False
                })
        except Exception as e:
            print(f"Agmarknet API failed: {e}")
            pass

    # Fallback stub
    base_price = {"Wheat": 2200, "Cotton": 7000, "Paddy (Rice)": 2100}.get(commodity, 2000)
    variance = random.randint(-100, 100)
    modal = base_price + variance
    return jsonify({
        "commodity": commodity,
        "district": district,
        "min_price": modal - 150,
        "max_price": modal + 200,
        "modal_price": modal,
        "arrival_date": datetime.date.today().strftime("%d/%m/%Y"),
        "is_fallback": True
    })

@app.route("/api/v2/advisory", methods=["POST"])
def advisory_v2():
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400

    if not isinstance(data, dict):
        return jsonify({"status": "error", "message": "JSON body must be an object"}), 400

    try:
        result = run_advisory(data)
        if result.get("status") == "error":
            return jsonify(result), 400
        return jsonify(result), 200
    except Exception as e:
        # Log safely, do not expose internal details
        app.logger.error("Unexpected error in /api/v2/advisory: %s", str(e))
        return jsonify({"status": "error", "message": "Unable to process advisory request."}), 500


# ---------------------------------------------------------------------------
# /api/crop-risk  — Proactive risk assessment WITHOUT image upload
# ---------------------------------------------------------------------------
# Scoring formula (deterministic, no ML inference):
#
#   1. Base score from static `likelihood` in pest_risk.json:
#        high → 50  |  medium → 30  |  low → 15
#
#   2. Alert-level bonus derived from the weather + trap evaluation
#      already performed by pest_risk.py (not re-evaluated here):
#        "Severe Alert"   → +30
#        "Moderate Alert" → +15
#        "Low Alert"      → +0
#
#   3. Crop-stage adjustment — PROTOTYPE HEURISTIC only.
#      Not scientifically validated per-crop. Reflects general
#      entomological principle that flowering/pod stages see higher
#      pest pressure on many field crops:
#        flowering / fruiting → +10
#        vegetative           → +5
#        seedling             → +5
#        none / unknown       → +0
#
#   Final score = min(100, base + alert_bonus + stage_bonus)
#   Severity label: <40 Low | 40-69 Moderate | 70-89 High | >=90 Critical
# ---------------------------------------------------------------------------

_LIKELIHOOD_BASE = {"high": 50, "medium": 30, "low": 15}
_ALERT_BONUS = {"Severe Alert": 30, "Moderate Alert": 15, "Low Alert": 0}

# PROTOTYPE HEURISTIC — generic across crops, not crop-specific validated data
_STAGE_BONUS = {
    "flowering": 10,
    "fruiting":  10,
    "vegetative": 5,
    "seedling":   5,
}


def _severity_label(score: int) -> str:
    if score >= 90:
        return "Critical"
    if score >= 70:
        return "High"
    if score >= 40:
        return "Moderate"
    return "Low"


@app.route("/api/crop-risk", methods=["POST"])
def crop_risk():
    """
    Proactive early risk assessment — no image required.

    Request body (JSON):
        crop        str   required   e.g. "cotton"
        crop_stage  str   optional   seedling | vegetative | flowering | fruiting
        trap_count  int   optional   pheromone trap catch count
        latitude    float optional   decimal degrees
        longitude   float optional   decimal degrees
        season      str   optional   kharif | rabi | perennial (default: kharif)

    Response:
        risk_score        int     0–100  (prototype score — see scoring note in code)
        severity          str     Low | Moderate | High | Critical
        reasons           list    one entry per factor that changed the score
        risks             list    raw IPM data from pest_risk.json
        recommended_action str
        weather_context   dict    from Open-Meteo, or unavailable
        score_note        str     disclaimer on prototype nature
    """
    data = request.get_json(force=True) or {}

    crop = data.get("crop", "").strip().lower()
    if not crop:
        return jsonify({"error": "Missing required field: crop"}), 400

    crop_stage = (data.get("crop_stage") or "").strip().lower() or None
    season = (data.get("season") or "kharif").strip().lower()
    trap_count_raw = data.get("trap_count")
    trap_count = int(trap_count_raw) if trap_count_raw is not None else None
    latitude  = data.get("latitude")
    longitude = data.get("longitude")
    location_is_approximate = data.get("location_is_approximate", False)

    # 1. Fetch weather (uses real or approximate coordinates passed by caller)
    weather_context = None
    if latitude is not None and longitude is not None:
        weather_context = get_weather_context({"latitude": latitude, "longitude": longitude})
    else:
        weather_context = {"status": "unavailable", "reason": "no_coordinates_provided"}

    # 2. Look up risks (pest_risk.py computes alert_level from weather + trap internally)
    risk_result = get_pest_risks(
        crop=crop,
        state="Maharashtra",
        district="Unknown",
        season=season,
        weather_context=weather_context,
        trap_count=trap_count,
        crop_stage=crop_stage,
    )

    # 3. Score — derived from risk_result output, NOT re-evaluating raw inputs
    risks = risk_result.get("risks", [])
    reasons = []
    score = 0

    if not risks:
        # No data for this crop/season — return an explicit no-data response
        return jsonify({
            "risk_score": None,
            "severity": None,
            "reasons": [],
            "risks": [],
            "recommended_action": "No verified risk data is available for this crop in Maharashtra. Monitor crops regularly and consult your local KVK.",
            "weather_context": weather_context,
            "score_note": "Risk data coverage is limited to cotton, soybean, and sugarcane (kharif/perennial) in Maharashtra for this prototype.",
            "status": "no_data",
        }), 200

    # Compute max score across all risks (report worst-case)
    best_score = 0
    best_risk = None
    for risk in risks:
        likelihood = risk.get("likelihood", "low")
        alert_level = risk.get("current_alert_level", "Low Alert")

        base = _LIKELIHOOD_BASE.get(likelihood, 15)
        alert_bonus = _ALERT_BONUS.get(alert_level, 0)
        stage_bonus = _STAGE_BONUS.get(crop_stage, 0) if crop_stage else 0

        s = min(100, base + alert_bonus + stage_bonus)
        if s > best_score:
            best_score = s
            best_risk = risk
            # Build reasons for this risk (what actually contributed)
            _reasons = []
            _reasons.append(
                f"Static data indicates '{likelihood}' likelihood for {risk.get('risk_name', crop)} in Maharashtra (kharif)."
            )
            if alert_level == "Moderate Alert":
                wc = weather_context.get("current", {}) if weather_context else {}
                temp = wc.get("temperature_c")
                hum  = wc.get("humidity_pct")
                if temp and hum:
                    _reasons.append(
                        f"Current weather ({temp}°C, {hum}% humidity) falls within the risk window for this pest."
                    )
                else:
                    _reasons.append("Weather conditions match the risk window for this pest.")
            elif alert_level == "Severe Alert":
                tc_threshold = risk.get("etl", {}).get("trap_count_threshold")
                if tc_threshold is not None and trap_count is not None:
                    _reasons.append(
                        f"Trap count ({trap_count}) meets or exceeds ETL threshold ({tc_threshold})."
                    )
                else:
                    _reasons.append("Trap count has reached the economic threshold level (ETL).")
            if stage_bonus > 0 and crop_stage:
                _reasons.append(
                    f"Crop is in {crop_stage} stage — a typically higher-pressure period for many field crops "
                    f"(prototype heuristic, not crop-specific validated data)."
                )

    reasons = _reasons if '_reasons' in dir() else []
    score = best_score

    # 4. Recommended action based on severity
    severity = _severity_label(score)
    action_map = {
        "Critical": "Immediate field inspection required. Consult your KVK or district agriculture officer. Consider IPM interventions.",
        "High":     "Increase monitoring frequency. Set additional pheromone traps. Review IPM options below.",
        "Moderate": "Monitor weekly. Check for early signs listed below. No chemical intervention yet.",
        "Low":      "Routine monitoring is sufficient. No immediate action required.",
    }
    recommended_action = action_map.get(severity, "Routine monitoring recommended.")

    # 5. Location note
    location_note = None
    if location_is_approximate:
        location_note = "Weather data is based on approximate district coordinates, not your exact farm location."
    elif latitude is None:
        location_note = "No location provided — weather-based adjustments were not applied."

    return jsonify({
        "risk_score": score,
        "severity": severity,
        "reasons": reasons,
        "risks": risks,
        "recommended_action": recommended_action,
        "weather_context": weather_context,
        "location_note": location_note,
        "score_note": (
            "This is a prototype early risk assessment based on static IPM data, weather, "
            "and trap counts — not a machine-learning prediction. Use as a planning aid only."
        ),
        "status": "ok",
    }), 200


# ============================================================================
# Phase 7 — Farmer → Agriculture Officer Request System
# ============================================================================
#
# Security model:
#   - Flask backend holds SUPABASE_SERVICE_KEY (never sent to browser)
#   - Farmer submits requests via POST; gets back opaque reference_code (KR-XXXXXX)
#   - Farmer checks status via GET /<reference_code> — no listing of all requests
#   - Officer reads/updates via header X-Officer-Token: <OFFICER_PASSWORD>
#   - Status transitions: pending → in_review → responded → closed
#   - report_id is integer FK to pest_reports (SERIAL PK), nullable
# ============================================================================

import uuid as _uuid

# ── Lazy Supabase admin client ────────────────────────────────────────────────
_sb_admin = None

def _get_supabase_admin():
    """
    Return a Supabase admin client (service-role key).
    Lazily initialised on first use. Returns None if env vars are missing.
    NEVER expose SUPABASE_SERVICE_KEY to the browser.
    """
    global _sb_admin
    if _sb_admin is not None:
        return _sb_admin
    url  = os.environ.get("SUPABASE_URL")
    key  = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        app.logger.warning(
            "[officer_requests] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — "
            "officer request endpoints will return 503."
        )
        return None
    try:
        from supabase import create_client as _sb_create
        _sb_admin = _sb_create(url, key)
        app.logger.info("[officer_requests] Supabase admin client initialised.")
    except Exception as e:
        app.logger.error("[officer_requests] Failed to init Supabase admin client: %s", e)
        return None
    return _sb_admin


# ── Constants ─────────────────────────────────────────────────────────────────
_OFFICER_PASSWORD  = "admin123"          # Matches existing MVP dashboard auth
_OFFICER_ID_MVP    = "officer_001"
_VALID_STATUSES    = ("pending", "in_review", "responded", "closed")
_MAX_MSG_LEN       = 1000
_VALID_CROPS_SET   = {
    "tomato", "potato", "corn", "grape", "pepper", "apple",
    "cotton", "rice", "wheat", "sugarcane", "chickpea",
    "groundnut", "jowar", "bajra", "tur", "moong", "soybean",
}


def _make_reference_code():
    """Generate opaque farmer-facing reference: KR-XXXXXX (6 uppercase hex chars)."""
    return "KR-" + _uuid.uuid4().hex[:6].upper()


def _check_officer_token():
    """Return True if request carries a valid officer token."""
    return request.headers.get("X-Officer-Token", "") == _OFFICER_PASSWORD


def _supabase_unavailable():
    return jsonify({
        "status": "error",
        "error_code": "SERVICE_UNAVAILABLE",
        "message": "Officer request service is temporarily unavailable.",
    }), 503


# ── POST /api/officer-requests — farmer submits a request ────────────────────
@app.route("/api/officer-requests", methods=["POST"])
def create_officer_request():
    sb = _get_supabase_admin()
    if sb is None:
        return _supabase_unavailable()

    data = request.get_json(force=True) or {}

    # 1. Validate farmer_message
    farmer_message = (data.get("farmer_message") or "").strip()
    if not farmer_message:
        return jsonify({"status": "error", "message": "farmer_message is required."}), 400
    if len(farmer_message) > _MAX_MSG_LEN:
        return jsonify({"status": "error", "message": f"Message too long (max {_MAX_MSG_LEN} chars)."}), 400

    # 2. Validate crop (optional)
    crop_raw = (data.get("crop") or "").strip().lower()
    crop = crop_raw if crop_raw else None

    # 3. Resolve report details from existing pest_report if report_id given
    report_id_raw = data.get("report_id")
    report_id = None
    disease = None
    confidence_score = None
    confidence_tier = None
    severity = None
    district = None
    latitude = None
    longitude = None
    location_is_approximate = True

    if report_id_raw:
        try:
            report_id = int(report_id_raw)
        except (TypeError, ValueError):
            return jsonify({"status": "error", "message": "Invalid report_id."}), 400

        # Fetch the actual report to get trusted AI values (farmer cannot fake these)
        try:
            resp = sb.table("pest_reports").select(
                "id,crop,disease,confidence_score,confidence_tier,severity,"
                "district,latitude,longitude,location_is_approximate"
            ).eq("id", report_id).single().execute()
            if resp.data:
                r = resp.data
                crop              = r.get("crop") or crop
                disease           = r.get("disease")
                confidence_score  = r.get("confidence_score")
                confidence_tier   = r.get("confidence_tier")
                severity          = r.get("severity")
                district          = r.get("district")
                latitude          = r.get("latitude")
                longitude         = r.get("longitude")
                location_is_approximate = r.get("location_is_approximate", True)
        except Exception as e:
            app.logger.warning("[officer_requests] Could not fetch pest_report %s: %s", report_id, e)
            # Non-fatal — proceed without AI values

    # 4. Check for duplicate active request for this report
    if report_id:
        try:
            dup = sb.table("officer_requests").select("id,status").eq("report_id", report_id).execute()
            if dup.data:
                for row in dup.data:
                    if row.get("status") in ("pending", "in_review"):
                        return jsonify({
                            "status": "error",
                            "error_code": "DUPLICATE_REQUEST",
                            "message": "An active officer request already exists for this report.",
                        }), 409
        except Exception as e:
            app.logger.warning("[officer_requests] Duplicate check failed: %s", e)

    # 5. Generate opaque reference code
    ref_code = _make_reference_code()

    # 6. Insert
    row = {
        "reference_code":          ref_code,
        "report_id":               report_id,
        "crop":                    crop,
        "disease":                 disease,
        "confidence_score":        confidence_score,
        "confidence_tier":         confidence_tier,
        "severity":                severity,
        "district":                district,
        "latitude":                latitude,
        "longitude":               longitude,
        "location_is_approximate": location_is_approximate,
        "farmer_message":          farmer_message,
        "status":                  "pending",
    }
    try:
        ins = sb.table("officer_requests").insert(row).execute()
        new_id = ins.data[0]["id"] if ins.data else None
    except Exception as e:
        app.logger.error("[officer_requests] Insert failed: %s", e)
        return jsonify({
            "status": "error",
            "message": "Could not save your request. Please try again.",
        }), 500

    return jsonify({
        "status": "success",
        "request_id": new_id,
        "reference_code": ref_code,
        "message": "Your request has been sent to an agriculture officer.",
    }), 201


# ── GET /api/officer-requests/<reference_code> — farmer checks status ────────
@app.route("/api/officer-requests/<reference_code>", methods=["GET"])
def get_officer_request_status(reference_code):
    # Basic sanity check on format
    import re as _re
    if not _re.match(r'^KR-[A-F0-9]{6}$', reference_code):
        return jsonify({"status": "error", "message": "Request not found."}), 404

    sb = _get_supabase_admin()
    if sb is None:
        return _supabase_unavailable()

    try:
        resp = sb.table("officer_requests").select(
            "reference_code,crop,disease,confidence_score,confidence_tier,"
            "severity,district,farmer_message,status,officer_notes,created_at,reviewed_at"
        ).eq("reference_code", reference_code).single().execute()
    except Exception as e:
        app.logger.error("[officer_requests] Fetch by ref_code failed: %s", e)
        return jsonify({"status": "error", "message": "Request not found."}), 404

    if not resp.data:
        return jsonify({"status": "error", "message": "Request not found."}), 404

    # Never return officer_id or internal id to the farmer
    return jsonify({"status": "ok", "request": resp.data}), 200


# ── GET /api/officer-requests?officer=1 — officer lists all requests ─────────
@app.route("/api/officer-requests", methods=["GET"])
def list_officer_requests():
    if not _check_officer_token():
        return jsonify({"status": "error", "message": "Unauthorized."}), 401

    sb = _get_supabase_admin()
    if sb is None:
        return _supabase_unavailable()

    status_filter = request.args.get("status", "").strip().lower()

    try:
        query = sb.table("officer_requests").select("*").order("created_at", desc=True)
        if status_filter and status_filter in _VALID_STATUSES:
            query = query.eq("status", status_filter)
        resp = query.execute()
    except Exception as e:
        app.logger.error("[officer_requests] List failed: %s", e)
        return jsonify({"status": "error", "message": "Failed to load requests."}), 500

    return jsonify({"status": "ok", "requests": resp.data or []}), 200


# ── PATCH /api/officer-requests/<request_id> — officer updates status/notes ──
@app.route("/api/officer-requests/<int:request_id>", methods=["PATCH"])
def update_officer_request(request_id):
    if not _check_officer_token():
        return jsonify({"status": "error", "message": "Unauthorized."}), 401

    sb = _get_supabase_admin()
    if sb is None:
        return _supabase_unavailable()

    data = request.get_json(force=True) or {}

    # Validate new status
    new_status = (data.get("status") or "").strip().lower()
    if new_status and new_status not in _VALID_STATUSES:
        return jsonify({"status": "error", "message": f"Invalid status '{new_status}'."}), 400

    officer_notes = data.get("officer_notes")
    if officer_notes is not None:
        officer_notes = str(officer_notes).strip()[:2000]

    # Build update payload
    patch = {"officer_id": _OFFICER_ID_MVP}
    if new_status:
        patch["status"] = new_status
    if officer_notes is not None:
        patch["officer_notes"] = officer_notes

    # Set reviewed_at when first leaving pending
    if new_status and new_status != "pending":
        # Only set reviewed_at if not already set
        try:
            existing = sb.table("officer_requests").select("status,reviewed_at") \
                .eq("id", request_id).single().execute()
            if existing.data and not existing.data.get("reviewed_at"):
                patch["reviewed_at"] = datetime.datetime.utcnow().isoformat() + "Z"
        except Exception:
            pass

    try:
        resp = sb.table("officer_requests").update(patch).eq("id", request_id).execute()
        if not resp.data:
            return jsonify({"status": "error", "message": "Request not found."}), 404
    except Exception as e:
        app.logger.error("[officer_requests] Update failed: %s", e)
        return jsonify({"status": "error", "message": "Failed to update request."}), 500

    return jsonify({"status": "ok", "updated": resp.data[0] if resp.data else {}}), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)

