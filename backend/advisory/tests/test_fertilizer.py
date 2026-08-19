import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))
from backend.advisory.fertilizer_engine import calculate_fertilizer, HECTARE_IN_ACRES

def get_base_validated():
    return {
        "location": {"state": "Punjab", "district": "Ludhiana"},
        "soil": {"ph": 6.5, "nitrogen_kg_ha": 60, "phosphorus_kg_ha": 30, "potassium_kg_ha": 20},
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
        self.assertEqual(res["status"], "available")
        self.assertIn("PAU", res["source"]["authority"])
        self.assertEqual(res["recommended"]["N_kg_ha"], 120)

    def test_02_cotton_punjab_baseline(self):
        # We use Cotton + Punjab since the JSON does not contain Cotton for Maharashtra.
        data = get_base_validated()
        data["climate"]["season"] = "kharif"
        data["land"]["irrigation_type"] = "bt_cotton" # Testing condition match
        res = calculate_fertilizer(data, "cotton")
        self.assertEqual(res["status"], "available")
        self.assertEqual(res["recommended"]["N_kg_ha"], 150)

    def test_03_soybean_maharashtra_rainfed(self):
        data = get_base_validated()
        data["location"]["state"] = "Maharashtra"
        data["land"]["irrigation_type"] = "rainfed"
        res = calculate_fertilizer(data, "soybean")
        self.assertEqual(res["status"], "available")
        self.assertEqual(res["source"]["authority"], "Dr. PDKV")
        self.assertEqual(res["recommended"]["P2O5_kg_ha"], 75)

    # --- B. Unit Validation & Critical Ambiguity Test ---
    def test_04_critical_ambiguity_no_silent_calculation(self):
        # The prompt mandates that P and K must NOT be blindly subtracted from P2O5 and K2O.
        # This test acts as a safety gate guard against old application behavior.
        data = get_base_validated()
        data["soil"]["phosphorus_kg_ha"] = 30
        data["soil"]["potassium_kg_ha"] = 20
        res = calculate_fertilizer(data, "wheat")
        
        self.assertIsNone(res["deficit"]["P2O5_kg_ha"], "P deficit must be None due to unit ambiguity.")
        self.assertIsNone(res["deficit"]["K2O_kg_ha"], "K deficit must be None due to unit ambiguity.")
        
        warnings = " ".join(res["warnings"])
        self.assertIn("ambiguous", warnings)
        
    def test_05_product_conversion_suspended(self):
        # We suspended product conversion because of the P/K ambiguity.
        data = get_base_validated()
        res = calculate_fertilizer(data, "wheat")
        self.assertNotIn("urea_kg_acre", res)
        self.assertNotIn("dap_kg_acre", res)

    # --- C. Deficit Calculation (for Nitrogen only) ---
    def test_06_soil_above_recommended(self):
        data = get_base_validated()
        data["soil"]["nitrogen_kg_ha"] = 200 # Wheat rec is 120
        res = calculate_fertilizer(data, "wheat")
        self.assertEqual(res["deficit"]["N_kg_ha"], 0)

    def test_07_soil_equal_recommended(self):
        data = get_base_validated()
        data["soil"]["nitrogen_kg_ha"] = 120 # Wheat rec is 120
        res = calculate_fertilizer(data, "wheat")
        self.assertEqual(res["deficit"]["N_kg_ha"], 0)

    def test_08_soil_below_recommended(self):
        data = get_base_validated()
        data["soil"]["nitrogen_kg_ha"] = 50 # Wheat rec is 120
        res = calculate_fertilizer(data, "wheat")
        self.assertEqual(res["deficit"]["N_kg_ha"], 70)
        
    def test_09_negative_deficit_impossible(self):
        data = get_base_validated()
        data["soil"]["nitrogen_kg_ha"] = 150 
        res = calculate_fertilizer(data, "wheat")
        self.assertTrue(res["deficit"]["N_kg_ha"] >= 0)

    # --- D. Farm scaling ---
    def test_10_one_hectare_equivalence(self):
        data = get_base_validated()
        data["land"]["farm_size_acres"] = HECTARE_IN_ACRES
        data["soil"]["nitrogen_kg_ha"] = 0
        res = calculate_fertilizer(data, "wheat")
        # For 1 hectare, the farm total should equal the per-ha deficit
        self.assertAlmostEqual(res["farm_scale"]["deficit_N_kg_farm"], res["deficit"]["N_kg_ha"])

    def test_11_two_acres_scaling(self):
        data = get_base_validated()
        data["land"]["farm_size_acres"] = 2.0
        data["soil"]["nitrogen_kg_ha"] = 0
        res = calculate_fertilizer(data, "wheat")
        hectares = 2.0 / HECTARE_IN_ACRES
        expected_farm_n = 120 * hectares
        self.assertAlmostEqual(res["farm_scale"]["deficit_N_kg_farm"], expected_farm_n, places=4)

    # --- E. Regional selection ---
    def test_12_punjab_does_not_become_maharashtra(self):
        data = get_base_validated()
        data["location"]["state"] = "Maharashtra" # No wheat baseline for Maharashtra
        res = calculate_fertilizer(data, "wheat")
        self.assertEqual(res["status"], "unavailable")
        
    # --- F. Missing data ---
    def test_13_unsupported_crop(self):
        data = get_base_validated()
        res = calculate_fertilizer(data, "alien_crop")
        self.assertEqual(res["status"], "unavailable")

    def test_14_invalid_structure(self):
        res = calculate_fertilizer({"broken": "data"}, "wheat")
        self.assertEqual(res["status"], "error")

if __name__ == '__main__':
    unittest.main()
