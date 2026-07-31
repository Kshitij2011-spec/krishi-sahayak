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
    pred_encoded = model.predict(features)[0]
    proba = model.predict_proba(features)[0]
    crop = label_encoder.inverse_transform([pred_encoded])[0]
    confidence = float(proba.max())

    # Get feature importances for reasons
    importances = model.feature_importances_
    reasons = generate_reasons(features[0], crop, importances)

    return jsonify({
        "crop": crop,
        "confidence": round(confidence, 4),
        "reasons": reasons,
    })


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


if __name__ == "__main__":
    app.run(debug=True, port=5000)
