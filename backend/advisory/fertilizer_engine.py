import json
import os

HECTARE_IN_ACRES = 2.47105

def load_fertilizer_table():
    base_dir = os.path.dirname(__file__)
    file_path = os.path.join(base_dir, "data", "fertilizer_table.json")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

def _is_validated(input_data):
    if not isinstance(input_data, dict):
        return False
    required_keys = {"location", "soil", "climate", "land", "farmer_constraints"}
    return required_keys.issubset(input_data.keys())

def match_baseline(crop_name, state, irrigation_type):
    """
    Finds the most specific fertilizer baseline for the given crop, state, and condition.
    """
    table = load_fertilizer_table()
    crop_records = [r for r in table if r["crop"].lower() == crop_name.lower()]
    
    if not crop_records:
        return None
        
    # Attempt 1: Match crop + region/state + irrigation condition (e.g., 'irrigated', 'rainfed')
    for rec in crop_records:
        rec_region = rec.get("region", "").lower()
        rec_cond = rec.get("conditions", "").lower()
        if rec_region == state.lower() and irrigation_type.lower() in rec_cond:
            return rec
            
    # Attempt 2: Match crop + region/state regardless of condition
    for rec in crop_records:
        rec_region = rec.get("region", "").lower()
        if rec_region == state.lower():
            return rec
            
    # Attempt 3: Any record for the crop as a fallback?
    # The prompt explicitly warns: "Do not silently substitute a different region's recommendation as if it were universal."
    # Therefore, if region-specific data is requested and not found, we return None.
    return None

def calculate_fertilizer(validated_input, crop_name):
    if not _is_validated(validated_input):
        return {
            "status": "error",
            "error": "FertilizerEngine requires validated advisory input."
        }
        
    state = validated_input["location"]["state"]
    irrigation_type = validated_input["land"]["irrigation_type"]
    
    baseline = match_baseline(crop_name, state, irrigation_type)
    
    if not baseline:
        return {
            "status": "unavailable",
            "warnings": ["regional_baseline_unavailable: No validated baseline found for this crop and region."]
        }
        
    recommended = baseline["recommended"]
    
    soil_n = validated_input["soil"]["nitrogen_kg_ha"]
    soil_p = validated_input["soil"]["phosphorus_kg_ha"]
    soil_k = validated_input["soil"]["potassium_kg_ha"]
    
    # -------------------------------------------------------------------------
    # SAFETY DECISION: UNIT AMBIGUITY
    # Nitrogen is elemental (N). We can calculate deficit safely.
    # Phosphorus and Potassium soil inputs (phosphorus_kg_ha, potassium_kg_ha) 
    # do not explicitly declare if they are elemental (P/K) or oxide (P2O5/K2O).
    # The recommendation is explicitly P2O5 and K2O.
    # We MUST NOT blindly subtract these ambiguous values.
    # -------------------------------------------------------------------------
    
    n_deficit_ha = max(0, recommended["N_kg_ha"] - soil_n)
    
    farm_acres = validated_input["land"]["farm_size_acres"]
    farm_hectares = farm_acres / HECTARE_IN_ACRES
    
    return {
        "status": "available",
        "source": {
            "authority": baseline.get("source", "Unknown"),
            "region": baseline.get("region", "Unknown"),
            "condition": baseline.get("conditions", "Unknown"),
            "notes": baseline.get("notes", "")
        },
        "units": {
            "reference": "kg/ha",
            "soil": "kg/ha (ambiguous P/K)"
        },
        "recommended": {
            "N_kg_ha": recommended.get("N_kg_ha"),
            "P2O5_kg_ha": recommended.get("P2O5_kg_ha"),
            "K2O_kg_ha": recommended.get("K2O_kg_ha")
        },
        "deficit": {
            "N_kg_ha": n_deficit_ha,
            "P2O5_kg_ha": None,
            "K2O_kg_ha": None
        },
        "farm_scale": {
            "farm_size_acres": round(farm_acres, 5),
            "farm_size_hectares": round(farm_hectares, 5),
            "deficit_N_kg_farm": round(n_deficit_ha * farm_hectares, 5)
        },
        "warnings": [
            "Baseline recommendation; adjust according to soil test.",
            "Phosphorus and Potassium deficits cannot be calculated because the soil input chemical representation (elemental vs oxide) is ambiguous. Product conversion is suspended."
        ]
    }
