import unittest
from unittest.mock import patch
import requests

from backend.advisory.weather import get_weather_context

class TestWeatherModule(unittest.TestCase):
    @patch('backend.advisory.weather.requests.get')
    def test_wt01_valid_response(self, mock_get):
        # WT-01: Valid Open-Meteo response
        mock_get.return_value.json.return_value = {
            "current": {
                "temperature_2m": 29.4,
                "relative_humidity_2m": 71,
                "precipitation": 0.0
            },
            "daily": {
                "temperature_2m_max": [34.1, 33.5, 35.0, 32.0, 31.0, 30.5, 31.2],
                "temperature_2m_min": [23.2, 24.0, 23.5, 22.0, 21.5, 21.0, 22.1],
                "precipitation_sum": [0.0, 10.5, 5.0, 12.0, 15.0, 0.0, 0.0],
                "precipitation_probability_max": [10, 80, 50, 90, 100, 20, 5]
            }
        }
        
        result = get_weather_context({"latitude": 21.15, "longitude": 79.09})
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["current"]["temperature_c"], 29.4)
        
        # WT-06, WT-07: Summary calculated correctly
        self.assertEqual(result["forecast_7day"]["rainfall_total_mm"], 42.5)
        self.assertEqual(result["forecast_7day"]["rain_probability_max_pct"], 100)
        self.assertEqual(result["forecast_7day"]["temperature_min_c"], 21.0)
        self.assertEqual(result["forecast_7day"]["temperature_max_c"], 35.0)

    @patch('backend.advisory.weather.requests.get')
    def test_wt02_http_error(self, mock_get):
        # WT-02: HTTP error
        mock_get.side_effect = requests.exceptions.RequestException("HTTP Error")
        result = get_weather_context({"latitude": 21.15, "longitude": 79.09})
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["reason"], "http_error")

    @patch('backend.advisory.weather.requests.get')
    def test_wt03_timeout(self, mock_get):
        # WT-03: Timeout
        mock_get.side_effect = requests.exceptions.Timeout("Timeout")
        result = get_weather_context({"latitude": 21.15, "longitude": 79.09})
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["reason"], "timeout")

    @patch('backend.advisory.weather.requests.get')
    def test_wt04_malformed_json(self, mock_get):
        # WT-04: Malformed JSON
        mock_get.return_value.json.side_effect = ValueError("Invalid JSON")
        result = get_weather_context({"latitude": 21.15, "longitude": 79.09})
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["reason"], "malformed_response")

    @patch('backend.advisory.weather.requests.get')
    def test_wt05_missing_coordinates(self, mock_get):
        # WT-05: Missing coordinates -> unavailable without calling API
        result = get_weather_context({"state": "Maharashtra", "district": "Nagpur"})
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["reason"], "missing_coordinates")
        mock_get.assert_not_called()

    @patch('backend.advisory.weather.requests.get')
    def test_wt08_exactly_one_request(self, mock_get):
        # WT-08: Exactly one HTTP request
        mock_get.return_value.json.return_value = {"current": {}, "daily": {}}
        get_weather_context({"latitude": 21.15, "longitude": 79.09})
        mock_get.assert_called_once()
