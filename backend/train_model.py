"""
Train a RandomForest model on the Kaggle Crop Recommendation Dataset.
Outputs:
  - model/crop_model.pkl
  - model/label_encoder.pkl
"""
import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, classification_report
import joblib

DATASET_URL = "https://raw.githubusercontent.com/aakashr02/Crop-Recommendation/main/data/Crop_recommendation.csv"
MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")

FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
TARGET = "label"


def main():
    print("[LOAD] Loading dataset...")
    df = pd.read_csv(DATASET_URL)
    print(f"   Loaded {len(df)} rows, {len(df.columns)} columns")
    print(f"   Crops: {df[TARGET].nunique()} unique -> {sorted(df[TARGET].unique())}")

    # Encode labels
    le = LabelEncoder()
    df["label_encoded"] = le.fit_transform(df[TARGET])

    X = df[FEATURES].values
    y = df["label_encoded"].values

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"   Train: {len(X_train)}, Test: {len(X_test)}")

    # Train RandomForest
    print("[TRAIN] Training RandomForestClassifier (n_estimators=100)...")
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=None,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\n[OK] Accuracy: {acc:.4f} ({acc*100:.1f}%)")
    print("\n[REPORT] Classification Report:")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    # Feature importances
    importances = model.feature_importances_
    print("[FEATURES] Feature Importances:")
    for feat, imp in sorted(zip(FEATURES, importances), key=lambda x: -x[1]):
        print(f"   {feat}: {imp:.4f}")

    # Save
    os.makedirs(MODEL_DIR, exist_ok=True)
    model_path = os.path.join(MODEL_DIR, "crop_model.pkl")
    encoder_path = os.path.join(MODEL_DIR, "label_encoder.pkl")
    joblib.dump(model, model_path)
    joblib.dump(le, encoder_path)
    print(f"\n[SAVE] Model saved to {model_path}")
    print(f"[SAVE] Encoder saved to {encoder_path}")

    # Quick sanity check
    sample = X_test[0].reshape(1, -1)
    pred = model.predict(sample)
    proba = model.predict_proba(sample)
    print(f"\n[TEST] Sanity check: input={dict(zip(FEATURES, X_test[0]))}")
    print(f"   Predicted: {le.inverse_transform(pred)[0]} (confidence: {proba.max():.2%})")


if __name__ == "__main__":
    main()
