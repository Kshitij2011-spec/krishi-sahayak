import json
import os
import logging

logger = logging.getLogger(__name__)

def load_pest_data():
    base_dir = os.path.dirname(__file__)
    file_path = os.path.join(base_dir, "data", "pest_risk.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def get_pest_risks(crop: str, state: str, district: str, season: str, weather_context=None, trap_count=None, crop_stage=None) -> dict:
    """
    Retrieves proactive pest and disease early warnings from the verified dataset.
    Uses exact region match when available, falls back to regional mapping if required.
    Does NOT use external APIs for pest lookup. Calculates dynamic risk based on weather and traps.

    crop_stage is accepted and returned for the caller to incorporate into risk scoring,
    but is not used inside this function (avoids double-counting in the scoring layer).
    """
    pest_data = load_pest_data()
    
    crop = crop.lower()
    season = season.lower()
    
    # We now strictly focus on Maharashtra
    region_key = "Maharashtra" if state.lower() == "maharashtra" else state

    # Search for matching records
    matching_risks = []
    for record in pest_data:
        if record.get("crop", "").lower() == crop and \
           record.get("region", "").lower() == region_key.lower():
            if record.get("season", "").lower() in [season, "perennial", "all"]:
                risks = json.loads(json.dumps(record.get("risks", []))) # Deep copy
                for risk in risks:
                    current_alert_level = "Low Alert"
                    etl = risk.get("etl", {})
                    
                    if weather_context and weather_context.get("status") == "available":
                        current = weather_context.get("current", {})
                        temp = current.get("temperature_c")
                        hum = current.get("humidity_pct")
                        
                        if temp is not None and hum is not None:
                            wc = etl.get("weather_conditions", {})
                            if wc:
                                t_min = wc.get("temp_min", -100)
                                t_max = wc.get("temp_max", 100)
                                h_min = wc.get("humidity_min", 0)
                                h_max = wc.get("humidity_max", 100)
                                
                                if (t_min <= temp <= t_max) and (h_min <= hum <= h_max):
                                    current_alert_level = "Moderate Alert"
                                    
                    if trap_count is not None:
                        tc_threshold = etl.get("trap_count_threshold")
                        if tc_threshold is not None and trap_count >= tc_threshold:
                            current_alert_level = "Severe Alert"
                            
                    risk["current_alert_level"] = current_alert_level
                    matching_risks.append(risk)

    if not matching_risks:
        return {
            "status": "no_verified_risk_data",
            "risks": [],
            "crop_stage": crop_stage,
            "warning": "No source-backed early-warning data is currently available for this crop, region, and season."
        }

    return {
        "status": "available",
        "risks": matching_risks,
        "crop_stage": crop_stage,
    }

