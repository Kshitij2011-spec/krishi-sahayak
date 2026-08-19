import unittest
import os
from unittest.mock import patch

import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from backend.advisory.engine import run_advisory

def get_valid_input():
    return {
        "location": {"state": "Punjab", "district": "Ludhiana"},
        "soil": {"ph": 6.5, "nitrogen_kg_ha": 300, "phosphorus_kg_ha": 15, "potassium_kg_ha": 200},
        "climate": {"season": "rabi"},
        "land": {"farm_size_acres": 2.5, "irrigation_type": "canal"},
        "farmer_constraints": {"budget_available_inr": 10000}
    }

class TestEngine(unittest.TestCase):
    def setUp(self):
        self.env_patcher = patch.dict(os.environ, clear=True)
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_e01_valid_input_gemini_unavailable(self):
        # Gemini configuration missing -> deterministic fallback
        res = run_advisory(get_valid_input())
        self.assertEqual(res["status"], "success")
        self.assertFalse(res["gemini_available"])
        self.assertEqual(res["reasoning_source"], "deterministic_rule_engine")
        self.assertTrue("wheat" in [c["crop"].lower() for c in res["candidate_crops"]])
        self.assertTrue(res["top_recommendation"]["crop"].lower() in ["wheat", "chickpea", "lentil", "maize"])
        self.assertEqual(res["top_recommendation"]["selection_basis"], "highest agronomic_fit_score")
        
    @patch("backend.advisory.engine.generate_advisory_reasoning")
    def test_e02_valid_input_gemini_valid_response(self, mock_gemini):
        mock_gemini.return_value = {
            "status": "success",
            "data": {
                "ranked_crops": [
                    {
                        "crop": "wheat",
                        "rank": 1,
                        "reasoning": "Excellent match.",
                        "variety": "PBW 826"
                    }
                ]
            }
        }
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake", "GEMINI_MODEL_NAME": "fake"}):
            res = run_advisory(get_valid_input())
            self.assertEqual(res["status"], "success")
            self.assertTrue(res["gemini_available"])
            self.assertEqual(res["reasoning_source"], "gemini")
            self.assertEqual(res["top_recommendation"]["crop"].lower(), "wheat")
            self.assertEqual(res["top_recommendation"]["reasoning"], "Excellent match.")
            self.assertEqual(res["top_recommendation"]["variety"], "PBW 826")
            
    @patch("backend.advisory.engine.generate_advisory_reasoning")
    def test_e03_gemini_returns_crop_outside_shortlist(self, mock_gemini):
        # gemini_layer handles crop outside shortlist by returning fallback status.
        mock_gemini.return_value = {
            "status": "fallback",
            "reason": "invalid_crop_generated",
            "data": None
        }
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake", "GEMINI_MODEL_NAME": "fake"}):
            res = run_advisory(get_valid_input())
            self.assertEqual(res["status"], "success")
            # We fallback to deterministic
            self.assertEqual(res["reasoning_source"], "deterministic_rule_engine")
            self.assertFalse(res["gemini_available"])

    @patch("backend.advisory.engine.generate_advisory_reasoning")
    def test_e04_gemini_invented_variety(self, mock_gemini):
        # gemini_layer actually handles stripping invented varieties.
        # So we mock it returning a valid crop but stripped variety (None)
        mock_gemini.return_value = {
            "status": "success",
            "data": {
                "ranked_crops": [
                    {
                        "crop": "wheat",
                        "rank": 1,
                        "variety": None
                    }
                ]
            }
        }
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake", "GEMINI_MODEL_NAME": "fake"}):
            res = run_advisory(get_valid_input())
            self.assertIsNone(res["top_recommendation"]["variety"])
            self.assertEqual(res["top_recommendation"]["crop"].lower(), "wheat")
            
    @patch("backend.advisory.engine.generate_advisory_reasoning")
    @patch("backend.advisory.engine.filter_and_score")
    def test_e05_no_viable_crops(self, mock_filter, mock_gemini):
        # Mock filter to return empty candidates
        mock_filter.return_value = {"valid": True, "candidates": [], "excluded": []}
        
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake", "GEMINI_MODEL_NAME": "fake"}):
            res = run_advisory(get_valid_input())
            self.assertEqual(res["status"], "no_viable_crops")
            mock_gemini.assert_not_called()

    @patch("backend.advisory.engine.generate_advisory_reasoning")
    def test_e06_fertilizer_unavailable(self, mock_gemini):
        # Mock fertilizer engine to return unavailable
        with patch("backend.advisory.engine.calculate_fertilizer") as mock_fert:
            mock_fert.return_value = {"status": "unavailable"}
            res = run_advisory(get_valid_input())
            self.assertEqual(res["top_recommendation"]["fertilizer"]["status"], "unavailable")

    @patch("backend.advisory.engine.generate_advisory_reasoning")
    def test_e07_regional_data_unavailable(self, mock_gemini):
        input_data = get_valid_input()
        input_data["location"]["state"] = "UnknownState"
        res = run_advisory(input_data)
        # Crop is still eligible via rules (if season/soil fits, though UnknownState might drop scores)
        # Assuming rule_filter doesn't hard-fail on unknown state.
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["top_recommendation"]["regional_context"], "unavailable")

    def test_e08_repeated_identical_input(self):
        res1 = run_advisory(get_valid_input())
        res2 = run_advisory(get_valid_input())
        self.assertEqual(res1["candidate_crops"], res2["candidate_crops"])
        self.assertNotEqual(res1["query_id"], res2["query_id"])

    @patch("backend.advisory.engine.generate_advisory_reasoning")
    def test_e09_exactly_one_gemini_invocation(self, mock_gemini):
        mock_gemini.return_value = {"status": "success", "data": {"ranked_crops": [{"crop": "wheat", "rank": 1}]}}
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake", "GEMINI_MODEL_NAME": "fake"}):
            run_advisory(get_valid_input())
            mock_gemini.assert_called_once()
            
    @patch("backend.advisory.engine.generate_advisory_reasoning")
    def test_e10_missing_api_configuration(self, mock_gemini):
        with patch.dict(os.environ, clear=True):
            res = run_advisory(get_valid_input())
            mock_gemini.assert_not_called()
            self.assertEqual(res["reasoning_source"], "deterministic_rule_engine")

if __name__ == '__main__':
    unittest.main()
