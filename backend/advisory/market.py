import os
import requests
import logging

logger = logging.getLogger(__name__)

AGMARKNET_URL = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
HTTP_TIMEOUT_SECONDS = 5.0

def get_market_context(commodity: str, district: str) -> dict:
    """
    Fetches and normalizes market data from AGMARKNET/data.gov.in.
    Returns status unavailable if API key is missing or request fails.
    Does NOT use synthetic fallbacks.
    """
    api_key = os.environ.get("DATA_GOV_IN_API_KEY")
    
    if not api_key:
        return {
            "status": "unavailable",
            "source": "agmarknet_data_gov_in",
            "reason": "missing_credentials"
        }

    params = {
        "api-key": api_key,
        "format": "json",
        "filters[commodity]": commodity,
        "filters[district]": district
    }

    try:
        response = requests.get(AGMARKNET_URL, params=params, timeout=HTTP_TIMEOUT_SECONDS)
        response.raise_for_status()
        api_data = response.json()
        
        records = api_data.get("records", [])
        if not records:
            return {
                "status": "no_data",
                "source": "agmarknet_data_gov_in",
                "reason": "no_market_records_found"
            }
            
        record = records[0]
        
        return {
            "status": "available",
            "source": "agmarknet_data_gov_in",
            "commodity": record.get("commodity", commodity),
            "market": record.get("market", "Unknown Market"),
            "district": record.get("district", district),
            "state": record.get("state", "Unknown State"),
            "modal_price": float(record.get("modal_price", 0)) if record.get("modal_price") else None,
            "min_price": float(record.get("min_price", 0)) if record.get("min_price") else None,
            "max_price": float(record.get("max_price", 0)) if record.get("max_price") else None,
            "arrival_date": record.get("arrival_date"),
            "unit": "INR per Quintal" # Standard for AGMARKNET
        }

    except requests.exceptions.Timeout:
        logger.warning("Market API request timed out.")
        return {
            "status": "unavailable",
            "source": "agmarknet_data_gov_in",
            "reason": "timeout"
        }
    except requests.exceptions.RequestException as e:
        logger.warning(f"Market API request failed: {e}")
        return {
            "status": "unavailable",
            "source": "agmarknet_data_gov_in",
            "reason": "http_error"
        }
    except ValueError as e:
        logger.warning(f"Market API parsing failed: {e}")
        return {
            "status": "unavailable",
            "source": "agmarknet_data_gov_in",
            "reason": "malformed_response"
        }
