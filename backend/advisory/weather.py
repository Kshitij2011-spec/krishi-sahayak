import requests
import datetime
import logging

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
HTTP_TIMEOUT_SECONDS = 3.0

def get_weather_context(location: dict) -> dict:
    """
    Fetches and normalizes weather data from Open-Meteo for the given location.
    The location dictionary must contain 'latitude' and 'longitude'.
    """
    lat = location.get("latitude")
    lon = location.get("longitude")

    if lat is None or lon is None:
        return {
            "status": "unavailable",
            "source": "open_meteo",
            "reason": "missing_coordinates"
        }

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,precipitation",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
        "forecast_days": 7,
        "timezone": "auto"
    }

    try:
        response = requests.get(OPEN_METEO_URL, params=params, timeout=HTTP_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()

        current = data.get("current", {})
        daily = data.get("daily", {})
        
        # Calculate summaries for 7 days
        rainfall_total = sum(daily.get("precipitation_sum", [])) if "precipitation_sum" in daily else 0.0
        rain_prob = daily.get("precipitation_probability_max", [])
        rain_prob_max = max(rain_prob) if rain_prob else 0
        
        temps_min = daily.get("temperature_2m_min", [])
        temps_max = daily.get("temperature_2m_max", [])
        temp_min_c = min(temps_min) if temps_min else None
        temp_max_c = max(temps_max) if temps_max else None

        return {
            "status": "available",
            "source": "open_meteo",
            "location": {
                "latitude": lat,
                "longitude": lon
            },
            "current": {
                "temperature_c": current.get("temperature_2m"),
                "humidity_pct": current.get("relative_humidity_2m"),
                "precipitation_mm": current.get("precipitation")
            },
            "forecast_7day": {
                "rainfall_total_mm": round(rainfall_total, 1),
                "rain_probability_max_pct": rain_prob_max,
                "temperature_min_c": temp_min_c,
                "temperature_max_c": temp_max_c
            },
            "retrieved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "warning": None
        }

    except requests.exceptions.Timeout:
        logger.warning("Open-Meteo request timed out.")
        return {
            "status": "unavailable",
            "source": "open_meteo",
            "reason": "timeout"
        }
    except requests.exceptions.RequestException as e:
        logger.warning(f"Open-Meteo request failed: {e}")
        return {
            "status": "unavailable",
            "source": "open_meteo",
            "reason": "http_error"
        }
    except ValueError as e:
        logger.warning(f"Open-Meteo parsing failed: {e}")
        return {
            "status": "unavailable",
            "source": "open_meteo",
            "reason": "malformed_response"
        }
