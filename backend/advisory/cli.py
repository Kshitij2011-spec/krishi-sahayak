import json
import argparse
import sys
import os

from backend.advisory.engine import run_advisory

def print_summary(result):
    print("Krishi-Sahayak Advisory\n")
    print(f"Status: {result['status'].upper()}")
    
    if result["status"] != "success":
        print("\nErrors:")
        for err in result.get("errors", []):
            print(f"- {err['field']}: {err['message']}")
        return

    top = result.get("top_recommendation", {})
    print(f"Top crop: {top.get('crop', 'None').title()}")
    
    conf = result.get("confidence", {})
    print(f"Advisory confidence: {conf.get('overall', 0)}/100")
    print(f"Confidence level: {conf.get('status', 'unknown').title()}")

    print("\nWhy:")
    for note in conf.get("notes", []):
        print(f"- {note}")
        
    print("\nFertilizer:")
    fert = top.get("fertilizer", {})
    if fert.get("status") == "success":
        print("- Source-backed baseline available")
        print("  See structured result for details")
    else:
        print(f"- {fert.get('status', 'unavailable').title()}: {fert.get('reason', 'Unknown reason')}")

    print("\nReasoning source:")
    source = result.get("reasoning_source", "unknown").replace("_", " ")
    print(f"- {source.title()}")

def load_scenario(scenario_name):
    # Hardcoded scenarios for the CLI demo as requested
    base_input = {
        "location": {"state": "Punjab", "district": "Ludhiana"},
        "soil": {
            "ph": 7.0,
            "nitrogen_kg_ha": 300,
            "phosphorus_kg_ha": 15,
            "potassium_kg_ha": 200,
            "data_source": "soil_health_card"
        },
        "climate": {"season": "rabi"},
        "land": {
            "farm_size_acres": 2,
            "irrigation_type": "canal",
            "water_availability": "moderate"
        },
        "farmer_constraints": {
            "budget_available_inr": 15000,
            "risk_appetite": "medium",
            "primary_goal": "max_profit"
        }
    }
    
    if scenario_name == "punjab-rabi":
        return base_input
    elif scenario_name == "nagpur":
        base_input["location"]["state"] = "Maharashtra"
        base_input["location"]["district"] = "Nagpur"
        base_input["climate"]["season"] = "kharif"
        base_input["land"]["irrigation_type"] = "rainfed"
        return base_input
    else:
        print(f"Unknown scenario: {scenario_name}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Krishi-Sahayak Standalone Advisory CLI")
    parser.add_argument("--input", type=str, help="Path to input JSON file")
    parser.add_argument("--scenario", type=str, help="Name of built-in scenario to run (e.g., punjab-rabi, nagpur)")
    
    args = parser.parse_args()
    
    if args.input:
        if not os.path.exists(args.input):
            print(f"Error: File not found: {args.input}")
            sys.exit(1)
        with open(args.input, "r") as f:
            try:
                raw_input = json.load(f)
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON: {e}")
                sys.exit(1)
    elif args.scenario:
        raw_input = load_scenario(args.scenario)
    else:
        print("Please provide either --input or --scenario")
        sys.exit(1)
        
    result = run_advisory(raw_input)
    print_summary(result)
    
if __name__ == "__main__":
    main()
