import json
import os
import uuid

from .validator import validate_advisory_input
from .rule_filter import filter_and_score
from .fertilizer_engine import calculate_fertilizer
from .gemini_layer import generate_advisory_reasoning
from .confidence import calculate_confidence

def load_json(filename):
    base_dir = os.path.dirname(__file__)
    file_path = os.path.join(base_dir, "data", filename)
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def run_advisory(raw_input_data):
    # 1. Validation
    validation_result = validate_advisory_input(raw_input_data)
    if not validation_result.get("valid", False):
        return {
            "status": "error",
            "query_id": str(uuid.uuid4()),
            "reason": "Validation failed",
            "errors": validation_result.get("errors", [])
        }
        
    validated_data = validation_result["data"]
    completeness = validation_result.get("completeness", {})

    # 2. Rule Filter
    filter_result = filter_and_score(validated_data)
    if not filter_result.get("valid", False):
        return {
            "status": "error",
            "query_id": str(uuid.uuid4()),
            "reason": filter_result.get("error", "Rule Filter failed"),
            "data": None
        }
    
    # Check if we have viable crops
    viable_candidates = []
    for c in filter_result.get("candidates", []):
        penalty_count = sum(1 for r in c.get("rule_results", []) if r.get("result") == "penalty")
        viable_candidates.append({
            "crop": c["crop"],
            "agronomic_fit_score": c["agronomic_fit_score"],
            "penalty_count": penalty_count
        })
                
    if not viable_candidates:
        return {
            "status": "no_viable_crops",
            "query_id": str(uuid.uuid4()),
            "reason": "No crop satisfies the current hard agronomic constraints.",
            "data": None
        }
        
    # Sort viable candidates by score (desc), penalty (asc), alphabetical (asc)
    viable_candidates.sort(key=lambda x: (-x["agronomic_fit_score"], x["penalty_count"], x["crop"]))
    top_crops = [c["crop"] for c in viable_candidates]

    # 3. Regional Context
    regional_affinity = load_json("regional_affinity.json")
    state = validated_data["location"]["state"]
    district = validated_data["location"]["district"]
    
    region_info = {}
    if isinstance(regional_affinity, list):
        for entry in regional_affinity:
            if entry.get("state") == state and entry.get("district") == district:
                region_info = entry
                break
                
    regional_support = {}
    for crop in top_crops:
        is_supported = False
        if region_info:
            c = crop.lower()
            if c in region_info.get("kharif", []) or c in region_info.get("rabi", []) or c in region_info.get("other", []):
                is_supported = True
        regional_support[crop] = is_supported
    
    # 4. Fertilizer Context
    fertilizer_context = {}
    for crop in top_crops:
        fert_res = calculate_fertilizer(validated_data, crop)
        fertilizer_context[crop] = fert_res

    # 5. Varieties
    crop_taxonomy = load_json("crop_taxonomy.json")
    approved_varieties = {}
    for crop in top_crops:
        varieties = []
        if isinstance(crop_taxonomy, list):
            for entry in crop_taxonomy:
                if entry.get("crop_name", "").lower() == crop.lower():
                    varieties = [v.get("name") for v in entry.get("varieties", []) if "name" in v]
                    break
        approved_varieties[crop] = varieties

    # 6. Gemini Context
    context = {
        "farmer_input": validated_data,
        "candidate_crops": top_crops,
        "regional_context": region_info if region_info else {"status": "unavailable"},
        "fertilizer_context": fertilizer_context,
        "approved_varieties": approved_varieties,
        "data_quality": completeness
    }

    # 7. Gemini Invocation Policy
    api_key = os.environ.get("GOOGLE_API_KEY")
    model_name = os.environ.get("GEMINI_MODEL_NAME")
    
    gemini_available = bool(api_key and model_name)
    reasoning_source = "deterministic_rule_engine"
    gemini_data = None
    
    if gemini_available:
        gemini_res = generate_advisory_reasoning(context)
        if gemini_res["status"] == "success":
            gemini_data = gemini_res["data"]
            reasoning_source = "gemini"
        else:
            gemini_available = False
            
    # 8. Deterministic Fallback or Gemini formatting
    query_id = str(uuid.uuid4())
    final_candidates = viable_candidates
    
    top_recommendation = {}
    alternatives = []
    
    if reasoning_source == "gemini" and gemini_data and "ranked_crops" in gemini_data:
        ranked_crops = gemini_data["ranked_crops"]
        if ranked_crops:
            # We already validated inside gemini_layer that crop is in candidates and variety is valid
            top = ranked_crops[0]
            crop_name = top["crop"].lower()
            
            top_recommendation = {
                "crop": top["crop"],
                "reasoning": top.get("reasoning", ""),
                "advantages": top.get("advantages", []),
                "tradeoffs": top.get("tradeoffs", []),
                "variety": top.get("variety"),
                "fertilizer": fertilizer_context.get(crop_name, {"status": "unavailable", "reason": "No source-backed fertilizer rule exists for this crop/region/condition."}),
                "regional_context": "supported" if regional_support.get(crop_name) else ("unavailable" if not region_info else "not_supported")
            }
            
            for alt in ranked_crops[1:]:
                alt_crop_name = alt["crop"].lower()
                alternatives.append({
                    "crop": alt["crop"],
                    "reasoning": alt.get("reasoning", ""),
                    "variety": alt.get("variety"),
                    "fertilizer": fertilizer_context.get(alt_crop_name, {"status": "unavailable"})
                })
    else:
        # Deterministic fallback
        top = viable_candidates[0]
        crop_name = top["crop"].lower()
        top_recommendation = {
            "crop": top["crop"],
            "selection_basis": "highest agronomic_fit_score",
            "fertilizer": fertilizer_context.get(crop_name, {"status": "unavailable", "reason": "No source-backed fertilizer rule exists for this crop/region/condition."}),
            "regional_context": "supported" if regional_support.get(crop_name) else ("unavailable" if not region_info else "not_supported"),
            "variety": None
        }
        for alt in viable_candidates[1:]:
            alt_crop_name = alt["crop"].lower()
            alternatives.append({
                "crop": alt["crop"],
                "selection_basis": "agronomic_fit_score",
                "fertilizer": fertilizer_context.get(alt_crop_name, {"status": "unavailable"})
            })

    data_sources_used = ["farmer_input", "crop_taxonomy", "regional_affinity", "fertilizer_table"]
    if reasoning_source == "gemini":
        data_sources_used.append("gemini_reasoning")

    # 9. Confidence Calculation
    # Find agronomic score for top recommendation
    top_agronomic_score = 0
    for c in viable_candidates:
        if c["crop"].lower() == top_recommendation.get("crop", "").lower():
            top_agronomic_score = c["agronomic_fit_score"]
            break
            
    confidence = calculate_confidence(
        agronomic_fit_score=top_agronomic_score,
        data_completeness=completeness,
        field_quality=validation_result.get("field_quality", {}),
        regional_status=top_recommendation.get("regional_context", "unavailable")
    )

    # Construct the final result
    return {
        "status": "success",
        "query_id": query_id,
        "gemini_available": gemini_available,
        "reasoning_source": reasoning_source,
        "candidate_crops": final_candidates,
        "top_recommendation": top_recommendation,
        "alternatives": alternatives,
        "warnings": [],
        "data_sources_used": data_sources_used,
        "data_completeness": completeness,
        "confidence": confidence
    }
