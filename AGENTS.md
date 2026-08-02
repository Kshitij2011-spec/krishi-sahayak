# Krishi-Sahayak Agent Context

## What this is
This project is an AI-driven crop recommendation and advisory system built for the SIH25010 problem statement. Our thesis is providing personalized, explainable, and accessible agricultural advisory. For full context on the problem statement, setup instructions, and the human-readable overview, see [HANDOVER.md](file:///c:/Users/Kshitij%20Parkhe/OneDrive/Desktop/sihmvp/HANDOVER.md) and [PRD.md](file:///c:/Users/Kshitij%20Parkhe/OneDrive/Desktop/sihmvp/PRD.md).

## Live environments
- **Frontend (Vercel):** https://krishi-sahayak-frontend-silk.vercel.app
- **Backend API (Render):** https://krishi-sahayak-api.onrender.com
- **Database (Supabase):** Project Ref `pmvyiptvbdrqvzbvogvr` (https://pmvyiptvbdrqvzbvogvr.supabase.co)
*Note: Render free tier cold-starts after inactivity. Supabase free tier can auto-pause after ~1 week idle. Check both are active before starting a work session.*

## Architecture
React (Vercel) → Flask (Render, ML endpoints only) → Supabase (DB/Storage, called directly from frontend). The frontend directly uploads images and saves logs to Supabase, bypassing the backend API which is strictly used for heavy ML inferences (Crop Rec, Pest Detection) and proxying external APIs (Mandi Prices).

## Current status
- **Shipped:** 
  1. Crop & Fertilizer Recommendation (Random Forest).
  2. Pest & Disease Detection (HF Inference API `google/vit-base-patch16-224`).
  3. Real-Time Mandi Prices (via data.gov.in).
  4. Voice Input & Text-to-Speech (Web Speech API).
- **Stubbed/Mocked:** Mandi price fallback (returns historical averages if data.gov.in is down).
- **Cut/Diagram-only:** User profiles, login/auth, SMS/WhatsApp integrations (out of scope for MVP).

## Hard rules — do not violate
- Every change: commit to git and push BEFORE considering it done. Never deploy by extracting files "in memory" bypassing git.
- CORS errors are usually a red herring for a backend crash — check Render logs before touching CORS config.
- Any fallback/mocked response must be labeled in its own output (e.g., source: "fallback"), never silently indistinguishable from live data.
- All secrets as env vars on Render/Vercel dashboards, never hardcoded or committed.

## Known issues
- Translation-based TTS was attempted and reverted (broke functionality). Current TTS is accent-based only (speaks English text with the selected language's voice profile), not real translation. Don't re-attempt without checking with the user first.

## Where things live
- `frontend/src/pages/SoilInputPage.jsx`: Main form, voice input, TTS logic, crop rec UI.
- `frontend/src/pages/PestDetectionPage.jsx`: Image upload, HF integration, confidence chart UI.
- `frontend/src/pages/MandiPricePage.jsx`: Mandi prices UI.
- `frontend/src/lib/api.js`: All fetch wrappers connecting React to the Flask backend.
- `frontend/src/lib/supabase.js`: Supabase client initialization.
- `backend/app.py`: Flask routes (`/api/recommend-crop`, `/api/detect-pest`, `/api/mandi-price`).
- `backend/model.pkl` & `backend/label_encoder.pkl`: Trained ML artifacts for Crop Rec.
- `HANDOVER.md`: Human onboarding document.

## Scope for remaining days
Depth/reliability/polish on the 4 existing features only. No new features without explicit approval.
