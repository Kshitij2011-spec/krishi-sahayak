# 🌾 Krishi-Sahayak — Full Project Explanation

## What Is This?

**Krishi-Sahayak** ("Farmer's Helper" in Hindi) is an **AI-powered crop advisory system** built for the **SIH25010 Smart India Hackathon problem statement**. Its core thesis: agricultural AI must not just predict — it must be **personalized**, **explainable**, and **accessible** to rural Indian farmers who may speak regional languages and have low digital literacy.

---

## 🏗️ High-Level Architecture

```
Browser (React/Vite on Vercel)
        │
        ├──── Heavy ML Calls ──────→ Flask API (Render)
        │                                │
        │                                ├── Random Forest (Crop Rec)
        │                                ├── HF Inference API (Pest Detection)
        │                                └── data.gov.in (Mandi Prices)
        │
        └──── Direct DB/Storage ──→ Supabase (PostgreSQL + Storage)
                                        ├── advisories table (all recommendations logged)
                                        ├── feedback table (👍/👎 ratings)
                                        └── pest-photos bucket (uploaded leaf images)
```

**Key architectural decision:** The frontend talks to Supabase *directly* for storage and logging (bypassing the backend), and only routes heavy ML/external-API calls through Flask. This keeps the backend lean and fast.

---

## 📁 File-by-File Breakdown

### Root Level

| File | Purpose |
|---|---|
| `HANDOVER.md` | Onboarding doc — architecture, setup, lessons learned |
| `AGENTS.md` | Rules & context for the AI coding agent (Antigravity) |
| `vercel.json` | Root-level Vercel config (routes frontend + backend) |
| `Krishi-Sahayak_MVP_5Day_Plan.md` | Original 5-day sprint plan |
| `README.md` | Public-facing project README |

---

### 🐍 Backend (`backend/`)

**Tech Stack:** Python · Flask · Gunicorn · scikit-learn · joblib

#### [`app.py`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/backend/app.py) — The Flask API Server

This is the **heart of the backend**. It exposes 4 REST endpoints:

##### `GET /` — Health Check
Returns `{ status: "ok", model_loaded: true/false }`. Used to verify the server and ML model are up.

##### `POST /api/recommend-crop` — Crop Recommendation ⭐ Core Feature
- **Input:** `{ n, p, k, temperature, humidity, ph, rainfall }` (7 soil/climate parameters)
- **Process:**
  1. Loads a pre-trained `RandomForestClassifier` from `model/crop_model.pkl`
  2. Calls `model.predict_proba()` to get probabilities across all 22 crops
  3. Returns the top prediction + confidence score
  4. If confidence < 70%, also returns an `alternative` crop suggestion
  5. Generates **3 human-readable reasons** (e.g., *"Nitrogen level (90 kg/ha) is well-suited for Rice cultivation"*) using feature importances
- **Output:** `{ crop, confidence, reasons, alternative? }`

##### `POST /api/fertilizer` — Fertilizer Dosage Calculator
- **Input:** `{ crop, n, p, k }` — crop name + current soil NPK levels
- **Process:**
  1. Looks up `IDEAL_NPK` dictionary (22 crops with target N/P/K values in kg/ha)
  2. Calculates the **deficit**: `ideal - actual`
  3. Converts to commercial fertilizer quantities:
     - **Urea** (46% N) for Nitrogen deficit
     - **DAP** (20% P) for Phosphorus deficit
     - **MOP** (50% K) for Potassium deficit
  4. Converts from per-hectare to **per-acre** (÷ 2.47) — units farmers understand
- **Output:** `{ urea_kg_acre, dap_kg_acre, mop_kg_acre, note }`

##### `POST /api/detect-pest` — Pest & Disease Detection
- **Input:** `{ image_url }` — public URL of the uploaded leaf image
- **Process:**
  1. Downloads the image from the Supabase public URL
  2. Sends raw image bytes to the **Hugging Face Inference API** (`linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification`)
  3. Handles HF 503 "model loading" responses gracefully
  4. If confidence < 60%, sets `escalate: true` (triggers KVK officer UI)
  5. Cleans up label (e.g., `"Tomato___Late_blight"` → `"Tomato - Late blight"`)
- **Output:** `{ label, confidence, escalate }`

##### `POST /api/mandi-price` — Market Price Lookup
- **Input:** `{ commodity, district }` — e.g., `"Wheat"`, `"Ludhiana"`
- **Process:**
  1. Calls **data.gov.in Agmarknet API** (real government dataset) using `DATA_GOV_IN_API_KEY`
  2. If the API is down/times out → falls back to a hardcoded stub with realistic prices
  3. **Critical rule:** Fallback always sets `is_fallback: true` — never silently fakes live data
- **Output:** `{ commodity, district, min_price, max_price, modal_price, arrival_date, is_fallback }`

#### [`train_model.py`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/backend/train_model.py) — Model Training Script
- Downloads the [Kaggle Crop Recommendation Dataset](https://raw.githubusercontent.com/aakashr02/Crop-Recommendation/main/data/Crop_recommendation.csv)
- Trains a `RandomForestClassifier` (100 estimators) on 7 features → 22 crop classes
- Outputs: `model/crop_model.pkl` (3.5 MB) and `model/label_encoder.pkl` (830 bytes)
- **Not run in production** — the pre-trained artifacts are committed to git

#### [`analyze_confidence.py`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/backend/analyze_confidence.py) — Dev Diagnostic Script
- A developer tool (not deployed) to understand low-confidence predictions
- Loads the trained model, runs it on test data, and prints all samples where confidence < 70%
- Used during development to tune the confidence threshold and understand ambiguous cases

#### [`model/crop_model.pkl`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/backend/model/crop_model.pkl) — The Trained ML Model
- A serialized `RandomForestClassifier` (3.5 MB)
- 100 decision trees trained on ~2200 samples × 7 features
- Classifies into 22 crops: rice, maize, chickpea, kidneybeans, pigeonpeas, mothbeans, mungbean, blackgram, lentil, pomegranate, banana, mango, grapes, watermelon, muskmelon, apple, orange, papaya, coconut, cotton, jute, coffee

#### `requirements.txt`
```
flask==3.1.1, flask-cors==5.0.1, scikit-learn==1.6.1,
joblib==1.4.2, numpy==2.2.3, pandas==2.2.3, gunicorn==23.0.0, requests
```

#### `Procfile`
Tells Render how to start: `web: gunicorn app:app`

---

### ⚛️ Frontend (`frontend/`)

**Tech Stack:** React 19 · Vite 6 · React Router v7 · Supabase JS SDK · Vanilla CSS

#### [`index.html`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/frontend/index.html)
Standard Vite entry point. Mounts the React app at `<div id="root">`.

#### [`src/main.jsx`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/frontend/src/main.jsx)
App entry — wraps everything in `<BrowserRouter>` and renders `<App />`.

#### [`src/App.jsx`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/frontend/src/App.jsx) — Router & Navigation
- Top-level component with a **persistent navbar**: `Krishi-Sahayak` brand + 3 nav links
- Routes:
  - `/` → `SoilInputPage`
  - `/pest-detection` → `PestDetectionPage`
  - `/mandi-prices` → `MandiPricePage`

#### [`src/index.css`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/frontend/src/index.css) — Design System (14.7 KB)
A comprehensive CSS design system using CSS custom properties (variables):
- Color palette: greens (primary/accent), grays, danger red
- Typography, spacing, border-radius tokens
- Component styles: `.navbar`, `.hero`, `.card`, `.btn`, `.form-grid`, `.badge`, `.alert`, `.upload-area`, `.confidence-bar`, `.fert-table`, `.reasons-grid`, `.feedback-section`, `.spinner`

#### [`src/lib/api.js`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/frontend/src/lib/api.js) — API Wrapper
4 exported async functions connecting to Flask backend:
- `recommendCrop(soilData)` → `/api/recommend-crop`
- `getFertilizer(data)` → `/api/fertilizer`
- `detectPest(imageUrl)` → `/api/detect-pest` (with 503 error details)
- `getMandiPrices(commodity, district)` → `/api/mandi-price`

Backend URL: `VITE_API_URL` env var (defaults to `http://localhost:5000`).

#### [`src/lib/supabase.js`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/frontend/src/lib/supabase.js) — Supabase Client
Simple client init using `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` env vars.

---

### 📄 Pages (The Three Core Features)

#### [`SoilInputPage.jsx`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/frontend/src/pages/SoilInputPage.jsx) — Home Page (419 lines) ⭐ Most Complex

**State managed:** `form`, `loading`, `result`, `fertilizer`, `error`, `feedbackSent`, `advisoryId`, `isListening`, `language`, `ttsWarning`

**Features:**

1. **Soil Input Form** — 7 numeric fields (N, P, K, Temperature, Humidity, pH, Rainfall) + District dropdown
2. **🎤 Voice Input** — Web Speech API (`SpeechRecognition`)
   - User selects language: Hindi (`hi-IN`), Marathi (`mr-IN`), or Punjabi (`pa-IN`)
   - Parses natural speech like *"nitrogen 90, temperature 25"* using regex keyword matching
   - Extracts values and populates the form fields automatically
3. **📊 Crop Recommendation Result** — Shows:
   - Recommended crop name + confidence badge
   - Visual confidence breakdown bar chart (CSS progress bars) for top 3 crops
   - 3 numbered reason cards explaining *why* this crop was recommended
   - Alternative crop suggestion if confidence < 70%
4. **🧪 Fertilizer Table** — Shows Urea / DAP / MOP dosages per acre
5. **🔊 Text-to-Speech (TTS)** — Reads the entire advisory aloud using `SpeechSynthesisUtterance`
   - Speaks English text with the selected language's regional voice/accent
   - Falls back from Punjabi → Hindi if the OS lacks a Punjabi voice
6. **Supabase Logging** — Every successful recommendation is inserted into the `advisories` table with all inputs + result
7. **👍👎 Feedback** — User rates the advisory; stored in Supabase `feedback` table linked by `advisory_id`

#### [`PestDetectionPage.jsx`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/frontend/src/pages/PestDetectionPage.jsx) — Pest Detection (201 lines)

**Flow:**
1. **Drag & Drop / Browse** upload area for leaf images (JPG/PNG)
2. **Supabase Upload** — Image uploaded directly to `pest-photos` bucket, generates a public URL
3. **Flask API Call** — `detectPest(publicUrl)` sent to backend
4. **503 Retry Logic** — If HF model is cold-starting, waits `retry_in` seconds and retries once automatically with status messages shown to user
5. **Result Display:**
   - If confidence ≥ 60%: Shows disease name + confidence bar (gradient red)
   - If confidence < 60% (`escalate: true`): Shows warning + *"Query sent to KVK extension officer ID #XXXXX"* message (simulates human escalation pathway)

#### [`MandiPricePage.jsx`](file:///c:/Users/Dhruv%20Nayak/Desktop/krishi-sahayak/frontend/src/pages/MandiPricePage.jsx) — Mandi Prices (127 lines)

**Flow:**
1. User selects **Commodity** (Wheat / Cotton / Paddy) + **District** (Ludhiana / Amritsar / Bathinda)
2. Calls Flask → data.gov.in Agmarknet API
3. Displays Min / Max / Modal price in ₹/Quintal table
4. If `is_fallback: true` → shows a yellow warning banner: *"Displaying estimated fallback prices"*

---

## 🗄️ Database (Supabase)

Two tables:

| Table | Columns |
|---|---|
| `advisories` | `id`, `district`, `soil_inputs` (JSONB), `recommended_crop`, `confidence`, `reasons`, `created_at` |
| `feedback` | `id`, `advisory_id` (FK), `helpful` (bool), `followed_advice`, `notes`, `created_at` |

One storage bucket: **`pest-photos`** (public, for leaf image uploads)

---

## 🚀 Deployment

| Service | Platform | URL |
|---|---|---|
| Frontend (React) | Vercel | `krishi-sahayak-frontend-silk.vercel.app` |
| Backend (Flask) | Render (free tier) | `krishi-sahayak-api.onrender.com` |
| Database | Supabase | Project ref `pmvyiptvbdrqvzbvogvr` |

**CI/CD:** Push to `main` → Vercel auto-deploys frontend, Render auto-deploys backend.

> [!WARNING]
> **Render free tier cold-starts** after ~15 min inactivity. The first API call after idle may take 30-60 seconds. Supabase free tier also auto-pauses after ~1 week of no activity.

---

## 🔐 Secrets / Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel env / `frontend/.env.production` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel env / `frontend/.env.production` | Supabase public anon key |
| `VITE_API_URL` | Vercel env | Flask backend URL |
| `HF_API_TOKEN` | Render env | Hugging Face inference token |
| `DATA_GOV_IN_API_KEY` | Render env | data.gov.in Agmarknet API key |

> [!CAUTION]
> All secrets live **only** in Vercel/Render dashboards. Never hardcode them or commit `.env` files.

---

## ⚠️ Known Issues & Hard Rules

1. **TTS Translation is reverted** — We tried real translation (English→Hindi/Marathi) via MyMemory API. It caused race conditions and silent failures. Currently TTS reads English text with a regional voice/accent. Don't reattempt without discussion.
2. **CORS errors = backend crash** — If you see CORS errors in the browser, don't touch CORS config. Check Render logs for the real 500/503 error first.
3. **Always git commit before considering anything done** — Never deploy by extracting files in memory. The git repo is the source of truth.
4. **Fallbacks must be labeled** — Any mocked/fallback response must include `is_fallback: true` or equivalent — never indistinguishable from live data.

---

## 🗺️ Feature Status Summary

| Feature | Status | Notes |
|---|---|---|
| Crop Recommendation (RF model) | ✅ Shipped | 22 crops, confidence + reasons |
| Fertilizer Dosage | ✅ Shipped | NPK deficit → Urea/DAP/MOP per acre |
| Pest/Disease Detection | ✅ Shipped | HF MobileNetV2, escalation UI |
| Real-time Mandi Prices | ✅ Shipped | data.gov.in + labeled fallback |
| Voice Input (Speech-to-Text) | ✅ Shipped | Web Speech API, 3 regional languages |
| Text-to-Speech (TTS) | ✅ Shipped | Accent-based (not translated) |
| Supabase Advisory Logging | ✅ Shipped | Silent telemetry, no user login needed |
| User Profiles / Auth | 🔨 Stubbed | Supabase ready, no UI yet |
| SMS / WhatsApp Integration | 📐 Diagram-only | Out of scope for MVP |
