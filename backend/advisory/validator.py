import numbers

def validate_advisory_input(raw_input):
    valid = True
    errors = []
    warnings = []
    data = {}
    field_quality = {}
    
    if not isinstance(raw_input, dict):
        return {
            "valid": False,
            "errors": [{"field": "root", "code": "invalid_structure", "message": "Input must be a JSON object."}],
            "warnings": [],
            "data": None,
            "field_quality": {}
        }
        
    def add_error(field, code, message):
        nonlocal valid
        valid = False
        errors.append({"field": field, "code": code, "message": message})
        
    def add_warning(field, code, message):
        warnings.append({"field": field, "code": code, "message": message})
        
    def extract_text(parent, key, max_length=200):
        val = parent.get(key)
        if val is None:
            return None
        if not isinstance(val, str):
            add_error(key, "invalid_type", f"Field {key} must be a string.")
            return None
        val = val.strip()
        if not val:
            add_error(key, "empty_string", f"Field {key} cannot be empty.")
            return None
        if len(val) > max_length:
            val = val[:max_length]
            add_warning(key, "truncated", f"Field {key} truncated to {max_length} characters.")
        return val

    def extract_number(parent, key):
        val = parent.get(key)
        if val is None:
            return None
        if not isinstance(val, numbers.Number) or isinstance(val, bool):
            add_error(key, "invalid_type", f"Field {key} must be a number.")
            return None
        return val

    def get_quality(parent, field_prefix):
        q = parent.get("data_source")
        valid_sources = ["soil_health_card", "farmer_entered", "test_strip_photo", "defaulted_regional_avg"]
        if q in valid_sources:
            return q
        elif q is None:
            return "missing"
        else:
            add_warning(f"{field_prefix}.data_source", "invalid_enum", f"Unknown data source: {q}")
            return "missing"

    # --- LOCATION ---
    location = raw_input.get("location", {})
    if not isinstance(location, dict):
        add_error("location", "invalid_type", "location must be an object.")
        location = {}
        
    state = extract_text(location, "state")
    if state is None:
        add_error("location.state", "missing_field", "State is required.")
    else:
        state = state.title()
        
    district = extract_text(location, "district")
    if district is None:
        add_error("location.district", "missing_field", "District is required.")
    else:
        district = district.title()

    if state and district:
        data["location"] = {"state": state, "district": district}
        
    # --- SOIL ---
    soil = raw_input.get("soil", {})
    if not isinstance(soil, dict):
        add_error("soil", "invalid_type", "soil must be an object.")
        soil = {}
        
    soil_data = {}
    ph = extract_number(soil, "ph")
    if ph is None:
        add_error("soil.ph", "missing_field", "Soil pH is required.")
    else:
        if ph < 0 or ph > 14:
            add_error("soil.ph", "out_of_range", "Soil pH must be between 0 and 14.")
        else:
            soil_data["ph"] = ph

    n = extract_number(soil, "nitrogen_kg_ha")
    if n is None:
        add_error("soil.nitrogen_kg_ha", "missing_field", "Nitrogen is required.")
    else:
        if n < 0:
            add_error("soil.nitrogen_kg_ha", "out_of_range", "Nitrogen cannot be negative.")
        else:
            soil_data["nitrogen_kg_ha"] = n

    p = extract_number(soil, "phosphorus_kg_ha")
    if p is None:
        add_error("soil.phosphorus_kg_ha", "missing_field", "Phosphorus is required.")
    else:
        if p < 0:
            add_error("soil.phosphorus_kg_ha", "out_of_range", "Phosphorus cannot be negative.")
        else:
            soil_data["phosphorus_kg_ha"] = p

    k = extract_number(soil, "potassium_kg_ha")
    if k is None:
        add_error("soil.potassium_kg_ha", "missing_field", "Potassium is required.")
    else:
        if k < 0:
            add_error("soil.potassium_kg_ha", "out_of_range", "Potassium cannot be negative.")
        else:
            soil_data["potassium_kg_ha"] = k
            
    if soil_data:
        data["soil"] = soil_data
        
    soil_quality = get_quality(soil, "soil")
    for key in ["ph", "nitrogen_kg_ha", "phosphorus_kg_ha", "potassium_kg_ha"]:
        field_quality[f"soil.{key}"] = soil_quality

    # --- CLIMATE ---
    climate = raw_input.get("climate", {})
    if not isinstance(climate, dict):
        add_error("climate", "invalid_type", "climate must be an object.")
        climate = {}
        
    season = extract_text(climate, "season")
    if season is None:
        add_error("climate.season", "missing_field", "Season is required.")
    else:
        season = season.lower()
        if season not in ["kharif", "rabi", "zaid"]:
            add_error("climate.season", "invalid_enum", "Season must be kharif, rabi, or zaid.")
        else:
            data["climate"] = {"season": season}

    field_quality["climate.season"] = get_quality(climate, "climate")

    # --- LAND ---
    land = raw_input.get("land", {})
    if not isinstance(land, dict):
        add_error("land", "invalid_type", "land must be an object.")
        land = {}
        
    land_data = {}
    farm_size = extract_number(land, "farm_size_acres")
    if farm_size is None:
        add_error("land.farm_size_acres", "missing_field", "Farm size is required.")
    else:
        if farm_size <= 0:
            add_error("land.farm_size_acres", "out_of_range", "Farm size must be > 0.")
        else:
            land_data["farm_size_acres"] = farm_size

    irrig = extract_text(land, "irrigation_type")
    if irrig is None:
        add_error("land.irrigation_type", "missing_field", "Irrigation type is required.")
    else:
        irrig = irrig.lower()
        if irrig not in ["rainfed", "canal", "borewell", "drip", "sprinkler"]:
            add_error("land.irrigation_type", "invalid_enum", "Unknown irrigation type.")
        else:
            land_data["irrigation_type"] = irrig
            
    water = extract_text(land, "water_availability")
    if water is not None:
        water = water.lower()
        if water in ["abundant", "moderate", "scarce"]:
            land_data["water_availability"] = water
        else:
            add_error("land.water_availability", "invalid_enum", "Unknown water availability.")

    if land_data:
        data["land"] = land_data
        
    land_quality = get_quality(land, "land")
    field_quality["land.farm_size_acres"] = land_quality
    field_quality["land.irrigation_type"] = land_quality
    if "water_availability" in land_data:
        field_quality["land.water_availability"] = land_quality

    # --- FARMER CONSTRAINTS ---
    constraints = raw_input.get("farmer_constraints", {})
    if not isinstance(constraints, dict):
        add_error("farmer_constraints", "invalid_type", "farmer_constraints must be an object.")
        constraints = {}
        
    const_data = {}
    budget = extract_number(constraints, "budget_available_inr")
    if budget is None:
        add_error("farmer_constraints.budget_available_inr", "missing_field", "Budget is required.")
    else:
        if budget < 0:
            add_error("farmer_constraints.budget_available_inr", "out_of_range", "Budget cannot be negative.")
        else:
            const_data["budget_available_inr"] = budget

    labor = extract_text(constraints, "labor_availability")
    if labor is not None:
        labor = labor.lower()
        if labor in ["family only", "hired available", "limited"]:
            const_data["labor_availability"] = labor
        else:
            add_error("farmer_constraints.labor_availability", "invalid_enum", "Unknown labor availability.")

    risk = extract_text(constraints, "risk_appetite")
    if risk is not None:
        risk = risk.lower()
        if risk in ["low", "medium", "high"]:
            const_data["risk_appetite"] = risk
        else:
            add_error("farmer_constraints.risk_appetite", "invalid_enum", "Unknown risk appetite.")
            
    goal = extract_text(constraints, "primary_goal")
    if goal is not None:
        goal = goal.lower()
        if goal in ["max_yield", "max_profit", "food_security", "soil_health"]:
            const_data["primary_goal"] = goal
        else:
            add_error("farmer_constraints.primary_goal", "invalid_enum", "Unknown primary goal.")

    if const_data:
        data["farmer_constraints"] = const_data

    const_quality = get_quality(constraints, "farmer_constraints")
    field_quality["farmer_constraints.budget_available_inr"] = const_quality
    for k in ["labor_availability", "risk_appetite", "primary_goal"]:
        if k in const_data:
            field_quality[f"farmer_constraints.{k}"] = const_quality

    # Unknown fields at the root
    known_root = {"location", "soil", "climate", "land", "farmer_constraints"}
    for k in raw_input.keys():
        if k not in known_root:
            add_warning(k, "unknown_field", f"Field {k} is unknown and ignored.")

    mandatory_total = 10
    mandatory_present = 0
    optional_present = 0
    
    if valid:
        if "location" in data:
            if "state" in data["location"]: mandatory_present += 1
            if "district" in data["location"]: mandatory_present += 1
        if "soil" in data:
            if "ph" in data["soil"]: mandatory_present += 1
            if "nitrogen_kg_ha" in data["soil"]: mandatory_present += 1
            if "phosphorus_kg_ha" in data["soil"]: mandatory_present += 1
            if "potassium_kg_ha" in data["soil"]: mandatory_present += 1
        if "climate" in data:
            if "season" in data["climate"]: mandatory_present += 1
        if "land" in data:
            if "farm_size_acres" in data["land"]: mandatory_present += 1
            if "irrigation_type" in data["land"]: mandatory_present += 1
            if "water_availability" in data["land"]: optional_present += 1
        if "farmer_constraints" in data:
            if "budget_available_inr" in data["farmer_constraints"]: mandatory_present += 1
            if "labor_availability" in data["farmer_constraints"]: optional_present += 1
            if "risk_appetite" in data["farmer_constraints"]: optional_present += 1
            if "primary_goal" in data["farmer_constraints"]: optional_present += 1
            
    # As per prompt:
    # invalid input returns data: None and field_quality: {}
    return {
        "valid": valid,
        "errors": errors,
        "warnings": warnings if valid else [],
        "data": data if valid else None,
        "field_quality": field_quality if valid else {},
        "completeness": {
            "mandatory_total": mandatory_total,
            "mandatory_present": mandatory_present,
            "optional_present": optional_present
        }
    }
