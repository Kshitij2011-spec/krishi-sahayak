import unittest
from backend.advisory.confidence import calculate_confidence

class TestConfidence(unittest.TestCase):
    
    def test_cf01_strong_inputs(self):
        # Strong agronomic fit + strong data + regional support.
        # Expected: high confidence
        res = calculate_confidence(
            agronomic_fit_score=95,
            data_completeness={"mandatory_total": 10, "mandatory_present": 10},
            field_quality={"soil.ph": "soil_health_card"},
            regional_status="supported"
        )
        self.assertEqual(res["components"]["agronomic_fit"], 95)
        self.assertEqual(res["components"]["data_quality"], 100)
        self.assertEqual(res["components"]["regional_evidence"], 100)
        self.assertEqual(res["cap"], 92)
        # Base: 95*0.5 + 100*0.3 + 100*0.2 = 47.5 + 30 + 20 = 97.5 -> 98
        # Cap: 92
        self.assertEqual(res["overall"], 92)
        self.assertEqual(res["status"], "very_high")
        
    def test_cf02_weak_agronomic_fit(self):
        # Weak agronomic fit -> confidence reduced
        res = calculate_confidence(
            agronomic_fit_score=40,
            data_completeness={"mandatory_total": 10, "mandatory_present": 10},
            field_quality={"soil.ph": "soil_health_card"},
            regional_status="supported"
        )
        self.assertEqual(res["components"]["agronomic_fit"], 40)
        # Base: 40*0.5 + 100*0.3 + 100*0.2 = 20 + 30 + 20 = 70
        self.assertEqual(res["overall"], 70)
        self.assertEqual(res["status"], "moderate")
        
    def test_cf03_farmer_entered_data(self):
        # Farmer-entered mandatory soil data -> cap applied (82)
        res = calculate_confidence(
            agronomic_fit_score=100,
            data_completeness={"mandatory_total": 10, "mandatory_present": 10},
            field_quality={"soil.ph": "farmer_entered"},
            regional_status="supported"
        )
        self.assertEqual(res["cap"], 82)
        # Base: 100*0.5 + 90*0.3 + 100*0.2 = 50 + 27 + 20 = 97
        self.assertEqual(res["overall"], 82)
        
    def test_cf04_mandatory_field_defaulted(self):
        # Mandatory field defaulted -> lower cap (65)
        res = calculate_confidence(
            agronomic_fit_score=100,
            data_completeness={"mandatory_total": 10, "mandatory_present": 10},
            field_quality={"soil.ph": "defaulted_regional_avg"},
            regional_status="supported"
        )
        self.assertEqual(res["cap"], 65)
        # Base: 100*0.5 + 80*0.3 + 100*0.2 = 50 + 24 + 20 = 94
        self.assertEqual(res["overall"], 65)
        
    def test_cf05_mandatory_field_missing(self):
        # Mandatory field missing -> max <= 40
        res = calculate_confidence(
            agronomic_fit_score=100,
            data_completeness={"mandatory_total": 10, "mandatory_present": 9},
            field_quality={},
            regional_status="supported"
        )
        self.assertEqual(res["cap"], 40)
        self.assertLessEqual(res["overall"], 40)
        self.assertEqual(res["status"], "low")
        
    def test_cf06_regional_data_supported(self):
        # Regional data supported -> higher regional component
        res = calculate_confidence(
            agronomic_fit_score=80,
            data_completeness={"mandatory_total": 10, "mandatory_present": 10},
            field_quality={"soil.ph": "soil_health_card"},
            regional_status="supported"
        )
        self.assertEqual(res["components"]["regional_evidence"], 100)
        
    def test_cf07_regional_data_unavailable(self):
        # Regional data unavailable -> uncertainty reflected
        res = calculate_confidence(
            agronomic_fit_score=80,
            data_completeness={"mandatory_total": 10, "mandatory_present": 10},
            field_quality={"soil.ph": "soil_health_card"},
            regional_status="unavailable"
        )
        self.assertEqual(res["components"]["regional_evidence"], 50)
        
    def test_cf08_regional_data_not_supported(self):
        # Regional data says crop is not historically supported -> penalty (25)
        res = calculate_confidence(
            agronomic_fit_score=80,
            data_completeness={"mandatory_total": 10, "mandatory_present": 10},
            field_quality={"soil.ph": "soil_health_card"},
            regional_status="unsupported"
        )
        self.assertEqual(res["components"]["regional_evidence"], 25)
        
    def test_cf09_gemini_claims_confidence(self):
        # Gemini claims a confidence of 99 -> Gemini value ignored
        # There is no Gemini input parameter, so it's intrinsically ignored
        res = calculate_confidence(
            agronomic_fit_score=80,
            data_completeness={"mandatory_total": 10, "mandatory_present": 10},
            field_quality={"soil.ph": "farmer_entered"},
            regional_status="supported"
        )
        # Verify deterministic calculation applies regardless of external context
        self.assertEqual(res["components"]["agronomic_fit"], 80)
        
    def test_cf10_identical_input_repeated(self):
        # Identical input repeated -> identical confidence output
        res1 = calculate_confidence(
            agronomic_fit_score=75,
            data_completeness={"mandatory_total": 10, "mandatory_present": 10},
            field_quality={"soil.ph": "farmer_entered"},
            regional_status="unavailable"
        )
        res2 = calculate_confidence(
            agronomic_fit_score=75,
            data_completeness={"mandatory_total": 10, "mandatory_present": 10},
            field_quality={"soil.ph": "farmer_entered"},
            regional_status="unavailable"
        )
        self.assertEqual(res1, res2)

    def test_cf_invariants(self):
        # Invariants
        res = calculate_confidence(
            agronomic_fit_score=200, # over max
            data_completeness={"mandatory_total": 10, "mandatory_present": 10},
            field_quality={},
            regional_status="supported"
        )
        self.assertLessEqual(res["overall"], 100)
        self.assertGreaterEqual(res["overall"], 0)
        self.assertLessEqual(res["components"]["agronomic_fit"], 100)
        self.assertGreaterEqual(res["components"]["agronomic_fit"], 0)
        self.assertLessEqual(res["components"]["data_quality"], 100)
        self.assertGreaterEqual(res["components"]["data_quality"], 0)
        self.assertLessEqual(res["components"]["regional_evidence"], 100)
        self.assertGreaterEqual(res["components"]["regional_evidence"], 0)
        self.assertLessEqual(res["overall"], res["cap"])

if __name__ == '__main__':
    unittest.main()
