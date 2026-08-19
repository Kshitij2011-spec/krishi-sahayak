import json
import os

def load_taxonomy():
    base_dir = os.path.dirname(__file__)
    file_path = os.path.join(base_dir, "data", "crop_taxonomy.json")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

def _is_validated(input_data):
    # Minimal structural check to ensure it went through validator
    if not isinstance(input_data, dict):
        return False
    # Validate root keys present in a validated object
    required_keys = {"location", "soil", "climate", "land", "farmer_constraints"}
    if not required_keys.issubset(input_data.keys()):
        return False
    return True

def filter_and_score(input_data):
    if not _is_validated(input_data):
        return {
            "valid": False,
            "error": "RuleFilter requires validated advisory input."
        }

    taxonomy = load_taxonomy()
    candidates = []
    excluded = []

    for crop in taxonomy:
        result = evaluate_crop(crop, input_data)
        if result["viable"]:
            candidates.append({
                "crop": crop["crop_name"],
                "agronomic_fit_score": result["agronomic_fit_score"],
                "status": result["status"],
                "rule_results": result["rule_results"]
            })
        else:
            excluded.append({
                "crop": crop["crop_name"],
                "reason_code": result["reason_code"],
                "message": result["message"]
            })

    # Optional: Sort candidates by agronomic_fit_score descending
    candidates.sort(key=lambda x: x["agronomic_fit_score"], reverse=True)

    return {
        "valid": True,
        "candidates": candidates,
        "excluded": excluded
    }

def evaluate_season(crop, input_data):
    season_in = input_data.get("climate", {}).get("season")
    crop_seasons = crop.get("seasons", [])
    if season_in and season_in not in crop_seasons:
        return False, "season_mismatch", f"{crop['display_name']} is a {', '.join(crop_seasons).title()} crop."
    return True, "pass", f"{crop['display_name']} is suitable for {season_in.title() if season_in else 'unknown'}."

def evaluate_water(crop, input_data):
    water_req = crop.get("water", {}).get("classification")
    irr_type = input_data.get("land", {}).get("irrigation_type")
    water_avail = input_data.get("land", {}).get("water_availability", "unknown")
    
    # Hard Rejection condition: irrigation_dependent + rainfed (especially if scarce)
    if water_req == "irrigation_dependent" and irr_type == "rainfed":
        if water_avail == "scarce":
            return False, "water_mismatch", f"{crop['display_name']} requires irrigation but only scarce rainfed water is available."
        elif water_avail == "unknown":
            return False, "water_mismatch", f"{crop['display_name']} requires reliable irrigation (rainfed is insufficient)."
            
    return True, "pass", f"{crop['display_name']} water classification ({water_req}) is compatible with {irr_type}."

def evaluate_ph(crop, input_data):
    ph_in = input_data.get("soil", {}).get("ph")
    ph_min = crop.get("soil", {}).get("ph", {}).get("preferred_min")
    ph_max = crop.get("soil", {}).get("ph", {}).get("preferred_max")
    
    if ph_in is None or ph_min is None or ph_max is None:
        return 0, "pass", "Soil pH data unavailable."
        
    if ph_min <= ph_in <= ph_max:
        return 0, "pass", "Soil pH is within the preferred range."
        
    diff = min(abs(ph_in - ph_min), abs(ph_in - ph_max))
    if diff <= 0.5:
        return 10, "penalty", "Soil pH is slightly outside the preferred range."
    else:
        return 20, "penalty", "Soil pH is far outside the preferred range."

def evaluate_temperature(crop, input_data):
    temp_in = input_data.get("climate", {}).get("temperature_c")
    if temp_in is None:
        return 0, "pass", "Temperature data not provided."
        
    t_min = crop.get("climate", {}).get("temperature", {}).get("preferred_min_c")
    t_max = crop.get("climate", {}).get("temperature", {}).get("preferred_max_c")
    
    if t_min is None or t_max is None:
        return 0, "pass", "Crop temperature preferences unavailable."
        
    if t_min <= temp_in <= t_max:
        return 0, "pass", "Temperature is optimal."
        
    diff = min(abs(temp_in - t_min), abs(temp_in - t_max))
    if diff <= 5:
        return 5, "penalty", "Temperature is slightly outside optimal."
    else:
        return 15, "penalty", "Temperature is far outside optimal."

def evaluate_rainfall(crop, input_data):
    rain_in = input_data.get("climate", {}).get("rainfall_mm")
    irr_type = input_data.get("land", {}).get("irrigation_type")
    
    if rain_in is None:
        return 0, "pass", "Rainfall data not provided."
        
    r_min = crop.get("climate", {}).get("rainfall", {}).get("preferred_min_mm")
    if r_min is None:
        return 0, "pass", "Crop rainfall preferences unavailable."
        
    if rain_in >= r_min:
        return 0, "pass", "Rainfall is adequate."
        
    if irr_type == "rainfed":
        return 20, "penalty", "Rainfall is low for a rainfed setup."
    else:
        return 5, "penalty", "Low rainfall is compensated by irrigation."

def evaluate_crop(crop, input_data):
    base_score = 100
    rule_results = []
    
    # 1. Season (Hard)
    s_pass, s_code, s_msg = evaluate_season(crop, input_data)
    if not s_pass:
        return {"viable": False, "reason_code": s_code, "message": s_msg}
    rule_results.append({"rule": "season", "result": "pass", "message": s_msg})
    
    # 2. Water (Hard)
    w_pass, w_code, w_msg = evaluate_water(crop, input_data)
    if not w_pass:
        return {"viable": False, "reason_code": w_code, "message": w_msg}
    rule_results.append({"rule": "water", "result": "pass", "message": w_msg})
    
    # 3. pH (Soft)
    ph_pen, ph_res, ph_msg = evaluate_ph(crop, input_data)
    base_score -= ph_pen
    rule_results.append({"rule": "ph", "result": ph_res, "message": ph_msg})
    
    # 4. Temperature (Soft)
    t_pen, t_res, t_msg = evaluate_temperature(crop, input_data)
    base_score -= t_pen
    rule_results.append({"rule": "temperature", "result": t_res, "message": t_msg})
    
    # 5. Rainfall (Soft)
    r_pen, r_res, r_msg = evaluate_rainfall(crop, input_data)
    base_score -= r_pen
    rule_results.append({"rule": "rainfall", "result": r_res, "message": r_msg})
    
    # Ensure score doesn't drop below 0
    base_score = max(0, base_score)
    
    return {
        "viable": True,
        "agronomic_fit_score": base_score,
        "status": "viable",
        "rule_results": rule_results
    }
