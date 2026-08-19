import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))
from backend.advisory.validator import validate_advisory_input

def get_minimal_valid():
    return {
        "location": {
            "state": "Punjab",
            "district": "Ludhiana"
        },
        "soil": {
            "ph": 6.5,
            "nitrogen_kg_ha": 120,
            "phosphorus_kg_ha": 60,
            "potassium_kg_ha": 30
        },
        "climate": {
            "season": "rabi"
        },
        "land": {
            "farm_size_acres": 5.0,
            "irrigation_type": "canal"
        },
        "farmer_constraints": {
            "budget_available_inr": 15000
        }
    }

class TestValidator(unittest.TestCase):
    
    # --- Valid Inputs ---
    def test_01_fully_valid_minimal(self):
        result = validate_advisory_input(get_minimal_valid())
        self.assertTrue(result["valid"])
        self.assertEqual(result["completeness"]["mandatory_present"], 10)
        
    def test_02_fully_populated(self):
        data = get_minimal_valid()
        data["land"]["water_availability"] = "abundant"
        data["farmer_constraints"]["labor_availability"] = "family only"
        data["farmer_constraints"]["risk_appetite"] = "medium"
        data["farmer_constraints"]["primary_goal"] = "max_profit"
        result = validate_advisory_input(data)
        self.assertTrue(result["valid"])
        self.assertEqual(result["completeness"]["optional_present"], 4)
        
    def test_03_hindi_local_text(self):
        data = get_minimal_valid()
        data["location"]["district"] = "लुधियाना"
        result = validate_advisory_input(data)
        self.assertTrue(result["valid"])
        self.assertEqual(result["data"]["location"]["district"], "लुधियाना")

    def test_04_zero_budget(self):
        data = get_minimal_valid()
        data["farmer_constraints"]["budget_available_inr"] = 0
        result = validate_advisory_input(data)
        self.assertTrue(result["valid"])

    def test_05_different_irrigation(self):
        for irr in ["rainfed", "canal", "borewell", "drip", "sprinkler"]:
            data = get_minimal_valid()
            data["land"]["irrigation_type"] = irr
            result = validate_advisory_input(data)
            self.assertTrue(result["valid"])

    def test_06_different_seasons(self):
        for s in ["kharif", "rabi", "zaid"]:
            data = get_minimal_valid()
            data["climate"]["season"] = s
            result = validate_advisory_input(data)
            self.assertTrue(result["valid"])

    # --- Invalid Inputs ---
    def test_07_missing_state(self):
        data = get_minimal_valid()
        del data["location"]["state"]
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])
        
    def test_08_missing_district(self):
        data = get_minimal_valid()
        del data["location"]["district"]
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_09_missing_ph(self):
        data = get_minimal_valid()
        del data["soil"]["ph"]
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_10_negative_ph(self):
        data = get_minimal_valid()
        data["soil"]["ph"] = -1
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_11_high_ph(self):
        data = get_minimal_valid()
        data["soil"]["ph"] = 15
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_12_negative_n(self):
        data = get_minimal_valid()
        data["soil"]["nitrogen_kg_ha"] = -10
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_13_negative_p(self):
        data = get_minimal_valid()
        data["soil"]["phosphorus_kg_ha"] = -5
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_14_negative_k(self):
        data = get_minimal_valid()
        data["soil"]["potassium_kg_ha"] = -2
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_15_zero_farm_size(self):
        data = get_minimal_valid()
        data["land"]["farm_size_acres"] = 0
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_16_negative_farm_size(self):
        data = get_minimal_valid()
        data["land"]["farm_size_acres"] = -2
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_17_negative_budget(self):
        data = get_minimal_valid()
        data["farmer_constraints"]["budget_available_inr"] = -100
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_18_invalid_season(self):
        data = get_minimal_valid()
        data["climate"]["season"] = "winter"
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_19_invalid_irrigation(self):
        data = get_minimal_valid()
        data["land"]["irrigation_type"] = "river"
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_20_invalid_risk(self):
        data = get_minimal_valid()
        data["farmer_constraints"]["risk_appetite"] = "extreme"
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_21_invalid_goal(self):
        data = get_minimal_valid()
        data["farmer_constraints"]["primary_goal"] = "world_domination"
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_22_malformed_nested(self):
        data = get_minimal_valid()
        data["soil"] = "very good"
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_23_missing_constraints(self):
        data = get_minimal_valid()
        del data["farmer_constraints"]
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_24_wrong_data_type(self):
        data = get_minimal_valid()
        data["soil"]["ph"] = "6.5" # string instead of number
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_25_empty_district(self):
        data = get_minimal_valid()
        data["location"]["district"] = "   "
        result = validate_advisory_input(data)
        self.assertFalse(result["valid"])

    def test_26_unknown_field(self):
        data = get_minimal_valid()
        data["unrelated_field"] = "value"
        result = validate_advisory_input(data)
        self.assertTrue(result["valid"])
        self.assertTrue(len(result["warnings"]) > 0)
        self.assertNotIn("unrelated_field", result["data"])

    # --- Normalization ---
    def test_27_case_normalized_season(self):
        data = get_minimal_valid()
        data["climate"]["season"] = "RABI"
        result = validate_advisory_input(data)
        self.assertEqual(result["data"]["climate"]["season"], "rabi")

    def test_28_whitespace_trimming(self):
        data = get_minimal_valid()
        data["location"]["district"] = "  Amritsar  "
        result = validate_advisory_input(data)
        self.assertEqual(result["data"]["location"]["district"], "Amritsar")

    def test_29_unicode_preservation(self):
        # same as test_03
        pass

    # --- Quality Metadata ---
    def test_30_farmer_entered_source(self):
        data = get_minimal_valid()
        data["soil"]["data_source"] = "farmer_entered"
        result = validate_advisory_input(data)
        self.assertEqual(result["field_quality"]["soil.ph"], "farmer_entered")

    def test_31_soil_health_card_source(self):
        data = get_minimal_valid()
        data["soil"]["data_source"] = "soil_health_card"
        result = validate_advisory_input(data)
        self.assertEqual(result["field_quality"]["soil.ph"], "soil_health_card")

    def test_32_defaulted_source(self):
        data = get_minimal_valid()
        data["soil"]["data_source"] = "defaulted_regional_avg"
        result = validate_advisory_input(data)
        self.assertEqual(result["field_quality"]["soil.ph"], "defaulted_regional_avg")

    def test_33_missing_optional_fields(self):
        result = validate_advisory_input(get_minimal_valid())
        self.assertEqual(result["completeness"]["optional_present"], 0)

if __name__ == '__main__':
    unittest.main()
