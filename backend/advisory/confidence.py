def calculate_confidence(agronomic_fit_score, data_completeness, field_quality, regional_status):
    """
    Calculates the deterministic confidence score for an advisory recommendation.
    """
    # --- 1. Agronomic Fit (0-100) ---
    agronomic_fit = max(0, min(100, agronomic_fit_score))

    # --- 2. Data Quality (0-100) ---
    mandatory_total = data_completeness.get("mandatory_total", 0)
    mandatory_present = data_completeness.get("mandatory_present", 0)
    
    # We don't have an exact total for optional, but we can just use the count
    
    dq_score = 100
    missing_mandatory = mandatory_total - mandatory_present
    
    if missing_mandatory > 0:
        dq_score -= 60
        
    has_defaulted = False
    has_farmer_entered = False
    has_verified = False
    
    # Analyze sources of present fields
    for field, source in field_quality.items():
        if source == "defaulted_regional_avg":
            has_defaulted = True
        elif source in ["farmer_entered", "test_strip_photo"]:
            has_farmer_entered = True
        elif source in ["soil_health_card", "lab_verified"]:
            has_verified = True
            
    if has_defaulted:
        dq_score -= 20
    elif has_farmer_entered:
        dq_score -= 10
        
    dq_score = max(0, min(100, dq_score))

    # --- 3. Regional Evidence (0-100) ---
    if regional_status == "supported":
        reg_score = 100
    elif regional_status == "unavailable":
        reg_score = 50
    else:  # not_supported / unsupported
        reg_score = 25
        
    # --- Weighting ---
    base_confidence = (agronomic_fit * 0.50) + (dq_score * 0.30) + (reg_score * 0.20)
    base_confidence = int(round(base_confidence))
    
    # --- Caps ---
    applied_cap = 100
    notes = []
    
    if missing_mandatory > 0:
        applied_cap = 40
        notes.append("Confidence is heavily capped (max 40) because mandatory data is missing.")
    elif has_defaulted:
        applied_cap = 65
        notes.append("Confidence is capped (max 65) because some mandatory data relies on regional defaults.")
    elif has_farmer_entered and not has_verified:
        applied_cap = 82
        notes.append("Confidence is capped (max 82) because data is farmer-entered rather than lab-verified.")
    elif has_verified:
        applied_cap = 92
        notes.append("Strong verified data provided (max 92).")
        
    if regional_status == "supported":
        notes.append("Regional crop-affinity evidence is available and supports this crop.")
    elif regional_status == "unavailable":
        notes.append("Regional crop-affinity evidence is unavailable for this district.")
    else:
        notes.append("Regional evidence does not historically support this crop in this district.")
        
    if agronomic_fit >= 80:
        notes.append("Soil, season and water conditions strongly match the selected crop.")
    elif agronomic_fit < 50:
        notes.append("Agronomic fit is weak, reducing confidence.")
        
    final_confidence = min(base_confidence, applied_cap)
    
    # --- Qualitative Status ---
    if final_confidence <= 39:
        status = "very_low"
    elif final_confidence <= 59:
        status = "low"
    elif final_confidence <= 74:
        status = "moderate"
    elif final_confidence <= 89:
        status = "high"
    else:
        status = "very_high"
        
    return {
        "overall": final_confidence,
        "status": status,
        "components": {
            "agronomic_fit": agronomic_fit,
            "data_quality": dq_score,
            "regional_evidence": reg_score
        },
        "cap": applied_cap,
        "method": "deterministic_heuristic",
        "notes": notes
    }
