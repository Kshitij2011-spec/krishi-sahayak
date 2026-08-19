import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))
from backend.advisory.fertilizer_engine import calculate_fertilizer, HECTARE_IN_ACRES

def get_base_validated():
    return {
        "location": {"state": "Punjab", "district": "Ludhiana"},
        "soil": {"ph": 6.5, "nitrogen_kg_ha": 300, "phosphorus_kg_ha": 15, "potassium_kg_ha": 200},
        "climate": {"season": "rabi"},
        "land": {"farm_size_acres": 2.47105, "irrigation_type": "irrigated"},
        "farmer_constraints": {"budget_available_inr": 10000}
    }

class TestFertilizerEngine(unittest.TestCase):
    
    # --- A. Valid baseline lookup ---
    def test_01_wheat_punjab_irrigated(self):
        data = get_base_validated()
        data["land"]["irrigation_type"] = "irrigated"
        res = calculate_fertilizer(data, "wheat")
        self.assertEqual(res["status"], "baseline_available")
        self.assertIn("PAU", res["source"]["authority"])
        self.assertEqual(res["recommended_baseline"]["N_kg_ha"], 120)

    def test_02_cotton_punjab_baseline(self):
        data = get_base_validated()
        data["climate"]["season"] = "kharif"
        data["land"]["irrigation_type"] = "bt_cotton"
        res = calculate_fertilizer(data, "cotton")
        self.assertEqual(res["status"], "baseline_available")
        self.assertEqual(res["recommended_baseline"]["N_kg_ha"], 150)

    # --- B. Soil Test Class & Adjustment Validation ---
    def test_03_medium_soil_class_no_adjustment(self):
        # Medium N: 240-480, P: 11-22, K: 110-280
        data = get_base_validated()
        data["soil"]["nitrogen_kg_ha"] = 300 # Medium
        data["soil"]["phosphorus_kg_ha"] = 15 # Medium
        data["soil"]["potassium_kg_ha"] = 200 # Medium
        res = calculate_fertilizer(data, "wheat")
        
        self.assertEqual(res["soil_analysis"]["N_class"], "medium")
        self.assertEqual(res["soil_analysis"]["P_class"], "medium")
        self.assertEqual(res["soil_analysis"]["K_class"], "medium")
        
        self.assertEqual(res["adjusted_dose"]["N_kg_ha"], res["recommended_baseline"]["N_kg_ha"])
        self.assertEqual(res["adjusted_dose"]["P2O5_kg_ha"], res["recommended_baseline"]["P2O5_kg_ha"])
        self.assertEqual(res["adjusted_dose"]["K2O_kg_ha"], res["recommended_baseline"]["K2O_kg_ha"])

    def test_04_low_soil_class_increase_dose(self):
        # Low N < 240, Low P < 11, Low K < 110
        data = get_base_validated()
        data["soil"]["nitrogen_kg_ha"] = 100
        data["soil"]["phosphorus_kg_ha"] = 5
        data["soil"]["potassium_kg_ha"] = 50
        res = calculate_fertilizer(data, "wheat")
        
        self.assertEqual(res["soil_analysis"]["N_class"], "low")
        self.assertEqual(res["soil_analysis"]["P_class"], "low")
        self.assertEqual(res["soil_analysis"]["K_class"], "low")
        
        # 120 N -> 150
        self.assertEqual(res["adjusted_dose"]["N_kg_ha"], 120 * 1.25)
        # 60 P2O5 -> 75
        self.assertEqual(res["adjusted_dose"]["P2O5_kg_ha"], 60 * 1.25)

    def test_05_high_soil_class_decrease_dose(self):
        # High N > 480, High P > 22, High K > 280
        data = get_base_validated()
        data["soil"]["nitrogen_kg_ha"] = 500
        data["soil"]["phosphorus_kg_ha"] = 30
        data["soil"]["potassium_kg_ha"] = 300
        res = calculate_fertilizer(data, "wheat")
        
        self.assertEqual(res["soil_analysis"]["N_class"], "high")
        
        # 120 N -> 90
        self.assertEqual(res["adjusted_dose"]["N_kg_ha"], 120 * 0.75)
        
    def test_06_product_conversion_balancing(self):
        # Medium soil, Wheat GRD is 120 N, 60 P2O5, 30 K2O
        data = get_base_validated()
        res = calculate_fertilizer(data, "wheat")
        
        # DAP = P2O5 / 0.46
        expected_dap = 60 / 0.46
        self.assertAlmostEqual(res["products_per_ha"]["dap_kg_ha"], expected_dap, places=2)
        
        # Urea = (N - (DAP * 0.18)) / 0.46
        expected_urea = (120 - (expected_dap * 0.18)) / 0.46
        self.assertAlmostEqual(res["products_per_ha"]["urea_kg_ha"], expected_urea, places=2)

    # --- C. Farm scaling ---
    def test_07_one_hectare_equivalence(self):
        data = get_base_validated()
        data["land"]["farm_size_acres"] = HECTARE_IN_ACRES
        res = calculate_fertilizer(data, "wheat")
        
        self.assertAlmostEqual(res["farm_scale"]["urea_kg_farm"], res["products_per_ha"]["urea_kg_ha"], places=2)

    def test_08_two_acres_scaling(self):
        data = get_base_validated()
        data["land"]["farm_size_acres"] = 2.0
        res = calculate_fertilizer(data, "wheat")
        hectares = 2.0 / HECTARE_IN_ACRES
        
        expected_urea_farm = res["products_per_ha"]["urea_kg_ha"] * hectares
        self.assertAlmostEqual(res["farm_scale"]["urea_kg_farm"], expected_urea_farm, places=2)

    # --- D. Regional selection ---
    def test_09_punjab_does_not_become_maharashtra(self):
        data = get_base_validated()
        data["location"]["state"] = "Maharashtra"
        res = calculate_fertilizer(data, "wheat")
        self.assertEqual(res["status"], "unavailable")
        
    # --- E. Missing data ---
    def test_10_unsupported_crop(self):
        data = get_base_validated()
        res = calculate_fertilizer(data, "alien_crop")
        self.assertEqual(res["status"], "unavailable")

    def test_11_invalid_structure(self):
        res = calculate_fertilizer({"broken": "data"}, "wheat")
        self.assertEqual(res["status"], "error")

if __name__ == '__main__':
    unittest.main()
