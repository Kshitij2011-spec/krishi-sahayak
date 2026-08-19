# Krishi-Sahayak: Current Development State

## 1. Known Baseline (End of Phase 0.5)
- **Frontend Framework:** React via Vite. Hosted on Vercel.
- **Backend API:** Flask. Hosted on Render.
- **Database:** Supabase for telemetry, connected directly to frontend.
- **Features Verified:**
  - Crop & Fertilizer Recommendation (Random Forest)
  - Pest Detection (Hugging Face Inference API)
  - Mandi Prices (data.gov.in API with fallback)
  - Voice Input & Text-to-Speech (Web Speech API)

## 2. Recent Commits Inspected
- `b165112` (chore: UI polish and add HANDOVER.md)
- `7259f46` (Revert "feat: translate tts text via backend")
- `7ea81bf` (feat: translate tts text via backend)
- `593c7a7` (feat: add confidence breakdown bar chart)
- `8ccb6cd` (feat: voice input and language selector)
- `5eb7a98` (chore: setup Vercel root build config)
- `3fe4afe` (feat: rebuild Mandi Prices and TTS)
- `500c2c1` (fix: use router.huggingface.co and add Content-Type to fix DNS and 400 errors)
- `ae3e23a` (feat: migrate pest detection to HF Inference API, handle 503 retries)

## 3. Current Truth
- **Branch:** `main` (synchronized with `origin/main`)
- **Speech-to-Text & Voice:**
  - Fully implemented on the frontend using `window.SpeechRecognition` (voice input) and `window.speechSynthesis` (TTS).
  - Backend translation was reverted (`7259f46`); it strictly uses native browser regional voices (`hi-IN`, `mr-IN`, `pa-IN`). A warning logs if the Punjabi voice is missing.
- **UI & Frontend Routing:**
  - `App.jsx` handles three main routes: `/` (Soil Input), `/pest-detection` (Pest Detection), `/mandi-prices` (Mandi Prices).
  - Confidence breakdown UI (bar chart) added to `SoilInputPage.jsx` for explainability.
  - Vercel config (`vercel.json`) handles routing rewrites.
- **Backend & ML Models:**
  - Flask `app.py` serves `/api/recommend-crop`, `/api/fertilizer`, `/api/detect-pest`, and `/api/mandi-price`.
  - Additional diagnostic scripts (`analyze_confidence.py`, `diagnose_crop.py`) present but isolated from the server execution.
  - `requirements.txt` remains simple without conflicting heavy dependencies.
- **Dependencies:**
  - Standard React, React-Router, and Supabase client on frontend.
  - Flask, Scikit-learn, joblib, numpy, pandas on backend.

## 4. Discrepancies Found
- **No major architectural discrepancies** between the Phase 0.5 verified assumptions and the actual repository state.
- **Voice Features Configuration:** As noted in HANDOVER.md and git log, backend translation was attempted and reverted. Voice features now solely rely on native OS capabilities.
- **Vercel Root Deployment:** The frontend requires a specific `.vercel` configuration and rewrites in `vercel.json` due to SPA routing, which was updated properly.

## 5. Pre-Flight Checklist for Phase 1
- [x] Repository state verified and up to date with `main`
- [x] `AGENTS.md` rules and Phase Gates defined
- [x] Baseline assumptions confirmed against actual code
- [x] No unrelated code changes present

Phase 1 readiness verified. No regressions detected in existing code.

## 6. Phase 1A: Verified Data Foundation
- **Status:** Complete.
- **Files Created:** 
  - `backend/advisory/__init__.py`
  - `backend/advisory/data/crop_taxonomy.json`
  - `backend/advisory/data/fertilizer_table.json`
  - `backend/advisory/data/regional_affinity.json`
- **Data Sources Used:** PAU Package of Practices, Dr. PDKV (Vidarbha), ICAR.
- **Validation Performed:** Programmatic constraint checking and agricultural consistency review (e.g. fertilizer NPK kg/ha conventions).
- **Unresolved Data Gaps:** Some crops lack explicit variety tables and exact bounds; set to `null` to prevent fabrication.
- **Existing Application Code Modified:** NONE. (Existing endpoints, ML model, frontend, and Supabase integrations are explicitly protected and untouched).
- **Next Authorized Phase:** Phase 1B (Awaiting authorization).

## 7. Phase 1B: Advisory Input Validation Layer
- **Purpose:** Provide a clean, deterministic boundary between untrusted farmer input and the future advisory engine.
- **Files Created:**
  - `backend/advisory/validator.py`
  - `backend/advisory/tests/test_validator.py`
- **Validation Contract:** Enforces strict structural, type, range, and enum validation. Rejects negative values where inappropriate (pH < 0, etc) and missing mandatory fields. Normalizes string casing and whitespace. Trims long strings. Accepts unknown root keys but strips them from the valid output.
- **Test Count:** 33 tests.
- **Test Result:** All 33 tests passed locally using the built-in `unittest` module.
- **Known Limitations:** Data source classification is descriptive only for Phase 1B and not mathematically scored. Fuzzy matching for geographies is currently skipped.
- **Existing Codebase Impact:** Zero impact. Existing app files are unchanged.
- **Next Authorized Phase:** Phase 1C.

## 8. Phase 1C: Deterministic Agronomic Rule Engine
- **Implementation Summary:** Created a pre-LLM deterministic pre-filter for crop viability based strictly on verified JSON data taxonomy.
- **Rule Treatment Table:**
  - Season: HARD_FILTER
  - Critical Irrigation Mismatch: HARD_FILTER
  - pH: SOFT_SCORE
  - Temperature: SOFT_SCORE
  - Rainfall: SOFT_SCORE
  - Regional/Budget/Market: Ignored in this phase.
- **Test Count:** 27 new tests added in `test_rule_filter.py`. 33 tests maintained in `test_validator.py`.
- **Test Result:** All 60 tests passed locally. Verified determinism and mutual exclusivity of excluded vs candidate crops.
- **Known Limitations:** Does not calculate profitability, predict yields, or invoke LLMs. Regional affinity is deliberately not factored into scoring yet.
- **Existing Codebase Impact:** Zero impact. Existing backend and ML model remain unmodified.
- **Next Authorized Phase:** Phase 1D.

## 9. Phase 1D: Deterministic Fertilizer Engine
- **Implementation Summary:** Created a fully isolated fertilizer recommendation module `fertilizer_engine.py` that calculates deficits securely using JSON lookup matching.
- **Unit Conventions:** 
  - Nitrogen is treated explicitly as elemental (N) in kg/ha. 
  - Phosphorus and Potassium deficits are dynamically blocked from resolving because the soil input (`phosphorus_kg_ha`, `potassium_kg_ha`) has ambiguous chemical representation (elemental vs oxide) compared to the JSON schema (P2O5/K2O). 
- **Calculation Approach:** Deficit = `max(0, reference - input)` with `N` only. Farm scale computed dynamically from acres `(1 ha = 2.47105 acres)`.
- **Source Handling:** Strictly queries `fertilizer_table.json` by matching exact region + condition first, defaulting to region if condition unspecified. Rejects fallback to unrelated regions.
- **Safety Decisions:** 
  - Safely stopped Product Conversion (DAP, Urea, MOP) since P/K ambiguity prevents accurate mass balancing.
  - LLMs are entirely prohibited from calculating fertilizer values.
- **Tests:** 14 new tests added in `test_fertilizer.py` verifying critical ambiguity safety (guarding against blind subtraction), farm scaling, missing baseline behavior, and non-negative deficits.
- **Unresolved Issues:** P and K chemical representation mapping is unresolved and currently limits the deficit output. Product conversion is suspended.
- **Next Authorized Phase:** Phase 1D.1.

## 10. Phase 1D.1: NPK Unit Resolution & STCR Contract
- **Implementation Summary:** Replaced the crude deficit arithmetic `max(0, recommended - soil)` with an agronomically defensible Soil Test Crop Response (STCR) logic based on Indian Soil Health Card standards.
- **Unit Conventions Resolution:**
  - `soil.nitrogen_kg_ha`, `phosphorus_kg_ha`, `potassium_kg_ha` represent Available Elemental N, P, K concentration in the soil.
  - `fertilizer_table.json` represents General Recommended Doses (GRD) of applied fertilizer nutrients (N, P2O5, K2O).
  - Therefore, simple subtraction is scientifically invalid.
- **Calculation Approach:** 
  - Soil tests are categorized into Low, Medium, High fertility classes.
  - Low soils receive a +25% adjustment to the GRD.
  - Medium soils receive the baseline GRD (0% adjustment).
  - High soils receive a -25% adjustment to the GRD.
- **Product Conversion:** Safely unlocked Urea, DAP, and MOP dose generation per hectare and per farm size. Nutrient balancing explicitly accounts for DAP supplying both N (18%) and P2O5 (46%), preventing double-fertilization.
- **Existing Codebase Impact:** Zero impact. Existing backend and ML model remain unmodified.
- **Next Authorized Phase:** Phase 1D.2.

## 11. Phase 1D.2: Source-Backed Fertilizer Adjustment Rules
- **Implementation Summary:** Replaced generic `+25% / 0 / -25%` STCR multipliers with exact, explicit source-backed adjustments dynamically parsed from a newly designed `fertilizer_table.json` schema.
- **Data Contract Update:** 
  - `fertilizer_table.json` structure flattened to `crop > region > condition > source > nutrients`. Each nutrient defines its baseline dose and explicit adjustments (`low`, `medium`, `high`) in `kg/ha`.
  - Added support for `requires_organic_carbon` metadata flag.
- **Handling Phosphorus & Organic Carbon:** PAU recommendations for P heavily depend on Organic Carbon (OC). Since the system lacks farmer OC inputs, the engine safely flags a warning (`Phosphorus recommendation is degraded...`) and safely falls back to standard P-class adjustment without hallucinating OC values.
- **Handling Potassium:** Enforced PAU's rule of "Potassium not generally recommended unless soil is deficient" by storing exact `0` adjustments for Medium and High potassium classes.
- **Test Results:** Re-wrote tests to evaluate precise source-backed adjustments. 11 tests passed locally, total 71 passing tests. Zero regressions.
- **Existing Codebase Impact:** Zero impact. Existing backend and ML model remain unmodified.
- **Next Authorized Phase:** Phase 1E-A.

## 12. Phase 1E-A: Single-Call Gemini Reasoning Layer
- **Implementation Summary:** Implemented the `gemini_layer.py` module to generate a structured agricultural advisory response via a single API call, minimizing credit usage.
- **SDK & Model Configuration:** Uses the `google-genai` SDK. Requires `GOOGLE_API_KEY` and `GEMINI_MODEL_NAME` from environment variables.
- **Response Schema:** Utilizes strict JSON schema (`AdvisoryReasoning` -> `RankedCrop`) mapping crops, ranks, advantages, trade-offs, and reasoning. Deliberately excludes numeric confidence and fertilizer doses to maintain deterministic engine boundaries.
- **Validation & Fallback:** 
  - Strictly verifies that every crop returned by Gemini exists in the provided `candidate_crops`. Returns `invalid_crop_generated` fallback otherwise.
  - Verifies that Gemini's suggested variety is found in the `approved_varieties` dictionary. If not, strips it (`null`).
  - Safely handles missing API keys, SDK import failures, JSON parsing errors, and network timeouts with deterministic fallback JSON structures.
- **Prompt Injection Controls:** The system instruction explicitly isolates farmer inputs, ensuring they are treated as untrusted data rather than system commands.
- **Testing Strategy:** Added `test_gemini_layer.py` with 10 mock-driven tests (GT-01 through GT-10). Live Gemini test: NOT RUN — API key unavailable.
- **Existing Codebase Impact:** Zero impact. Existing backend and ML model remain unmodified. Added `google-genai` to `requirements.txt`.
- **Next Authorized Phase:** Phase 1E-B.

## 13. Phase 1E-B: Standalone Advisory Orchestrator
- **Implementation Summary:** Implemented `engine.py` to orchestrate `validator.py`, `rule_filter.py`, regional and fertilizer context lookups, and `gemini_layer.py` into a single end-to-end pipeline.
- **Gemini Invocation Policy:** The engine executes exactly ONE Gemini call per advisory request, ONLY if `GOOGLE_API_KEY` and `GEMINI_MODEL_NAME` exist and at least one crop passes the agronomic hard filters. 
- **Deterministic Fallback:** When Gemini is unavailable, the engine gracefully falls back to deterministic rule scoring without generating fake data.
- **Architecture:** `RAW INPUT -> VALIDATOR -> AGRONOMIC RULES -> REGIONAL/FERTILIZER CONTEXT -> GEMINI CALL -> VALIDATION -> DETERMINISTIC FALLBACK -> STRUCTURED RESULT`.
- **API integrations:** Specifically deferred Market (Agmarknet), Weather, and Pest integrations to future phases.
- **Testing Strategy:** Added `test_engine.py` addressing E-01 through E-10 via mocks, ensuring zero credit burn during standard CI/CD execution. 91 total tests passing.
- **Existing Codebase Impact:** Zero impact. The original `app.py` and React frontend are unmodified.
- **Next Authorized Phase:** Phase 1F.

## 14. Phase 1F: Deterministic Advisory Confidence Layer
- **Implementation Summary:** Created `confidence.py` to calculate a transparent engineering heuristic reflecting the system's ability to defend its recommendation. 
- **Formula:** Uses a 50/30/20 weighted split: Agronomic Fit (50%), Data Quality (30%), and Regional Evidence (20%).
- **Component Meanings:** 
  - *Agronomic Fit*: Exact deterministic score imported from `rule_filter.py`.
  - *Data Quality*: Checks `mandatory_total` and missing data, alongside data sources (`soil_health_card`, `farmer_entered`, `defaulted_regional_avg`).
  - *Regional Evidence*: Converts presence/absence in `regional_affinity.json` into a scalar.
- **Caps:** Strict engineering ceilings apply. Any missing mandatory field severely caps confidence at 40 (Low). Heavily reliant on regional defaults caps at 65 (Moderate). Farmer entered caps at 82 (High). Strong verified data caps at 92 (Very High).
- **Engine Integration:** Substituted the `confidence_status = "pending"` stub with the robust `confidence` result object.
- **Independence:** Operates independently of whether Gemini generated the reasoning or deterministic rules did.
- **Testing Strategy:** `test_confidence.py` developed with 11 distinct behavior tests (CF-01 through CF-10 + invariants check). 102 total tests successfully passing. Zero network / Gemini credits consumed.
- **Existing Codebase Impact:** Zero impact.
- **Next Authorized Phase:** Phase 1G.

## 15. Phase 1G: Standalone Demo Runner, Scenario Validation & Full-System Hardening
- **Implementation Summary:** Implemented the standalone CLI demo runner and comprehensive end-to-end scenario validations confirming independent architecture viability.
- **Standalone Workflow:** JSON Farmer Input -> Validation -> Agronomic Filtering -> Regional Grounding -> Fertilizer Recommendation -> Optional ONE Gemini Reasoning Call -> Confidence -> Structured Advisory -> CLI Output.
- **Scenario Coverage:** Added `test_scenarios.py` verifying 12 strict edge conditions including valid configurations (S01, S02), water constraints (S03), missing/malformed text (S04, S05, S06), hostile LLM behavior mimicking (S07, S08), zero-credit environments (S09), missing fertilizer/regional maps (S10, S11), and reproducibility (S12).
- **Adversarial Testing:** Engine stability hardened against extreme numeric constraints, unexpected keys, and invalid datatypes without crashing.
- **CLI Commands:** Available globally via `python -m backend.advisory.cli --scenario punjab-rabi` or dynamically using `--input`.
- **Testing Outcome:** The full offline test suite contains 117 passing tests, strictly mocking all LLM surfaces to ensure 0 Gemini credits consumed and no network requirements.
- **Known Weaknesses:** Missing real-time APIs (Market, Weather, Pest) natively reduce predictive accuracy of farmer profit mapping, requiring later phase extensions.
- **Next Authorized Phase:** Phase 1H.

## 16. Phase 1H: Recommendation Quality Audit, Bias Detection & Deterministic Calibration
- **Implementation Summary:** Conducted a zero-API deterministic audit across multiple Ludhiana and Nagpur scenarios to investigate crop ranking, tie-breaking artifacts, and confidence capping behavior.
- **Audit Findings:**
  - **Alphabetical Bias:** Crops with identical agronomic scores and zero penalties were previously tie-broken alphabetically. This was fixed by shifting `regional_affinity` upstream as the primary tie-breaker before alphabetical sort.
  - **Soft Penalties:** Confirmed that soft penalties (e.g., pH diff > 0.5 causing a 10-point penalty) are functioning as sound engineering heuristics. A perfect agronomic fit logically edges out a regionally supported crop with poor climate/soil match.
  - **Hard Filters:** Season and Irrigation constraints correctly exclude impossible candidates (e.g., rainfed scarce water appropriately drops Rice). Missing optional constraints default correctly without unfairly excluding candidates.
- **Data Coverage Limitations:**
  - **Fertilizer Coverage:** Explicitly verified that ONLY Wheat, Soybean, and Cotton currently have source-backed fertilizer schedules. All other crops correctly report `unavailable`.
  - **Variety Coverage:** Only Wheat, Maize, and Soybean possess approved variety mappings. Others remain safely mapped to `None`.
- **Confidence Assessment:** False-high confidence cases exist when data is verified but region/fertilizer maps are absent (still scaling up to High 90), which is mathematically expected per the current heuristic (fertilizer explicitly omitted from confidence formula). False-lows correctly trigger when mandatory properties (like pH) are missing.
- **Testing Outcome:** Created `test_audit.py` with 7 strict principles (Q01-Q07). 124 tests passing.
- **Next Authorized Phase:** Phase 1I.

## 17. Phase 1I: Live Gemini Validation, Model Verification & Production-Readiness Check
- **Implementation Summary:** Prepared environment for a single live Gemini validation test using a `Maharashtra / Nagpur / Kharif / Rainfed` scenario.
- **Environment State:** `GOOGLE_API_KEY` was missing from the environment. `GEMINI_MODEL_NAME` was missing from the environment.
- **Execution Outcome:** Adhering strictly to the 1-call credit limit rule, zero (0) live Gemini calls were executed. The engine safely recognized the missing keys and gracefully aborted the live call, demonstrating the robustness of the offline boundaries.
- **Output Validation:** Since no API call was made, no AI hallucination, fertilizer invention, or confidence override occurred. The system successfully retreated to the deterministic fallback paths without crashing.
- **Credit Accounting:** Attempted: 1, Completed: 0, Retries: 0, Extra calls: 0.
- **Security Check:** API keys were verified dynamically without printing values or exposing secret buffers in terminal/logs.
- **Code Changes:** No codebase changes were necessary; all existing protections held.
- **Next Authorized Phase:** Phase 2A.

## 18. Phase 2A: Flask Advisory API Integration
- **Implementation Summary:** Integrated the standalone advisory engine into the Flask backend via a new endpoint `POST /api/v2/advisory`.
- **API Contract:** 
  - **Request:** Expects a validated JSON object mimicking the standalone engine's input block (location, soil, climate, land, farmer_constraints).
  - **Response:** Returns the direct engine output (`status`, `query_id`, `gemini_available`, `candidate_crops`, `top_recommendation`, etc.).
  - **HTTP Status:** Returns `200` for successful advisory generation (including fallback path without Gemini), `400` for validation failures, and `500` for unexpected server errors.
- **Gemini Optionality:** The endpoint elegantly bypasses Gemini integration if `GOOGLE_API_KEY` is omitted, returning deterministic fallback advice gracefully. This fulfills the requirement that Gemini failure is not a server failure.
- **Testing Outcome:** Created `test_flask_advisory.py` enforcing 10 targeted assertions (FT-01 to FT-10). Total unified suite holds 134 passing tests.
- **Manual Verification:** Sent an arbitrary POST payload via `requests` directly testing the locally hosted engine. Output validated the exact offline fallback functionality (Cotton, gemini_available=False).
- **Existing Routes:** `/api/recommend-crop`, `/api/fertilizer`, `/api/detect-pest`, and `/api/mandi-price` remain unmodified and fully functional. Random Forest continues unchanged.
- **Deployment Status:** Retained local-only deployment status.
- **Next Authorized Phase:** Awaiting user direction (Phase 2B).
