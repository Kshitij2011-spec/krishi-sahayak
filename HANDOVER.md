# Krishi-Sahayak: SIH25010 Handover Document

Welcome to Krishi-Sahayak! This document contains everything you need to know about the project context, architecture, setup, and current state.

## 1. Project Context & Thesis

**The Problem Statement (SIH25010):** The hackathon calls for an AI-driven crop recommendation and advisory system that can guide farmers based on soil, climate, and localized data.
**Our Thesis:** A successful solution must go beyond simple black-box predictions. It needs to be **personalized** (soil/climate specific), **explainable** (showing *why* a crop was recommended), and **accessible** (voice input, local languages, text-to-speech) to be practically useful for Indian farmers.

## 2. System Architecture: Built vs. Stubbed

We designed a comprehensive 6+ subsystem blueprint, but for the MVP, we prioritized depth and reliability on the core flows:

- **1. Crop & Fertilizer Recommendation (BUILT):** Fully functional. Takes N, P, K, Temp, Humidity, pH, and Rainfall. Uses a trained Random Forest model (served via Flask API) to predict the crop and provide confidence scores, explainable reasons, and NPK fertilizer dosages.
- **2. Pest & Disease Detection (BUILT):** Fully functional. Users upload a leaf image. Uses the Hugging Face Inference API (`google/vit-base-patch16-224`) to classify the disease. Includes fallback UI for low-confidence predictions (simulates escalating to a KVK extension officer).
- **3. Real-Time Mandi Prices (BUILT):** Fully functional. Connects to the real `data.gov.in` Agmarknet API to fetch live prices for Wheat, Cotton, and Paddy. Includes a labeled, robust fallback stub (returns historical averages) if the government API goes down or times out.
- **4. Voice Input & Text-to-Speech (BUILT):** Fully functional. Uses the browser's Web Speech API for dictating soil parameters and reading the advisory aloud. Supports regional voices/accents (Hindi, Marathi, Punjabi) based on OS capabilities. *(Note: Direct translation of the TTS text was attempted but reverted—see Known Issues).*
- **5. Farmer User Profiles & History (STUBBED):** We integrated Supabase to silently log all advisories and feedback for telemetry, but there is no user-facing login/auth system yet.
- **6. SMS/WhatsApp Integration (DIAGRAM-ONLY):** Planned for the future. Currently out of scope for the MVP to keep the focus on the web app experience.

## 3. Tooling & MCPs Used

This project was built pair-programming with Antigravity, utilizing several Model Context Protocol (MCP) servers. **Note:** The configuration for these MCPs lives in the agent's IDE settings, *not* in this git repository.

- **GitHub MCP:** Used to read issues, pull branch data, and automate commits/pushes.
- **Render MCP:** Used to monitor and trigger backend API deployments.
- **Vercel MCP:** Used to inspect frontend deployments and retrieve live URLs.
- **Supabase MCP:** Used to execute SQL, manage the database schema (advisories and feedback tables), and inspect logs.
- **Stitch / Context7 / Sequential-thinking MCPs:** Used for scaffolding UI designs, maintaining persistent memory across sessions, and reasoning through complex architectural decisions.
- **Playwright MCP:** Used heavily for headless E2E testing of the live production URLs to verify UI behavior, TTS execution, and form submissions without manual clicking.

## 4. Local Setup & Secrets

### Running Locally
- **Frontend (React/Vite):** 
  ```bash
  cd frontend
  npm install
  npm run dev
  ```
- **Backend (Python/Flask):**
  ```bash
  cd backend
  python -m venv venv
  source venv/Scripts/activate  # Windows
  pip install -r requirements.txt
  python app.py
  ```

### Environment Variables & Keys
Keys are **never** hardcoded in the repository. Locally, create a `.env` file in the respective directories. In production, these are set in the Vercel and Render dashboards.
- **Frontend (`frontend/.env.production`):** Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (safe to expose to the client).
- **Backend (`backend/.env`):** Requires `AGMARKNET_API_KEY` (from data.gov.in) and `HF_API_KEY` (Hugging Face token for pest detection).

## 5. Production Deployment Settings

The app is fully CI/CD automated via GitHub webhooks. Pushing to the `main` branch automatically deploys both services.

- **Frontend (Vercel):** 
  - Project Name: `krishi-sahayak-frontend` (Alias: `krishi-sahayak-frontend-silk.vercel.app`)
  - Root Directory: `frontend`
  - Build Command: `npm run build` (default Vite)
  - *Note:* SPA routing rewrites are configured in `frontend/vercel.json`.
- **Backend (Render):**
  - Web Service: `krishi-sahayak-api`
  - Root Directory: `backend`
  - Build Command: `pip install -r requirements.txt`
  - Start Command: `gunicorn app:app`

## 6. Two Hard Lessons Learned

1. **Never deploy by extracting files "in memory" bypassing git.** We encountered severe desync issues where the live Vercel site had code that wasn't in the GitHub repo. **Always commit and push to git first**, then let the Vercel/Render webhooks build the source of truth.
2. **CORS errors are often a red herring.** If the frontend throws a CORS error when hitting the backend, it usually means the backend crashed or threw a 500/503 error, which stripped the CORS headers from the response. Don't blindly tweak CORS settings—**check the Render server logs first.**

## 7. Known Issues & Future Polish

- **Translation-based TTS:** We attempted to integrate a third-party API (MyMemory) to actively translate the English advisory text into Hindi/Marathi/Punjabi before feeding it to the TTS engine. This caused race conditions and silent failures in the UI, so **it was completely reverted**. Currently, the TTS reads the English text using the OS's native regional voice/accent. This is a high-priority future improvement.
- **Voice Input Resilience:** The Web Speech API for voice dictation works well but relies on strict keyword matching (e.g., "temperature 25"). It could be more resilient to conversational input.

## 8. Priorities for the Remaining Days

**Do NOT build new features.** The priority is depth, reliability, and presentation for the existing 4 core features:
1. Ensure the demo script perfectly highlights the explainability (confidence charts) and accessibility (voice/TTS).
2. Harden the error boundaries (e.g., if Hugging Face goes down during the demo, ensure the fallback UI appears gracefully).
3. Polish the CSS/UI spacing and responsive design on mobile screens.
4. Practice the pitch! The tech works; now it's about telling the story of how this helps the farmer.
