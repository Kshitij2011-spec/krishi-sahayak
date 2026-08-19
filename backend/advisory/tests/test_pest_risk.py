import unittest
from unittest.mock import patch

from backend.advisory.pest_risk import get_pest_risks

class TestPestRisk(unittest.TestCase):
    
    def test_pr01_exact_match(self):
        # PR-01 Exact crop + district + season match.
        res = get_pest_risks("cotton", "Maharashtra", "Nagpur", "kharif")
        self.assertEqual(res["status"], "available")
        self.assertTrue(len(res["risks"]) > 0)
        self.assertEqual(res["risks"][0]["risk_name"], "Pink Bollworm")

    def test_pr02_regional_fallback(self):
        # PR-02 Exact crop + regional fallback.
        # "Akola" is in Maharashtra, falls back to "Vidarbha"
        res = get_pest_risks("cotton", "Maharashtra", "Akola", "kharif")
        self.assertEqual(res["status"], "available")
        self.assertTrue(len(res["risks"]) > 0)
        
    def test_pr03_wrong_season(self):
        # PR-03 Wrong season -> no matching risk
        res = get_pest_risks("cotton", "Maharashtra", "Nagpur", "rabi")
        self.assertEqual(res["status"], "no_verified_risk_data")
        self.assertEqual(len(res["risks"]), 0)

    def test_pr04_unknown_district(self):
        # PR-04 Unknown district -> appropriate fallback/no-data
        # Kerala will yield Unknown region
        res = get_pest_risks("cotton", "Kerala", "UnknownDistrict", "kharif")
        self.assertEqual(res["status"], "no_verified_risk_data")

    def test_pr05_unknown_crop(self):
        # PR-05 Unknown crop -> no-data
        res = get_pest_risks("apple", "Maharashtra", "Nagpur", "kharif")
        self.assertEqual(res["status"], "no_verified_risk_data")

    def test_pr06_no_verified_risk(self):
        # PR-06 No verified risk -> graceful output
        res = get_pest_risks("lentil", "Maharashtra", "Nagpur", "kharif")
        self.assertEqual(res["status"], "no_verified_risk_data")
        self.assertIn("warning", res)
        self.assertIn("No source-backed early-warning data", res["warning"])

    def test_pr07_preserves_provenance(self):
        # PR-07 Risk record preserves source provenance
        res = get_pest_risks("wheat", "Punjab", "Ludhiana", "rabi")
        self.assertEqual(res["status"], "available")
        risk = res["risks"][0]
        self.assertIn("source", risk)
        self.assertEqual(risk["source"]["authority"], "PAU (Punjab Agricultural University)")

    def test_pr08_no_pesticide_dosage(self):
        # PR-08 No pesticide dosage is produced
        res = get_pest_risks("cotton", "Maharashtra", "Nagpur", "kharif")
        risk = res["risks"][0]
        prevention_str = str(risk["prevention"]).lower()
        self.assertNotIn("spray", prevention_str)
        self.assertNotIn("ml/ha", prevention_str)
        
    def test_pr09_deterministic(self):
        # PR-09 Repeated identical lookup is deterministic
        res1 = get_pest_risks("rice", "Punjab", "Amritsar", "kharif")
        res2 = get_pest_risks("rice", "Punjab", "Amritsar", "kharif")
        self.assertEqual(res1, res2)

if __name__ == "__main__":
    unittest.main()
