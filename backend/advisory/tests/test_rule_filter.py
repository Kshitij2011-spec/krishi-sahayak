import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))
from backend.advisory.rule_filter import filter_and_score

def get_base_validated():
    return {
        "location": {"state": "Punjab", "district": "Ludhiana"},
        "soil": {"ph": 6.5, "nitrogen_kg_ha": 100, "phosphorus_kg_ha": 50, "potassium_kg_ha": 30},
        "climate": {"season": "rabi"},
        "land": {"farm_size_acres": 5.0, "irrigation_type": "canal"},
        "farmer_constraints": {"budget_available_inr": 10000}
    }

class TestRuleFilter(unittest.TestCase):
    
    # --- A. Season ---
    def test_01_wheat_kharif_excluded(self):
        data = get_base_validated()
        data["climate"]["season"] = "kharif"
        res = filter_and_score(data)
        excluded_crops = [c["crop"] for c in res["excluded"]]
        self.assertIn("wheat", excluded_crops)
        
    def test_02_wheat_rabi_retained(self):
        data = get_base_validated()
        data["climate"]["season"] = "rabi"
        res = filter_and_score(data)
        candidates = [c["crop"] for c in res["candidates"]]
        self.assertIn("wheat", candidates)
        
    def test_03_rice_rabi_excluded(self):
        data = get_base_validated()
        data["climate"]["season"] = "rabi"
        res = filter_and_score(data)
        excluded_crops = [c["crop"] for c in res["excluded"]]
        self.assertIn("rice", excluded_crops)
        
    def test_04_rice_kharif_retained(self):
        data = get_base_validated()
        data["climate"]["season"] = "kharif"
        res = filter_and_score(data)
        candidates = [c["crop"] for c in res["candidates"]]
        self.assertIn("rice", candidates)
        
    def test_05_mungbean_zaid_retained(self):
        data = get_base_validated()
        data["climate"]["season"] = "zaid"
        res = filter_and_score(data)
        candidates = [c["crop"] for c in res["candidates"]]
        self.assertIn("mungbean", candidates)
        
    # --- B. Water ---
    def test_06_rice_rainfed_scarce_excluded(self):
        data = get_base_validated()
        data["climate"]["season"] = "kharif"
        data["land"]["irrigation_type"] = "rainfed"
        data["land"]["water_availability"] = "scarce"
        res = filter_and_score(data)
        excluded_crops = [c["crop"] for c in res["excluded"]]
        self.assertIn("rice", excluded_crops)
        
    def test_07_rice_irrigated_retained(self):
        data = get_base_validated()
        data["climate"]["season"] = "kharif"
        data["land"]["irrigation_type"] = "canal"
        res = filter_and_score(data)
        candidates = [c["crop"] for c in res["candidates"]]
        self.assertIn("rice", candidates)
        
    def test_08_chickpea_scarce_retained(self):
        data = get_base_validated()
        data["climate"]["season"] = "rabi"
        data["land"]["irrigation_type"] = "rainfed"
        data["land"]["water_availability"] = "scarce"
        res = filter_and_score(data)
        candidates = [c["crop"] for c in res["candidates"]]
        self.assertIn("chickpea", candidates)

    def test_09_cotton_rainfed_retained(self):
        data = get_base_validated()
        data["climate"]["season"] = "kharif"
        data["land"]["irrigation_type"] = "rainfed"
        res = filter_and_score(data)
        candidates = [c["crop"] for c in res["candidates"]]
        self.assertIn("cotton", candidates)
        
    def test_10_soybean_rainfed_retained(self):
        data = get_base_validated()
        data["climate"]["season"] = "kharif"
        data["land"]["irrigation_type"] = "rainfed"
        res = filter_and_score(data)
        candidates = [c["crop"] for c in res["candidates"]]
        self.assertIn("soybean", candidates)
        
    # --- C. pH ---
    def test_11_ph_inside_preferred(self):
        data = get_base_validated()
        data["soil"]["ph"] = 6.5
        res = filter_and_score(data)
        wheat = next((c for c in res["candidates"] if c["crop"] == "wheat"), None)
        ph_rule = next((r for r in wheat["rule_results"] if r["rule"] == "ph"), None)
        self.assertEqual(ph_rule["result"], "pass")
        self.assertEqual(wheat["agronomic_fit_score"], 100) # Assuming no other penalties
        
    def test_12_ph_slightly_outside(self):
        data = get_base_validated()
        data["soil"]["ph"] = 7.9 # Wheat preferred is 6.0-7.5, so diff is 0.4 <= 0.5
        res = filter_and_score(data)
        wheat = next((c for c in res["candidates"] if c["crop"] == "wheat"), None)
        ph_rule = next((r for r in wheat["rule_results"] if r["rule"] == "ph"), None)
        self.assertEqual(ph_rule["result"], "penalty")
        self.assertEqual(wheat["agronomic_fit_score"], 90) # -10 penalty
        
    def test_13_ph_far_outside(self):
        data = get_base_validated()
        data["soil"]["ph"] = 8.5 # Diff is 1.0 > 0.5
        res = filter_and_score(data)
        wheat = next((c for c in res["candidates"] if c["crop"] == "wheat"), None)
        ph_rule = next((r for r in wheat["rule_results"] if r["rule"] == "ph"), None)
        self.assertEqual(ph_rule["result"], "penalty")
        self.assertEqual(wheat["agronomic_fit_score"], 80) # -20 penalty

    # --- D. Temperature ---
    def test_14_temp_inside(self):
        data = get_base_validated()
        data["climate"]["temperature_c"] = 20 # Wheat pref 15-25
        res = filter_and_score(data)
        wheat = next((c for c in res["candidates"] if c["crop"] == "wheat"), None)
        rule = next((r for r in wheat["rule_results"] if r["rule"] == "temperature"), None)
        self.assertEqual(rule["result"], "pass")
        
    def test_15_temp_slightly_outside(self):
        data = get_base_validated()
        data["climate"]["temperature_c"] = 28 # Wheat pref max 25. diff 3 <= 5
        res = filter_and_score(data)
        wheat = next((c for c in res["candidates"] if c["crop"] == "wheat"), None)
        rule = next((r for r in wheat["rule_results"] if r["rule"] == "temperature"), None)
        self.assertEqual(rule["result"], "penalty")
        # 100 - 5 = 95
        self.assertEqual(wheat["agronomic_fit_score"], 95)
        
    def test_16_temp_far_outside(self):
        data = get_base_validated()
        data["climate"]["temperature_c"] = 32 # Wheat pref max 25. diff 7 > 5
        res = filter_and_score(data)
        wheat = next((c for c in res["candidates"] if c["crop"] == "wheat"), None)
        rule = next((r for r in wheat["rule_results"] if r["rule"] == "temperature"), None)
        self.assertEqual(rule["result"], "penalty")
        # 100 - 15 = 85
        self.assertEqual(wheat["agronomic_fit_score"], 85)
        
    # --- E. Rainfall ---
    def test_17_rainfall_suitable(self):
        data = get_base_validated()
        data["climate"]["season"] = "kharif"
        data["climate"]["rainfall_mm"] = 1500 # Rice min 1000
        res = filter_and_score(data)
        rice = next((c for c in res["candidates"] if c["crop"] == "rice"), None)
        rule = next((r for r in rice["rule_results"] if r["rule"] == "rainfall"), None)
        self.assertEqual(rule["result"], "pass")
        
    def test_18_rainfall_low_but_irrigated(self):
        data = get_base_validated()
        data["climate"]["season"] = "kharif"
        data["climate"]["rainfall_mm"] = 500 # Rice min 1000
        data["land"]["irrigation_type"] = "canal" # irrigated
        res = filter_and_score(data)
        rice = next((c for c in res["candidates"] if c["crop"] == "rice"), None)
        rule = next((r for r in rice["rule_results"] if r["rule"] == "rainfall"), None)
        self.assertEqual(rule["result"], "penalty")
        self.assertEqual(rice["agronomic_fit_score"], 95) # soft -5
        
    def test_19_rainfall_low_rainfed(self):
        data = get_base_validated()
        data["climate"]["season"] = "kharif"
        data["climate"]["rainfall_mm"] = 300 # Cotton min 500
        data["land"]["irrigation_type"] = "rainfed"
        res = filter_and_score(data)
        cotton = next((c for c in res["candidates"] if c["crop"] == "cotton"), None)
        rule = next((r for r in cotton["rule_results"] if r["rule"] == "rainfall"), None)
        self.assertEqual(rule["result"], "penalty")
        self.assertEqual(cotton["agronomic_fit_score"], 80) # heavy -20

    # --- F. Shortlist Scenarios ---
    def test_20_punjab_rabi_scenario(self):
        data = get_base_validated()
        data["location"]["state"] = "Punjab"
        data["location"]["district"] = "Ludhiana"
        data["climate"]["season"] = "rabi"
        data["soil"]["ph"] = 7.0
        data["land"]["irrigation_type"] = "canal"
        res = filter_and_score(data)
        candidates = [c["crop"] for c in res["candidates"]]
        self.assertIn("wheat", candidates)
        self.assertNotIn("rice", candidates)
        
    def test_21_nagpur_kharif_rainfed_scenario(self):
        data = get_base_validated()
        data["location"]["state"] = "Maharashtra"
        data["location"]["district"] = "Nagpur"
        data["climate"]["season"] = "kharif"
        data["soil"]["ph"] = 7.0
        data["land"]["irrigation_type"] = "rainfed"
        res = filter_and_score(data)
        candidates = [c["crop"] for c in res["candidates"]]
        self.assertIn("soybean", candidates)
        self.assertIn("cotton", candidates)
        self.assertIn("pigeonpea", candidates)
        
    def test_22_rabi_eliminates_kharif_only(self):
        data = get_base_validated()
        data["climate"]["season"] = "rabi"
        res = filter_and_score(data)
        candidates = [c["crop"] for c in res["candidates"]]
        self.assertNotIn("rice", candidates)
        self.assertNotIn("cotton", candidates)
        self.assertNotIn("soybean", candidates)
        self.assertNotIn("pigeonpea", candidates)
        
    def test_23_determinism(self):
        data = get_base_validated()
        res1 = filter_and_score(data)
        res2 = filter_and_score(data)
        res3 = filter_and_score(data)
        self.assertEqual(res1, res2)
        self.assertEqual(res2, res3)

    # --- G. Explanation Quality ---
    def test_24_excluded_has_reason(self):
        data = get_base_validated()
        data["climate"]["season"] = "rabi"
        res = filter_and_score(data)
        for excl in res["excluded"]:
            self.assertIn("reason_code", excl)
            self.assertIn("message", excl)
            
    def test_25_retained_has_rule_results(self):
        data = get_base_validated()
        res = filter_and_score(data)
        for cand in res["candidates"]:
            self.assertIn("rule_results", cand)
            self.assertTrue(len(cand["rule_results"]) > 0)
            
    def test_26_mutually_exclusive(self):
        data = get_base_validated()
        res = filter_and_score(data)
        cand_set = {c["crop"] for c in res["candidates"]}
        excl_set = {c["crop"] for c in res["excluded"]}
        self.assertEqual(len(cand_set.intersection(excl_set)), 0)

    # --- Error Handling ---
    def test_27_invalid_input(self):
        res = filter_and_score({"random": "data"})
        self.assertFalse(res["valid"])
        self.assertEqual(res["error"], "RuleFilter requires validated advisory input.")

if __name__ == '__main__':
    unittest.main()
