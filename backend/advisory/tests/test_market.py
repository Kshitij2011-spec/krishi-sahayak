import unittest
import os
from unittest.mock import patch
import requests

from backend.advisory.market import get_market_context

class TestMarketModule(unittest.TestCase):
    def setUp(self):
        self.env_patcher = patch.dict(os.environ, {"DATA_GOV_IN_API_KEY": "fake_key"})
        self.env_patcher.start()
        
    def tearDown(self):
        self.env_patcher.stop()

    @patch('backend.advisory.market.requests.get')
    def test_mk01_valid_response(self, mock_get):
        mock_get.return_value.json.return_value = {
            "records": [
                {
                    "commodity": "Soyabean",
                    "district": "Nagpur",
                    "market": "Nagpur",
                    "state": "Maharashtra",
                    "min_price": "4200",
                    "max_price": "4800",
                    "modal_price": "4500",
                    "arrival_date": "19/08/2026"
                }
            ]
        }
        
        # MK-06: Correct price parsing
        # MK-07: Correct market/date/unit parsing
        result = get_market_context("Soyabean", "Nagpur")
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["commodity"], "Soyabean")
        self.assertEqual(result["modal_price"], 4500.0)
        self.assertEqual(result["min_price"], 4200.0)
        self.assertEqual(result["max_price"], 4800.0)
        self.assertEqual(result["arrival_date"], "19/08/2026")
        self.assertEqual(result["unit"], "INR per Quintal")
        self.assertEqual(result["source"], "agmarknet_data_gov_in")

    @patch('backend.advisory.market.requests.get')
    def test_mk02_http_failure(self, mock_get):
        mock_get.side_effect = requests.exceptions.RequestException("HTTP Error")
        result = get_market_context("Soyabean", "Nagpur")
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["reason"], "http_error")

    @patch('backend.advisory.market.requests.get')
    def test_mk03_timeout(self, mock_get):
        mock_get.side_effect = requests.exceptions.Timeout("Timeout")
        result = get_market_context("Soyabean", "Nagpur")
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["reason"], "timeout")

    @patch('backend.advisory.market.requests.get')
    def test_mk04_malformed_json(self, mock_get):
        mock_get.return_value.json.side_effect = ValueError("Invalid JSON")
        result = get_market_context("Soyabean", "Nagpur")
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["reason"], "malformed_response")

    @patch('backend.advisory.market.requests.get')
    def test_mk05_no_records(self, mock_get):
        mock_get.return_value.json.return_value = {"records": []}
        result = get_market_context("Soyabean", "Nagpur")
        self.assertEqual(result["status"], "no_data")
        self.assertEqual(result["reason"], "no_market_records_found")

    @patch('backend.advisory.market.requests.get')
    def test_mk08_exactly_one_request(self, mock_get):
        mock_get.return_value.json.return_value = {"records": []}
        get_market_context("Soyabean", "Nagpur")
        mock_get.assert_called_once()
        
    @patch('backend.advisory.market.requests.get')
    def test_mk09_missing_credentials(self, mock_get):
        with patch.dict(os.environ, clear=True):
            result = get_market_context("Soyabean", "Nagpur")
            self.assertEqual(result["status"], "unavailable")
            self.assertEqual(result["reason"], "missing_credentials")
            mock_get.assert_not_called()

if __name__ == '__main__':
    unittest.main()
