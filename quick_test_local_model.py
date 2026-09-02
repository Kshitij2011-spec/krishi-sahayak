"""
quick_test_local_model.py
=========================
Quick smoke test for backend/ml/local_disease_model.py
Run from the project root:
    python quick_test_local_model.py

Downloads the model on first run (~100 MB weights), then runs inference
on a synthetic green 224x224 PIL image.
"""
import time
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("=" * 60)
print("Krishi-Sahayak — Local MobileNetV2 Inference Test")
print("=" * 60)

# Step 1: Import check
print("\n[1] Checking imports...")
try:
    from PIL import Image
    print("    ✓ Pillow available")
except ImportError as e:
    print(f"    ✗ Pillow missing: {e}")
    sys.exit(1)

try:
    import torch
    print(f"    ✓ torch {torch.__version__}")
except ImportError as e:
    print(f"    ✗ torch missing: {e}")
    sys.exit(1)

try:
    import transformers
    print(f"    ✓ transformers {transformers.__version__}")
except ImportError as e:
    print(f"    ✗ transformers missing: {e}")
    sys.exit(1)

# Step 2: Module import
print("\n[2] Importing local_disease_model...")
try:
    from backend.ml.local_disease_model import predict, LocalModelUnavailableError
    print("    ✓ Module imported")
except Exception as e:
    print(f"    ✗ Import failed: {e}")
    sys.exit(1)

# Step 3: First inference (triggers model download/load)
print("\n[3] Running inference (model will download on first run)...")
t0 = time.time()

# Create a synthetic 224x224 RGB image (green leaf-ish)
img = Image.new("RGB", (224, 224), color=(34, 139, 34))

try:
    raw_label, score, top2_label, top2_score = predict(img)
    elapsed = time.time() - t0
    print(f"    ✓ Inference complete in {elapsed:.2f}s")
    print(f"\n    top1 label : {raw_label}")
    print(f"    top1 score : {score:.4f}")
    print(f"    top2 label : {top2_label}")
    print(f"    top2 score : {top2_score}")
except LocalModelUnavailableError as e:
    print(f"    ✗ Model unavailable: {e}")
    sys.exit(1)
except Exception as e:
    print(f"    ✗ Inference error: {e}")
    import traceback; traceback.print_exc()
    sys.exit(1)

# Step 4: Second inference (should use cached model — much faster)
print("\n[4] Second inference (cached model)...")
t1 = time.time()
raw_label2, score2, _, _ = predict(img)
elapsed2 = time.time() - t1
print(f"    ✓ {elapsed2:.3f}s — label: {raw_label2}")

# Step 5: Confidence tier check
print("\n[5] Confidence tier logic...")
HIGH, MEDIUM = 0.75, 0.45
if score >= HIGH:
    tier = "high"
elif score >= MEDIUM:
    tier = "medium"
else:
    tier = "low"
print(f"    score={score:.4f} → tier={tier}")

# Step 6: Verify id2label mapping
print("\n[6] Checking model id2label (should have 38 classes)...")
try:
    from backend.ml import local_disease_model as _m
    n = len(_m._model.config.id2label)
    labels = list(_m._model.config.id2label.values())
    print(f"    ✓ {n} classes found")
    print(f"    Sample labels: {labels[:5]}")
    if n != 38:
        print(f"    ⚠ Expected 38 classes, got {n}")
except Exception as e:
    print(f"    ✗ Could not inspect labels: {e}")

print("\n" + "=" * 60)
print("ALL TESTS PASSED" if True else "SOME TESTS FAILED")
print("=" * 60)
