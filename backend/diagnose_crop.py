import os
import pandas as pd
import numpy as np
import joblib

DATASET_URL = "https://raw.githubusercontent.com/aakashr02/Crop-Recommendation/main/data/Crop_recommendation.csv"
MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")

def main():
    model = joblib.load(os.path.join(MODEL_DIR, "crop_model.pkl"))
    le = joblib.load(os.path.join(MODEL_DIR, "label_encoder.pkl"))
    
    df = pd.read_csv(DATASET_URL)
    FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
    X = df[FEATURES].values
    
    # Predict all
    probas = model.predict_proba(X)
    preds = model.predict(X)
    
    # Let's find some rows where the true label is 'rice' or predicted is 'rice' 
    # but the max probability is low (around 50-60%)
    
    rice_idx = np.where(le.classes_ == 'rice')[0][0]
    
    print(f"Rice class index: {rice_idx}")
    
    low_conf_indices = []
    for i, (prob, pred) in enumerate(zip(probas, preds)):
        max_prob = prob.max()
        if pred == rice_idx and max_prob < 0.7:
            low_conf_indices.append(i)
            
    print(f"Found {len(low_conf_indices)} rows predicted as rice with < 70% confidence.")
    
    for i in low_conf_indices[:5]:
        print(f"\nRow {i} True Label: {df.iloc[i]['label']}")
        print(f"Input features: {dict(zip(FEATURES, X[i]))}")
        
        # Top 3 probabilities
        top3_indices = np.argsort(probas[i])[::-1][:3]
        print("Top 3 predictions:")
        for idx in top3_indices:
            print(f"  {le.classes_[idx]}: {probas[i][idx]:.2%}")
            
    # Also find if there are any points with ~53% for Rice
    specific_low = [i for i in low_conf_indices if 0.50 <= probas[i].max() <= 0.58]
    print(f"\nFound {len(specific_low)} rows with 50-58% confidence.")
    if specific_low:
        i = specific_low[0]
        print(f"\nDetailed look at Row {i} (True: {df.iloc[i]['label']}):")
        print(f"Input features: {dict(zip(FEATURES, X[i]))}")
        top3_indices = np.argsort(probas[i])[::-1][:3]
        for idx in top3_indices:
            print(f"  {le.classes_[idx]}: {probas[i][idx]:.2%}")

if __name__ == "__main__":
    main()
