#!/usr/bin/env bash
# Render build script for krishi-sahayak backend
# Run as: bash build.sh (set in Render → Settings → Build Command)
set -e

echo "==> Installing Python dependencies..."
pip install -r requirements.txt

echo "==> Pre-downloading MobileNetV2 disease detection model..."
python - <<'EOF'
import sys, os
# Make backend package importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from transformers import AutoModelForImageClassification
    model_id = "linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification"
    print(f"Downloading {model_id} ...")
    AutoModelForImageClassification.from_pretrained(model_id)
    print("Model downloaded and cached successfully.")
except Exception as e:
    # Don't fail the build — local_disease_model will retry at first request
    print(f"WARNING: Model pre-download failed ({e}). Will retry at runtime.")
EOF

echo "==> Build complete."
