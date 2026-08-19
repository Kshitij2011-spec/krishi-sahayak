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
        
    for rec in crop_records:
        rec_region = rec.get("region", "").lower()
        rec_cond = rec.get("conditions", "").lower()
        if rec_region == state.lower() and irrigation_type.lower() in rec_cond:
            return rec
            
    for rec in crop_records:
        rec_region = rec.get("region", "").lower()
        if rec_region == state.lower():
            return rec
            
    return None

def get_soil_class(nutrient, value):
    """
    Classifies the soil nutrient value (kg/ha) into Low, Medium, High 
    based on Indian standard soil testing rating charts.
    """
    if nutrient == 'N':
        if value < 240: return 'low'
        if value <= 480: return 'medium'
        return 'high'
    elif nutrient == 'P':
        if value < 11: return 'low'
        if value <= 22: return 'medium'
        return 'high'
    elif nutrient == 'K':
        if value < 110: return 'low'
        if value <= 280: return 'medium'
        return 'high'
    return 'medium'

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
        
    nutrients = baseline.get("nutrients", {})
    
    soil_n = validated_input["soil"]["nitrogen_kg_ha"]
    soil_p = validated_input["soil"]["phosphorus_kg_ha"]
    soil_k = validated_input["soil"]["potassium_kg_ha"]
    
    # Evaluate soil fertility classes
    class_n = get_soil_class('N', soil_n)
    class_p = get_soil_class('P', soil_p)
    class_k = get_soil_class('K', soil_k)
    
    warnings = []
    
    # Process N
    adj_n = 0
    if "N" in nutrients:
        adj_n = nutrients["N"]["adjustments"].get(class_n, nutrients["N"]["baseline_kg_ha"])
        
    # Process P2O5
    adj_p2o5 = 0
    if "P2O5" in nutrients:
        if nutrients["P2O5"].get("requires_organic_carbon", False):
            # Currently farmer input lacks organic carbon.
            # PAU states OC affects P adjustments for medium/high ranges.
            warnings.append("Phosphorus recommendation is degraded. Source requires organic carbon for precise P adjustment; falling back to standard class adjustment.")
        adj_p2o5 = nutrients["P2O5"]["adjustments"].get(class_p, nutrients["P2O5"]["baseline_kg_ha"])
        
    # Process K2O
    adj_k2o = 0
    if "K2O" in nutrients:
        adj_k2o = nutrients["K2O"]["adjustments"].get(class_k, nutrients["K2O"]["baseline_kg_ha"])
    
    # Calculate Product Dosages (kg/ha)
    dap_kg_ha = adj_p2o5 / 0.46 if adj_p2o5 > 0 else 0
    n_from_dap = dap_kg_ha * 0.18
    remaining_n = max(0, adj_n - n_from_dap)
    urea_kg_ha = remaining_n / 0.46
    mop_kg_ha = adj_k2o / 0.60 if adj_k2o > 0 else 0
    
    farm_acres = validated_input["land"]["farm_size_acres"]
    farm_hectares = farm_acres / HECTARE_IN_ACRES
    
    return {
        "status": "available",
        "method": "source_specific_soil_category",
        "source": baseline.get("source", {"authority": "Unknown"}),
        "soil_category": {
            "N": class_n,
            "P": class_p,
            "K": class_k
        },
        "nutrient_recommendation": {
            "N_kg_ha": round(adj_n, 2),
            "P2O5_kg_ha": round(adj_p2o5, 2),
            "K2O_kg_ha": round(adj_k2o, 2)
        },
        "fertilizer_products": {
            "urea_kg_ha": round(urea_kg_ha, 2),
            "dap_kg_ha": round(dap_kg_ha, 2),
            "mop_kg_ha": round(mop_kg_ha, 2)
        },
        "farm_scale": {
            "farm_size_acres": round(farm_acres, 5),
            "farm_size_hectares": round(farm_hectares, 5),
            "urea_kg_farm": round(urea_kg_ha * farm_hectares, 2),
            "dap_kg_farm": round(dap_kg_ha * farm_hectares, 2),
            "mop_kg_farm": round(mop_kg_ha * farm_hectares, 2)
        },
        "warnings": warnings
    }
