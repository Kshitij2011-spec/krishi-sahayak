import unittest
from unittest.mock import patch

from backend.advisory.pest_risk import get_pest_risks

class TestPestRisk(unittest.TestCase):
    
    def test_pr01_exact_match(self):
        res = get_pest_risks("cotton", "Maharashtra", "Nagpur", "kharif")
        self.assertEqual(res["status"], "available")
        self.assertTrue(len(res["risks"]) > 0)
        self.assertEqual(res["risks"][0]["risk_name"], "Pink Bollworm")
        self.assertEqual(res["risks"][0]["current_alert_level"], "Low Alert")

    def test_pr02_trap_count_alert(self):
        res = get_pest_risks("cotton", "Maharashtra", "Akola", "kharif", trap_count=10)
        self.assertEqual(res["status"], "available")
        self.assertEqual(res["risks"][0]["current_alert_level"], "Severe Alert")
        
    def test_pr03_wrong_season(self):
        res = get_pest_risks("cotton", "Maharashtra", "Nagpur", "rabi")
        self.assertEqual(res["status"], "no_verified_risk_data")
        self.assertEqual(len(res["risks"]), 0)

    def test_pr04_unknown_district(self):
        res = get_pest_risks("cotton", "Kerala", "UnknownDistrict", "kharif")
        self.assertEqual(res["status"], "no_verified_risk_data")

    def test_pr05_unknown_crop(self):
        res = get_pest_risks("apple", "Maharashtra", "Nagpur", "kharif")
        self.assertEqual(res["status"], "no_verified_risk_data")

    def test_pr06_no_verified_risk(self):
        res = get_pest_risks("lentil", "Maharashtra", "Nagpur", "kharif")
        self.assertEqual(res["status"], "no_verified_risk_data")
        self.assertIn("warning", res)

    def test_pr07_preserves_provenance(self):
        res = get_pest_risks("soybean", "Maharashtra", "Amravati", "kharif")
        self.assertEqual(res["status"], "available")
        risk = res["risks"][0]
        self.assertIn("source", risk)
        self.assertEqual(risk["source"]["authority"], "Dr. PDKV")

    def test_pr08_has_ipm(self):
        res = get_pest_risks("sugarcane", "Maharashtra", "Pune", "perennial")
        self.assertEqual(res["status"], "available")
        risk = res["risks"][0]
        self.assertIn("ipm", risk)
        self.assertIn("cultural", risk["ipm"])
        self.assertIn("chemical", risk["ipm"])
        
    def test_pr09_deterministic(self):
        res1 = get_pest_risks("cotton", "Maharashtra", "Amravati", "kharif")
        res2 = get_pest_risks("cotton", "Maharashtra", "Amravati", "kharif")
        self.assertEqual(res1, res2)

if __name__ == "__main__":
    unittest.main()
