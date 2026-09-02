from flask import Blueprint, jsonify
import random

extension_bp = Blueprint('extension', __name__, url_prefix='/api/extension')

@extension_bp.route("/dashboard-stats", methods=["GET"])
def dashboard_stats():
    # Since we are mocking the dashboard for the MVP, 
    # we return a list of high-risk alerts mapped to districts in Maharashtra.
    alerts = [
        {
            "id": 1,
            "district": "Yavatmal",
            "crop": "Cotton",
            "predicted_label": "Pink Bollworm",
            "confidence_score": 0.82,
            "trap_count": 12,
            "crop_stage": "Flowering",
            "latitude": 20.3888,
            "longitude": 78.1204,
            "status": "High Risk",
            "created_at": "2026-09-01T10:00:00Z",
            "is_verified": False
        },
        {
            "id": 2,
            "district": "Amravati",
            "crop": "Soybean",
            "predicted_label": "Girdle Beetle",
            "confidence_score": 0.55,
            "trap_count": None,
            "crop_stage": "Vegetative",
            "latitude": 20.9374,
            "longitude": 77.7796,
            "status": "Under Review",
            "created_at": "2026-09-01T11:30:00Z",
            "is_verified": False
        },
        {
            "id": 3,
            "district": "Pune",
            "crop": "Sugarcane",
            "predicted_label": "Early Shoot Borer",
            "confidence_score": 0.91,
            "trap_count": 0,
            "crop_stage": "Tillering",
            "latitude": 18.5204,
            "longitude": 73.8567,
            "status": "Verified",
            "created_at": "2026-08-31T09:15:00Z",
            "is_verified": True
        }
    ]
    
    return jsonify({
        "status": "success",
        "alerts": alerts,
        "summary": {
            "total_reports": 145,
            "verified_reports": 32,
            "high_risk_zones": 3
        }
    })
