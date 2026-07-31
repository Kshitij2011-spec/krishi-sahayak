# Krishi-Sahayak MVP — 5-Day Build Plan

Goal: a **live deployed link** you can drop in the SIH PPT, not a slide claim. Judges click it, it works.

The full blueprint has 6+ subsystems (IVR, WhatsApp, satellite, DEPA consent, ULI). None of that is buildable solo in 5 days. This plan cuts to the 3 things that prove the core thesis — *personalized, explainable, multi-channel-capable advisory* — and stubs the rest visibly rather than hiding them.

## What ships vs. what's a stub

| Feature | Status | Why |
|---|---|---|
| Crop recommendation (rule+ML, explainable) | **Full** | Core differentiator, cheap to build, you already know the stack |
| Pest/disease detection (image upload) | **Full** | Uses a pretrained model, not trained from scratch — fast |
| Fertilizer dose guidance | **Full** | Just a formula layer on top of #1's soil inputs, near-zero extra cost |
| Mandi price lookup | **Full** | Agmarknet has a public API, this is a single fetch call |
| Multilingual voice (Punjabi/Hindi) | **Narrow demo** | Browser TTS/STT for 3–4 canned advisory phrases, not full ASR pipeline |
| WhatsApp bot | **Cut, show as slide diagram** | Needs Meta Business API approval, won't clear in 5 days |
| IVR/USSD/SMS, Farmer ID/AgriStack, DEPA consent, satellite NDVI | **Cut, architecture diagram only** | Correctly positioned as "designed, not in MVP scope" — panels respect this more than a fake stub |

Say this explicitly to judges: *"here's what's live, here's what's designed and why it's out of scope for a 5-day build."* That's a stronger answer than pretending everything works.

## Tech stack (matches what you already know — no new learning curve)

- **Frontend**: React (Vite) — you've already done React Router + auth work on your Flask project, reuse that muscle memory
- **Backend split**:
  - **Flask (Render)** — only the two ML endpoints: `/recommend-crop`, `/detect-pest`. This is the only place a pickled model or HF pipeline needs to live.
  - **Supabase** — everything else. Postgres table for advisory history + feedback (thumbs up/down, "did you follow this advice") logged straight from React via the Supabase JS client, no custom route needed. Supabase Storage for pest photo uploads (frontend uploads directly, backend just receives the public URL). This *is* the feedback loop the problem statement asks for — point to it directly when a judge asks about #123.
  - Skip Supabase Auth — no login needed for a demo, adds no judging value.
- **Crop recommendation model**: scikit-learn `RandomForestClassifier` or XGBoost on a public Kaggle crop-recommendation dataset (N, P, K, temperature, humidity, pH, rainfall → crop). Train once, pickle it, load at API startup.
- **Pest detection**: don't train a CNN from scratch. Use a pretrained plant-disease model from Hugging Face (search "plant disease classification" — several PlantVillage-finetuned ones exist) via `transformers` pipeline, or TensorFlow.js MobileNet variant if you want it client-side.
- **Mandi prices**: Agmarknet / data.gov.in has a public API (needs a free API key from data.gov.in — get this on Day 1, approval can lag).
- **Voice demo**: Web Speech API (`SpeechSynthesisUtterance` with `hi-IN` lang tag works in-browser, zero backend cost) for TTS; skip STT unless Day 5 has slack.
- **Deploy**: frontend → Vercel/Netlify (free, instant link), backend → Render free tier (Flask app + model file), DB/storage → Supabase (already hosted, nothing to deploy).

## Day-by-day

**Day 1 — Data + model + API skeleton**
- Get data.gov.in API key (do this first, approval isn't instant)
- Pull crop-recommendation dataset (Kaggle), train RF/XGBoost model, pickle it
- Flask app: `/api/recommend-crop` (POST: N,P,K,temp,humidity,ph,rainfall → crop + SHAP-style top-3 reason strings, hardcode reason templates if SHAP setup eats time)
- `/api/fertilizer` (POST: crop + N,P,K → dose per acre in kg/bags, just formula-based)
- Deploy backend skeleton to Render early so Day 5 isn't a deploy scramble

**Day 2 — Frontend core flow**
- React app: form for soil/plot inputs → calls `/api/recommend-crop` → shows crop + plain-language reason + fertilizer dose
- Punjab district dropdown (hardcode 5–6 demo districts) to sell the "personalized to your plot" narrative
- Deploy to Vercel, confirm frontend↔backend CORS works end to end

**Day 3 — Pest detection**
- Wire up pretrained HF/TF.js plant-disease model
- `/api/detect-pest` (POST image → disease label + confidence)
- Frontend: image upload widget, show result + a **"low confidence → escalate to KVK officer"** stub screen (just a static "Query sent to extension officer, ID #1234" message — proves the human-in-the-loop concept without a real backend)

**Day 4 — Market prices + voice + polish**
- `/api/mandi-price` wired to Agmarknet API for 2–3 demo commodities (wheat, cotton, paddy)
- Add Web Speech API TTS button: "listen to this advisory in Punjabi" on the recommendation result
- Add a static architecture diagram screen/tab in the app itself (or link out) showing the cut features (IVR, WhatsApp, DEPA, AgriStack) as "designed, phase 2" — this directly answers the panel's scale/completeness questions inside the demo itself

**Day 5 — Buffer, deploy hardening, demo script**
- Fix whatever broke in cross-browser/mobile view (judges often view on phone)
- Write a 90-second demo script: soil input → recommendation → reason → fertilizer dose → pest photo upload → escalation stub → mandi price → voice playback → architecture slide for the rest
- Final deploy check, put the link in the PPT

## API contract (so frontend/backend can be built in parallel if you get a teammate)

**Flask (ML only):**
```
POST /api/recommend-crop
  body: { n, p, k, temperature, humidity, ph, rainfall }
  returns: { crop, confidence, reasons: [string, string, string] }

POST /api/fertilizer
  body: { crop, n, p, k }
  returns: { urea_kg_acre, dap_kg_acre, mop_kg_acre }

POST /api/detect-pest
  body: image URL (already uploaded to Supabase Storage by the frontend)
  returns: { label, confidence, escalate: bool }

GET /api/mandi-price?commodity=wheat&district=ludhiana
  returns: { price_per_quintal, last_updated, trend }
```

**Supabase (direct from React, no Flask route needed):**
```
Storage bucket: pest-photos       — frontend uploads image, gets public URL, passes URL to /api/detect-pest
Table: advisories                — id, district, soil_inputs (jsonb), recommended_crop, created_at
Table: feedback                  — id, advisory_id (fk), helpful (bool), followed_advice (bool), notes
```

## Biggest risks to kill early

1. **data.gov.in API key approval delay** — request Day 1 morning, not Day 4.
2. **HF model too large for Render free tier** — test the actual inference load Day 1–2, not Day 3; have a smaller MobileNet fallback ready.
3. **CORS/deploy friction** — get a bare "hello world" deployed frontend+backend by end of Day 1, so integration bugs surface early, not on Day 5.
