# Krishi-Sahayak Agent Context

## Project Identity
**Project:** Krishi-Sahayak
**Problem Statement:** SIH25010 — Smart Crop Advisory System for Small and Marginal Farmers

## What this is
This project is an AI-driven crop recommendation and advisory system built for the SIH25010 problem statement. Our thesis is providing personalized, explainable, and accessible agricultural advisory. For full context on the problem statement, setup instructions, and the human-readable overview, see `HANDOVER.md` and `PRD.md`.

## Current Architecture
- **Frontend:** React (v19) SPA hosted on Vercel (`krishi-sahayak-frontend-silk.vercel.app`).
- **Backend:** Python (Flask) API hosted on Render (`krishi-sahayak-api.onrender.com`).
- **Database:** Supabase (PostgreSQL) used directly by the frontend for logging advisories and feedback.
- **External APIs:** Hugging Face Inference API (`google/vit-base-patch16-224`) for pest detection, `data.gov.in` Agmarknet for Mandi prices.
- **Voice Features:** Web Speech API (native browser) for voice input and TTS. Translation-based TTS was reverted; currently uses native regional voices (Hindi, Marathi, Punjabi).
- **ML Model:** Random Forest (scikit-learn) trained on Kaggle dataset (22 crops).

## Development State
Current Phase: 2E
Status: Phase 2E complete. Open-Meteo weather context integrated. 0/1 weather request policy. Weather optional. Gemini call limit unchanged.
Next Approved Phase: None

## Phase History
- **Phase 0:** Complete - Repository audit and architecture research
- **Phase 0.5:** Complete - Decision validation and evidence verification
- **Phase 0.75:** Complete - Repository synchronization and governance
- **Phase 1A:** Complete - Verified Advisory Data Foundation created. Initial 10-crop scope. Data provenance rule established. Fertilizer unit convention (N, P2O5, K2O in kg/ha) standardized. Protected existing system remains unchanged.
- **Phase 1B:** Complete - validator.py added, validator tests added, input contract locked, no existing application code modified.
- **Phase 1C:** Complete - Deterministic agronomic rule engine implemented. Season hard filter, critical water mismatch filter, pH/temperature/rainfall soft scoring. No regional/market/budget logic yet. No Gemini.
- **Phase 1D:** Complete - Deterministic fertilizer engine implemented. Deficit logic was halted due to discovered P/K unit ambiguity.
- **Phase 1D.1:** Complete - Fertilizer unit ambiguity resolved. Soil values represent Available N/P/K (concentration). Crude deficit subtraction replaced with Indian STCR logic (Low/Medium/High fertility classes). Product conversion (Urea, DAP, MOP) unlocked and implemented securely.
- **Phase 1D.2:** Complete - Generic STCR adjustments replaced with precise source-backed rules per nutrient (PAU & Dr. PDKV). JSON schema restructured. Missing Organic Carbon logic safely flagged.
- **Phase 1E-A:** Complete - Single-call Gemini reasoning layer. Structured output schema defined. Strict crop/variety validation. No Gemini-controlled fertilizer. No Gemini-controlled confidence. One-call-per-advisory design.
- **Phase 1E-B:** Complete - Standalone end-to-end engine orchestrated via `engine.py`. One-Gemini-call policy implemented with deterministic fallback. No market/weather/pest APIs. Confidence deferred to Phase 1F.
- **Phase 1F:** Complete - Deterministic advisory confidence layer implemented (`confidence.py`). 50/30/20 weights (Agronomic/Data/Regional) with strict engineering caps (max 40 for missing mandatory data, 92 for fully verified). Independent of Gemini response.
- **Phase 1G:** Complete - Standalone demo runner (`cli.py`) and full scenario suite (`test_scenarios.py`) implemented. Verified credit-safe, robust, adversarial-tested offline pipeline.
- **Phase 1H:** Complete - Recommendation quality audited. Tie-breaking bias fixed using regional affinity. Data coverage matrices (fertilizer, variety) verified and limitations documented. Confidence boundaries proven sound.
- **Phase 1I:** Complete - Live Gemini validation skipped (API keys missing from environment). Credit policy strictly adhered to.
- **Phase 2A:** Complete - `/api/v2/advisory` exposed via Flask. Standalone engine connected. Random Forest & existing endpoints preserved intact. No React integration yet. Gemini remains optional.
- **Phase 2B:** Complete - Gemini Interactions API adopted. Stateless interaction mode (store=false). Configured model logic intact. Live validation aborted due to missing API key. One-call-per-advisory invariant preserved.
- **Phase 2B.1:** Complete - Local `.env` credential loading verified and secured. Performed EXACTLY ONE live Gemini Interactions API validation using the dynamically loaded model configuration. Gemini accurately generated crop reasoning without modifying baseline deterministic fertilizer values. Fallback logic verified. Ready for React integration.
- **Phase 2C:** Complete - Advanced advisory page added. `/api/v2/advisory` consumed by React. Existing Random Forest UI preserved. Gemini API key remains backend-only.
- **Phase 2D:** Complete - Playwright browser validation completed. Advanced Advisory route tested. Gemini live path tested. Fallback path tested. Existing UI regression checked. All clear.
- **Phase 2E:** Complete - Open-Meteo weather context integrated as evidence. 0/1 weather request policy enforced. Coordinates sourced safely. Gemini prompt updated to treat weather as supporting context, not overriding deterministic agronomic rules. Existing UI untouched.

## Protected Existing System
*No protected component may be modified during a phase unless that phase explicitly authorizes it.*
- `backend/app.py`
- `backend/model/`
- `frontend/`
- Existing API endpoints
- Supabase integration
- Deployment configuration (`vercel.json`, `backend/requirements.txt`)

## Change Policy
1. Do not modify unrelated code.
2. Do not combine multiple phases into one implementation.
3. Do not refactor merely because a better design is possible.
4. Do not remove old functionality before its replacement has been independently validated.
5. Do not change an API contract silently.
6. Do not modify deployment infrastructure during a local implementation phase unless explicitly authorized.
7. Do not introduce dependencies without documenting why they are required.
8. Before modifying an existing file, inspect its current contents first.
9. Before modifying architecture, verify the architecture actually exists.
10. When uncertain, stop and ask rather than inventing an assumption.

## Reliability Rules
The agent must distinguish between: `VERIFIED`, `INFERRED`, `UNVERIFIED`, `UNKNOWN`.
- Never invent agricultural data.
- Never invent API behavior.
- Never invent existing code behavior.
- Never invent model characteristics.
- Never invent deployment configuration.
- Never invent variety names.
- Never invent fertilizer recommendations.
- Never invent security guarantees.
Every safety-critical agricultural value must have a traceable source.

## Source of Truth Priority
1. Actual repository contents
2. Current git history / current branch
3. Explicit user instructions for the current phase
4. Official project documentation
5. Verified external documentation
6. Previous audit reports
7. Agent assumptions

## Phase Gate
```text
Phase N
   ↓
Inspect current state
   ↓
Research
   ↓
Plan
   ↓
Identify ambiguities
   ↓
Ask user if required
   ↓
Explicit authorization
   ↓
Implement ONLY Phase N
   ↓
Test
   ↓
Verify
   ↓
Document
   ↓
Update AGENTS.md
   ↓
Wait for next phase
```

## Pre-Change Checkpoint
Before modifying any code file, the agent must document internally or in the task output:
- Files to change
- Why each file changes
- What behavior changes
- Dependencies involved
- Potential regression risks
- How changes will be tested
- Rollback strategy

## Git Safety
- Never force-push.
- Never delete branches without authorization.
- Never `git reset --hard` to discard user work.
- Never overwrite uncommitted changes.
- Always inspect `git status` before pulling.
- Always inspect the diff before committing.
- Never commit secrets.
- Never commit `.env` credentials.
- Never assume the current branch is up to date.
- Before starting a phase, synchronize safely with the remote when possible.
- After meaningful milestones, create a commit if authorized by the phase.
- Commit messages should identify the phase and purpose.

## AGENTS.md Maintenance Policy
Whenever architecture changes, features are added/removed, API contracts change, or phases begin/end, the agent must determine whether `AGENTS.md` needs updating and update it in the same phase as the change. Do NOT turn `AGENTS.md` into a random log; keep it concise and stable.
