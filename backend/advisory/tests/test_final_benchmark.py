import unittest
from backend.advisory.engine import run_advisory

class TestFinalBenchmark(unittest.TestCase):
    """
    Final Quality Benchmark scenarios for Phase 2I.
    These test that the advisory engine handles realistic contextual scenarios
    correctly and robustly.
    """

    def _run_and_validate(self, payload):
        res = run_advisory(payload)
        self.assertEqual(res["status"], "success")
        self.assertIn("top_recommendation", res)
        self.assertIn("confidence", res)
        return res

    def test_fb01_punjab_rabi_irrigated(self):
        """FB-01: Punjab / Ludhiana / Rabi / irrigated / wheat-compatible"""
        payload = {
            "location": {"state": "Punjab", "district": "Ludhiana"},
            "soil": {"ph": 7.2, "nitrogen_kg_ha": 200, "phosphorus_kg_ha": 30, "potassium_kg_ha": 150},
            "climate": {"season": "rabi"},
            "land": {"farm_size_acres": 5, "irrigation_type": "canal", "water_availability": "abundant"},
            "farmer_constraints": {"budget_available_inr": 20000, "risk_appetite": "low", "primary_goal": "max_profit"}
        }
        res = self._run_and_validate(payload)
        top_crop = res["top_recommendation"]["crop"]
        # In Punjab Rabi with good water, wheat is overwhelmingly favored
        self.assertEqual(top_crop, "wheat")
        
    def test_fb02_punjab_kharif_moderate(self):
        """FB-02: Punjab / Bathinda / Kharif / moderate water"""
        payload = {
            "location": {"state": "Punjab", "district": "Bathinda"},
            "soil": {"ph": 7.5, "nitrogen_kg_ha": 180, "phosphorus_kg_ha": 25, "potassium_kg_ha": 140},
            "climate": {"season": "kharif"},
            "land": {"farm_size_acres": 3, "irrigation_type": "borewell", "water_availability": "moderate"},
            "farmer_constraints": {"budget_available_inr": 15000, "risk_appetite": "medium", "primary_goal": "max_yield"}
        }
        res = self._run_and_validate(payload)
        # Should not recommend crops that absolutely require 'abundant' water like rice unless it's the only option
        top_crop = res["top_recommendation"]["crop"]
        self.assertIn(top_crop, ["cotton", "maize"])
        
    def test_fb03_nagpur_kharif_rainfed(self):
        """FB-03: Maharashtra / Nagpur / Kharif / rainfed / soybean-cotton-pigeonpea"""
        payload = {
            "location": {"state": "Maharashtra", "district": "Nagpur"},
            "soil": {"ph": 6.8, "nitrogen_kg_ha": 150, "phosphorus_kg_ha": 20, "potassium_kg_ha": 130},
            "climate": {"season": "kharif"},
            "land": {"farm_size_acres": 4, "irrigation_type": "rainfed", "water_availability": "moderate"},
            "farmer_constraints": {"budget_available_inr": 12000, "risk_appetite": "medium", "primary_goal": "max_profit"}
        }
        res = self._run_and_validate(payload)
        top_crop = res["top_recommendation"]["crop"]
        self.assertIn(top_crop, ["soybean", "cotton", "pigeonpea"])
        
    def test_fb04_amravati_kharif_rainfed(self):
        """FB-04: Maharashtra / Amravati / Kharif / rainfed"""
        payload = {
            "location": {"state": "Maharashtra", "district": "Amravati"},
            "soil": {"ph": 7.1, "nitrogen_kg_ha": 190, "phosphorus_kg_ha": 22, "potassium_kg_ha": 145},
            "climate": {"season": "kharif"},
            "land": {"farm_size_acres": 2.5, "irrigation_type": "rainfed", "water_availability": "moderate"},
            "farmer_constraints": {"budget_available_inr": 10000, "risk_appetite": "low", "primary_goal": "max_yield"}
        }
        res = self._run_and_validate(payload)
        top_crop = res["top_recommendation"]["crop"]
        self.assertIn(top_crop, ["soybean", "cotton", "pigeonpea"])
        
    def test_fb05_nagpur_rabi_low_water(self):
        """FB-05: Nagpur / Rabi / low-water scenario"""
        payload = {
            "location": {"state": "Maharashtra", "district": "Nagpur"},
            "soil": {"ph": 7.0, "nitrogen_kg_ha": 160, "phosphorus_kg_ha": 15, "potassium_kg_ha": 110},
            "climate": {"season": "rabi"},
            "land": {"farm_size_acres": 2, "irrigation_type": "rainfed", "water_availability": "scarce"},
            "farmer_constraints": {"budget_available_inr": 8000, "risk_appetite": "low", "primary_goal": "food_security"}
        }
        res = self._run_and_validate(payload)
        top_crop = res["top_recommendation"]["crop"]
        self.assertEqual(top_crop, "chickpea") # Chickpea fits Rabi low-water in Maharashtra
        
    def test_fb06_low_budget_farmer(self):
        """FB-06: Low-budget farmer"""
        payload = {
            "location": {"state": "Maharashtra", "district": "Pune"},
            "soil": {"ph": 6.9, "nitrogen_kg_ha": 140, "phosphorus_kg_ha": 10, "potassium_kg_ha": 100},
            "climate": {"season": "kharif"},
            "land": {"farm_size_acres": 1.5, "irrigation_type": "rainfed", "water_availability": "scarce"},
            "farmer_constraints": {"budget_available_inr": 2000, "risk_appetite": "low", "primary_goal": "food_security"}
        }
        res = self._run_and_validate(payload)
        # Should heavily penalize high-input crops.
        self.assertTrue(len(res["candidate_crops"]) > 0)
        
    def test_fb07_strong_soil_vs_weak_farmer_data(self):
        """FB-07: Strong soil data vs weaker farmer-entered data"""
        payload = {
            "location": {"state": "Punjab", "district": "Sangrur"},
            "soil": {"ph": 7.4, "nitrogen_kg_ha": 300, "phosphorus_kg_ha": 40, "potassium_kg_ha": 250, "data_source": "farmer_entered"},
            "climate": {"season": "rabi"},
            "land": {"farm_size_acres": 4, "irrigation_type": "canal", "water_availability": "abundant"},
            "farmer_constraints": {"budget_available_inr": 25000, "risk_appetite": "medium", "primary_goal": "max_profit"}
        }
        res = self._run_and_validate(payload)
        # Verify confidence is appropriately capped due to 'farmer_entered'
        self.assertLessEqual(res["confidence"]["overall"], 82)
        
    def test_fb08_weather_aware(self):
        """FB-08: Weather-aware scenario"""
        payload = {
            "location": {"state": "Punjab", "district": "Ludhiana"},
            "soil": {"ph": 7.2, "nitrogen_kg_ha": 200, "phosphorus_kg_ha": 30, "potassium_kg_ha": 150},
            "climate": {"season": "rabi"},
            "land": {"farm_size_acres": 5, "irrigation_type": "canal", "water_availability": "abundant"},
            "farmer_constraints": {"budget_available_inr": 20000, "risk_appetite": "low", "primary_goal": "max_profit"}
        }
        res = self._run_and_validate(payload)
        # Test just verifies weather context is fetched (if network works) or fails gracefully
        self.assertIn("weather_context", res)
        
    def test_fb09_market_aware(self):
        """FB-09: Market-aware scenario"""
        payload = {
            "location": {"state": "Maharashtra", "district": "Nagpur"},
            "soil": {"ph": 6.8, "nitrogen_kg_ha": 150, "phosphorus_kg_ha": 20, "potassium_kg_ha": 130},
            "climate": {"season": "kharif"},
            "land": {"farm_size_acres": 4, "irrigation_type": "rainfed", "water_availability": "moderate"},
            "farmer_constraints": {"budget_available_inr": 12000, "risk_appetite": "medium", "primary_goal": "max_profit"}
        }
        res = self._run_and_validate(payload)
        self.assertIn("market_context", res)
        
    def test_fb10_pest_risk(self):
        """FB-10: Pest-risk scenario"""
        payload = {
            "location": {"state": "Maharashtra", "district": "Nagpur"},
            "soil": {"ph": 7.0, "nitrogen_kg_ha": 180, "phosphorus_kg_ha": 25, "potassium_kg_ha": 140},
            "climate": {"season": "kharif"},
            "land": {"farm_size_acres": 3, "irrigation_type": "rainfed", "water_availability": "moderate"},
            "farmer_constraints": {"budget_available_inr": 15000, "risk_appetite": "medium", "primary_goal": "max_profit"}
        }
        res = self._run_and_validate(payload)
        # Cotton is in the region, so there might be a pest risk for it if selected
        self.assertIn("risk_and_prevention", res["top_recommendation"])

if __name__ == '__main__':
    unittest.main()
