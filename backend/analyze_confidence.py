import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
import joblib

DATASET_URL = "https://raw.githubusercontent.com/aakashr02/Crop-Recommendation/main/data/Crop_recommendation.csv"
MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")

FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
TARGET = "label"

def main():
    print("Loading data and model...")
    df = pd.read_csv(DATASET_URL)
    
    model_path = os.path.join(MODEL_DIR, "crop_model.pkl")
    encoder_path = os.path.join(MODEL_DIR, "label_encoder.pkl")
    
    if not os.path.exists(model_path) or not os.path.exists(encoder_path):
        print("Model or encoder not found. Run train_model.py first.")
        return
        
    model = joblib.load(model_path)
    le = joblib.load(encoder_path)
    
    df["label_encoded"] = le.transform(df[TARGET])
    X = df[FEATURES].values
    y = df["label_encoded"].values
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    probas = model.predict_proba(X_test)
    preds = model.predict(X_test)
    
    print("Analyzing low confidence predictions...")
    low_conf_idx = np.where(np.max(probas, axis=1) < 0.7)[0]
    
    print(f"Total test samples: {len(X_test)}")
    print(f"Samples with < 70% confidence: {len(low_conf_idx)}")
    
    for i in low_conf_idx[:10]:
        true_label = le.inverse_transform([y_test[i]])[0]
        pred_label = le.inverse_transform([preds[i]])[0]
        
        prob = probas[i]
        top3_idx = np.argsort(prob)[-3:][::-1]
        top3_classes = le.inverse_transform(top3_idx)
        top3_probs = prob[top3_idx]
        
        print(f"\n---")
        print(f"True: {true_label} | Pred: {pred_label}")
        print(f"Features: {dict(zip(FEATURES, X_test[i]))}")
        print(f"Top 3:")
        for cls, p in zip(top3_classes, top3_probs):
            print(f"  {cls}: {p:.2%}")

if __name__ == "__main__":
    main()
