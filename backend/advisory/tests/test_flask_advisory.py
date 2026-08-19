import unittest
import json
import os
from backend.app import app

def get_valid_payload():
    return {
        "location": {"state": "Maharashtra", "district": "Nagpur"},
        "soil": {
            "ph": 7.0,
            "nitrogen_kg_ha": 250,
            "phosphorus_kg_ha": 20,
            "potassium_kg_ha": 150,
            "data_source": "soil_health_card"
        },
        "climate": {"season": "kharif"},
        "land": {
            "farm_size_acres": 2,
            "irrigation_type": "rainfed",
            "water_availability": "moderate"
        },
        "farmer_constraints": {
            "budget_available_inr": 10000,
            "risk_appetite": "low",
            "primary_goal": "max_profit"
        }
    }

class TestFlaskAdvisory(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        # Force Gemini to be unavailable for tests
        os.environ['GOOGLE_API_KEY'] = ""
        os.environ['GEMINI_MODEL_NAME'] = ""

    def test_ft01_health_check(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "ok")

    def test_ft02_existing_crop_endpoint(self):
        payload = {
            "n": 100, "p": 50, "k": 50, "temperature": 25,
            "humidity": 60, "ph": 6.5, "rainfall": 200
        }
        res = self.client.post("/api/recommend-crop", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("crop", data)
        self.assertIn("confidence", data)

    def test_ft03_existing_fertilizer_endpoint(self):
        payload = {"crop": "rice", "n": 40, "p": 20, "k": 20}
        res = self.client.post("/api/fertilizer", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["crop"], "rice")
        self.assertIn("urea_kg_acre", data)

    def test_ft04_new_advisory_happy_path(self):
        payload = get_valid_payload()
        res = self.client.post("/api/v2/advisory", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "success")
        self.assertEqual(data.get("gemini_available"), False)
        self.assertIn("top_recommendation", data)

    def test_ft05_new_advisory_punjab_rabi(self):
        payload = get_valid_payload()
        payload["location"]["state"] = "Punjab"
        payload["location"]["district"] = "Ludhiana"
        payload["climate"]["season"] = "rabi"
        res = self.client.post("/api/v2/advisory", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "success")

    def test_ft06_missing_mandatory_field(self):
        payload = get_valid_payload()
        del payload["soil"]["ph"]
        res = self.client.post("/api/v2/advisory", json=payload)
        self.assertEqual(res.status_code, 400)
        data = res.get_json()
        self.assertEqual(data.get("status"), "error")
        errors = data.get("errors", [])
        self.assertTrue(any(e["field"] == "soil.ph" for e in errors))

    def test_ft07_invalid_ph(self):
        payload = get_valid_payload()
        payload["soil"]["ph"] = 99
        res = self.client.post("/api/v2/advisory", json=payload)
        self.assertEqual(res.status_code, 400)

    def test_ft08_malformed_json_body(self):
        res = self.client.post("/api/v2/advisory", data="not json", headers={"Content-Type": "application/json"})
        self.assertEqual(res.status_code, 400)

    def test_ft09_empty_json_object(self):
        res = self.client.post("/api/v2/advisory", json={})
        self.assertEqual(res.status_code, 400)

    def test_ft10_unknown_district(self):
        payload = get_valid_payload()
        payload["location"]["district"] = "Unknown District"
        res = self.client.post("/api/v2/advisory", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["top_recommendation"]["regional_context"], "unavailable")

if __name__ == '__main__':
    unittest.main()
