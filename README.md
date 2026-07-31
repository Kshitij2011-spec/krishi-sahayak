# Krishi-Sahayak 🌾

AI-powered crop advisory MVP for SIH25010.

## Features
- **Crop Recommendation** — ML-based (RandomForest) crop prediction from soil & climate data
- **Fertilizer Guidance** — NPK deficit-based dosage calculation
- **Pest Detection** — Pretrained plant disease classification (Day 3)
- **Mandi Prices** — Live commodity prices via data.gov.in (Day 4)
- **Feedback Loop** — Advisory rating stored in Supabase

## Stack
- **Frontend**: React (Vite) → Vercel
- **Backend**: Flask → Render (ML endpoints only)
- **Database/Storage**: Supabase (Postgres + Storage)

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
python train_model.py   # Train the model first
python app.py           # Start Flask dev server on :5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev             # Start Vite dev server on :5173
```

## API Contract
```
POST /api/recommend-crop  { n, p, k, temperature, humidity, ph, rainfall }
POST /api/fertilizer      { crop, n, p, k }
POST /api/detect-pest     { image_url }  (Day 3)
GET  /api/mandi-price     ?commodity=&district=  (Day 4)
```

## License
MIT
