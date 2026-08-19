import unittest
import os
from unittest.mock import patch

from backend.advisory.engine import run_advisory

def get_base_scenario():
    return {
        "location": {"state": "Punjab", "district": "Ludhiana"},
        "soil": {
            "ph": 7.0,
            "nitrogen_kg_ha": 300,
            "phosphorus_kg_ha": 15,
            "potassium_kg_ha": 200,
            "data_source": "soil_health_card"
        },
        "climate": {"season": "rabi"},
        "land": {
            "farm_size_acres": 2,
            "irrigation_type": "canal",
            "water_availability": "moderate"
        },
        "farmer_constraints": {
            "budget_available_inr": 15000,
            "risk_appetite": "medium",
            "primary_goal": "max_profit"
        }
    }

class TestAuditPrinciples(unittest.TestCase):
    def setUp(self):
        self.env_patcher = patch.dict(os.environ, {"GOOGLE_API_KEY": "", "GEMINI_MODEL_NAME": ""})
        self.env_patcher.start()
        
    def tearDown(self):
        self.env_patcher.stop()

    def test_q01_ludhiana_rabi_wheat_viable(self):
        data = get_base_scenario()
        res = run_advisory(data)
        candidates = [c["crop"].lower() for c in res.get("candidate_crops", [])]
        self.assertIn("wheat", candidates)
        
    def test_q02_ludhiana_kharif_wheat_excluded(self):
        data = get_base_scenario()
        data["climate"]["season"] = "kharif"
        res = run_advisory(data)
        candidates = [c["crop"].lower() for c in res.get("candidate_crops", [])]
        self.assertNotIn("wheat", candidates)
        
    def test_q03_nagpur_kharif_rainfed(self):
        data = get_base_scenario()
        data["location"]["state"] = "Maharashtra"
        data["location"]["district"] = "Nagpur"
        data["climate"]["season"] = "kharif"
        data["land"]["irrigation_type"] = "rainfed"
        data["land"]["water_availability"] = "moderate"
        res = run_advisory(data)
        candidates = [c["crop"].lower() for c in res.get("candidate_crops", [])]
        self.assertIn("soybean", candidates)
        self.assertIn("cotton", candidates)
        
    def test_q04_rice_scarce_rainfed(self):
        # Rice must be excluded if rainfed and scarce
        data = get_base_scenario()
        data["climate"]["season"] = "kharif"
        data["land"]["irrigation_type"] = "rainfed"
        data["land"]["water_availability"] = "scarce"
        res = run_advisory(data)
        candidates = [c["crop"].lower() for c in res.get("candidate_crops", [])]
        self.assertNotIn("rice", candidates)
        
    def test_q05_unknown_district(self):
        data = get_base_scenario()
        data["location"]["district"] = "Nowhere"
        res = run_advisory(data)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["top_recommendation"]["regional_context"], "unavailable")
        
    def test_q06_missing_fertilizer(self):
        # Lentil does not have fertilizer data
        data = get_base_scenario()
        # Ensure lentil is top by hacking its score if necessary, but actually we can just check the alternative list
        res = run_advisory(data)
        self.assertEqual(res["status"], "success")
        
        found = False
        all_crops = [res["top_recommendation"]] + res["alternatives"]
        for c in all_crops:
            if c["crop"].lower() == "lentil":
                self.assertEqual(c["fertilizer"]["status"], "unavailable")
                found = True
        self.assertTrue(found, "Lentil should be viable in Ludhiana Rabi")
        
    def test_q07_unsupported_variety(self):
        data = get_base_scenario()
        res = run_advisory(data)
        # Deterministic fallback keeps variety null
        self.assertIsNone(res["top_recommendation"]["variety"])

if __name__ == '__main__':
    unittest.main()
