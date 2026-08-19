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

def get_pest_risks(crop: str, state: str, district: str, season: str, weather_context=None) -> dict:
    """
    Retrieves proactive pest and disease early warnings from the verified dataset.
    Uses exact region match when available, falls back to regional mapping if required.
    Does NOT use external APIs.
    """
    pest_data = load_pest_data()
    
    crop = crop.lower()
    season = season.lower()
    
    # In the MVP dataset, regions are mapped to 'Vidarbha' or 'Punjab'.
    # A real system would use a rigorous district->region mapping.
    # We will use a simple heuristic based on the state for this dataset.
    region_key = "Unknown"
    if state.lower() == "punjab":
        region_key = "Punjab"
    elif state.lower() == "maharashtra":
        # We assume Vidarbha for MVP
        region_key = "Vidarbha"

    # Search for matching records
    matching_risks = []
    for record in pest_data:
        if record.get("crop", "").lower() == crop and \
           record.get("season", "").lower() == season and \
           record.get("region", "").lower() == region_key.lower():
            matching_risks.extend(record.get("risks", []))

    if not matching_risks:
        return {
            "status": "no_verified_risk_data",
            "risks": [],
            "warning": "No source-backed early-warning data is currently available for this crop, region, and season."
        }

    return {
        "status": "available",
        "risks": matching_risks
    }
