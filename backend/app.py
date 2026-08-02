"""
Krishi-Sahayak Flask API
========================
ML-only backend: crop recommendation, fertilizer dosage, pest detection (Day 3).
Everything else (advisory history, feedback, file storage) goes through Supabase directly.
"""
import os
import numpy as np
import joblib
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests


app = Flask(__name__)
CORS(app)



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


@app.route("/api/detect-pest", methods=["POST"])
def detect_pest():
    data = request.get_json(force=True)
    if "image_url" not in data:
        return jsonify({"error": "Missing image_url"}), 400

    image_url = data["image_url"]
    hf_token = os.environ.get("HF_API_TOKEN")
    if not hf_token:
        return jsonify({"error": "HF_API_TOKEN not configured"}), 500

    # Fetch image
    try:
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
        image_bytes = response.content
    except Exception as e:
        return jsonify({"error": f"Failed to fetch image: {e}"}), 400

    # Run inference via HF API
    try:
        api_url = "https://router.huggingface.co/hf-inference/models/linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification"
        headers = {
            "Authorization": f"Bearer {hf_token}",
            "Content-Type": "application/octet-stream"
        }
        
        # We send the raw image bytes
        hf_response = requests.post(api_url, headers=headers, data=image_bytes, timeout=30)
        
        # If model is loading, HF returns 503 with a specific JSON body
        if hf_response.status_code == 503:
            return jsonify({"error": "Model is loading on Hugging Face", "retry_in": hf_response.json().get("estimated_time", 20)}), 503
            
        hf_response.raise_for_status()
        results = hf_response.json()
        
        if not results or not isinstance(results, list):
            return jsonify({"error": "Unexpected response format from HF API"}), 500
            
        top_result = results[0]
        label = top_result.get("label", "Unknown")
        score = top_result.get("score", 0.0)
        
        # Determine if we should escalate
        escalate = bool(score < 0.6)
        
        # Format label to be more human readable
        human_label = label.replace("___", " - ").replace("_", " ")

        return jsonify({
            "label": human_label,
            "confidence": round(score, 4),
            "escalate": escalate
        })
    except Exception as e:
        return jsonify({"error": f"Inference failed: {e}"}), 500


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

if __name__ == "__main__":
    app.run(debug=True, port=5000)
