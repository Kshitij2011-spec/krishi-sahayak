"""
disease_meta.py
===============
Static lookup table connecting PlantVillage-style disease names to
severity labels and plain-language explanations.

DATA PROVENANCE
---------------
Disease names match the label set of:
  linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification
  (trained on the PlantVillage dataset, 38 classes)

Severity classifications are based on general agricultural reference:
  - "Low" : cosmetic or early-stage; routine monitoring
  - "Medium" : economic impact likely; action warranted
  - "High" : severe yield loss likely without intervention

Explanations are simplified descriptions for a non-specialist farmer audience.
They do NOT recommend specific pesticides (that comes from pest_risk.json via
the deterministic IPM layer).

SOURCE NOTE: This is a best-effort prototype lookup. Severity assignments
have not been validated by a plant pathologist. Treat as advisory guidance only.
"""

# Keys are lowercase disease names as produced by the label parser.
# Values: (severity, explanation)
DISEASE_META: dict[str, tuple[str, str]] = {
    # ── HEALTHY ──────────────────────────────────────────────────────────
    "healthy": (
        "None",
        "The crop appears healthy. No signs of disease or pest damage detected."
    ),

    # ── APPLE ─────────────────────────────────────────────────────────────
    "apple scab": (
        "Medium",
        "Apple scab is a fungal disease causing dark, scabby lesions on leaves "
        "and fruit. Spreads in cool, wet conditions. Can reduce marketable yield."
    ),
    "black rot": (
        "High",
        "Black rot is a serious fungal disease causing leaf spots, "
        "fruit rot, and cankers on branches. Infected fruit is unmarketable."
    ),
    "cedar apple rust": (
        "Medium",
        "Cedar apple rust causes bright orange spots on leaves and fruit. "
        "It spreads between apple and cedar/juniper trees. Rarely fatal but "
        "reduces photosynthesis and fruit quality."
    ),

    # ── CORN / MAIZE ──────────────────────────────────────────────────────
    "cercospora leaf spot gray leaf spot": (
        "High",
        "Gray Leaf Spot is a fungal disease causing rectangular lesions on leaves. "
        "Under humid conditions it can cause significant yield loss."
    ),
    "common rust": (
        "Medium",
        "Common rust produces small, reddish-brown pustules on leaves. "
        "Moderate infections reduce photosynthesis; severe infections can affect yield."
    ),
    "northern leaf blight": (
        "High",
        "Northern Leaf Blight causes long, cigar-shaped tan lesions. "
        "Can cause 30–50% yield loss in severe cases."
    ),

    # ── GRAPE ─────────────────────────────────────────────────────────────
    "esca (black measles)": (
        "High",
        "Esca is a complex fungal disease causing leaf scorch and berry shrivelling. "
        "Affects vine wood and can cause sudden vine collapse."
    ),
    "grape black rot": (
        "High",
        "Black rot causes brown leaf lesions and mummified berries. "
        "A single infected bunch can spread the disease to the entire cluster."
    ),
    "haunglongbing (citrus greening)": (
        "High",
        "Citrus greening is a bacterial disease spread by insects. "
        "There is no cure. Infected trees decline and eventually die."
    ),
    "isariopsis leaf spot": (
        "Low",
        "Isariopsis leaf spot (also called leaf blight) causes brown angular spots. "
        "Seldom causes major yield loss but indicates humid conditions."
    ),
    "leaf blight (isariopsis leaf spot)": (
        "Low",
        "Leaf blight causes brown angular spots on grape leaves. "
        "Rarely causes major yield loss but can worsen with humidity."
    ),

    # ── PEACH ─────────────────────────────────────────────────────────────
    "bacterial spot": (
        "Medium",
        "Bacterial spot causes water-soaked spots on leaves and fruit. "
        "Infected fruit develops scab-like lesions reducing marketability."
    ),

    # ── PEPPER / BELL PEPPER ──────────────────────────────────────────────
    # (bacterial_spot is same entry above)

    # ── POTATO ────────────────────────────────────────────────────────────
    "early blight": (
        "Medium",
        "Early blight is a fungal disease causing dark concentric rings on leaves. "
        "Begins on older leaves. Can cause moderate defoliation if unchecked."
    ),
    "late blight": (
        "High",
        "Late blight is the same pathogen responsible for the Irish Potato Famine. "
        "It spreads rapidly in cool, wet weather and can destroy a crop within days."
    ),

    # ── RASPBERRY ─────────────────────────────────────────────────────────
    "orange rust": (
        "Medium",
        "Orange rust causes bright orange pustules on the undersides of leaves. "
        "Infected canes are systemically infected and cannot be cured."
    ),

    # ── SOYBEAN ───────────────────────────────────────────────────────────
    "frog eye leaf spot": (
        "Medium",
        "Frog eye leaf spot causes circular lesions with a grey centre and "
        "dark border. Can reduce seed quality and yield in severe infections."
    ),

    # ── SQUASH ────────────────────────────────────────────────────────────
    "powdery mildew": (
        "Medium",
        "Powdery mildew appears as white powdery patches on leaves. "
        "Reduces photosynthesis; rarely kills plants but lowers yield and quality."
    ),

    # ── STRAWBERRY ────────────────────────────────────────────────────────
    "leaf scorch": (
        "Medium",
        "Leaf scorch causes reddish-purple leaf spots that enlarge and "
        "merge, causing the leaf to look scorched. Weakens the plant over time."
    ),

    # ── TOMATO ────────────────────────────────────────────────────────────
    "bacterial spot": (
        "Medium",
        "Bacterial spot causes dark, water-soaked lesions on leaves and fruit. "
        "Spreads in warm, wet conditions; can cause significant defoliation."
    ),
    "tomato early blight": (
        "Medium",
        "Early blight creates dark spots with concentric rings ('target board' pattern). "
        "Affects lower leaves first; progresses upward."
    ),
    "tomato late blight": (
        "High",
        "Late blight is the most destructive tomato disease. Water-soaked grey-green "
        "lesions rapidly turn brown. Can destroy an entire crop within a week in wet weather."
    ),
    "leaf mold": (
        "Medium",
        "Leaf mold causes yellow spots on upper leaf surfaces with olive-green "
        "mold below. Common in greenhouses or high-humidity conditions."
    ),
    "septoria leaf spot": (
        "Medium",
        "Septoria leaf spot causes numerous small circular spots with dark borders. "
        "Begins on lower leaves; heavy infections cause defoliation."
    ),
    "spider mites two-spotted spider mite": (
        "Medium",
        "Spider mites cause stippling, yellowing, and bronze discoloration. "
        "Fine webbing is visible under leaves. Populations explode in hot, dry weather."
    ),
    "target spot": (
        "Medium",
        "Target spot causes circular lesions with concentric rings, similar to early blight. "
        "Can cause significant defoliation in humid conditions."
    ),
    "tomato mosaic virus": (
        "High",
        "Tomato mosaic virus causes mottled light and dark green leaf patterns "
        "and fruit distortion. Spread by contact. There is no cure — remove infected plants."
    ),
    "tomato yellow leaf curl virus": (
        "High",
        "Yellow leaf curl virus (TYLCV) causes severe leaf curling, yellowing, and "
        "stunting. Spread by whiteflies. There is no cure; remove infected plants."
    ),
}

# Severity ordering (for sorting / comparison)
SEVERITY_ORDER = {"None": 0, "Low": 1, "Medium": 2, "High": 3}


def get_disease_meta(disease_name: str) -> dict:
    """
    Return severity and explanation for a disease name.
    Performs a case-insensitive partial-match lookup to handle minor
    label variations from the HF model.

    Returns a dict with keys: severity, explanation, matched_key (or None if not found)
    """
    if not disease_name:
        return {"severity": "Unknown", "explanation": "", "matched_key": None}

    normalized = disease_name.strip().lower()

    # Exact match first
    if normalized in DISEASE_META:
        sev, exp = DISEASE_META[normalized]
        return {"severity": sev, "explanation": exp, "matched_key": normalized}

    # Partial match — disease name substring in key or key substring in disease name
    for key, (sev, exp) in DISEASE_META.items():
        if key in normalized or normalized in key:
            return {"severity": sev, "explanation": exp, "matched_key": key}

    # Not found — return safe fallback
    return {
        "severity": "Unknown",
        "explanation": (
            "No detailed information is available for this condition in the current database. "
            "Consult your local Krishi Vigyan Kendra (KVK) for guidance."
        ),
        "matched_key": None,
    }
