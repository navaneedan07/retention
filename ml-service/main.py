"""
RetainIQ ML Prediction Service
Uses a trained GradientBoosting model + 3-persona attention decay simulation.
Falls back to formula-based estimation when the model isn't available.
"""

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import numpy as np
import pandas as pd
import os
import tempfile
import shutil
from typing import Optional, Literal

app = FastAPI(title="RetainIQ ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "retention_model.pkl")
IMPORTANCE_PATH = os.path.join(BASE_DIR, "models", "feature_importance.pkl")
METADATA_PATH = os.path.join(BASE_DIR, "models", "training_metadata.pkl")
VALIDATION_REPORT_PATH = os.path.join(BASE_DIR, "models", "data_validation_report.json")

model = None
feature_importance = None
training_metadata = None

# --- Feature columns (must match train.py) ---

RAW_FEATURE_COLUMNS = [
    "load_time", "cta_count", "heading_depth", "scroll_height",
    "text_density", "visual_clutter_index", "missing_alt_count",
    "aria_role_issues", "contrast_violations",
]

BEHAVIORAL_FEATURE_COLUMNS = [
    "clutter_index", "cta_competition_score", "hero_clarity_score",
    "scroll_friction_index", "readability_index", "cognitive_load_index",
    "performance_score", "contrast_quality", "accessibility_score",
]

ALL_FEATURE_COLUMNS = RAW_FEATURE_COLUMNS + BEHAVIORAL_FEATURE_COLUMNS

# --- 3-Persona Configuration ---

PERSONAS = {
    "high_interest": {
        "label": "High Interest",
        "base_attention": 0.9,
        "decay_rate": 0.05,
        "friction_multiplier": 0.7,
        "drop_threshold": 0.2,
        "weight": 0.2,
    },
    "average": {
        "label": "Average",
        "base_attention": 0.7,
        "decay_rate": 0.1,
        "friction_multiplier": 1.0,
        "drop_threshold": 0.3,
        "weight": 0.5,
    },
    "low_interest": {
        "label": "Low Interest",
        "base_attention": 0.5,
        "decay_rate": 0.15,
        "friction_multiplier": 1.3,
        "drop_threshold": 0.4,
        "weight": 0.3,
    },
}

FRICTION_WEIGHTS = {
    "performance_friction": 0.25,
    "clutter_friction": 0.20,
    "navigation_friction": 0.15,
    "cognitive_friction": 0.20,
    "accessibility_friction": 0.10,
    "scroll_friction": 0.10,
}

# --- Improvement Scenarios ---

IMPROVEMENT_SCENARIOS = [
    {
        "id": "reduce_lcp",
        "issue": "Slow Largest Contentful Paint (LCP)",
        "action": "Optimize images, defer non-critical JS, use CDN to reduce LCP by ~40%",
        "effort": 2,
        "modify": lambda raw: {**raw, "lcp": raw["lcp"] * 0.6, "load_time": raw["load_time"] * 0.6},
    },
    {
        "id": "reduce_clutter",
        "issue": "High visual clutter / DOM complexity",
        "action": "Simplify page layout, remove unnecessary DOM elements, reduce visual noise",
        "effort": 2,
        "modify": lambda raw: {**raw, "visual_clutter_index": max(100, raw["visual_clutter_index"] * 0.5)},
    },
    {
        "id": "fix_cta_competition",
        "issue": "Too many competing CTAs",
        "action": "Reduce CTA count to 1-2 primary actions, establish clear visual hierarchy",
        "effort": 1,
        "modify": lambda raw: {**raw, "cta_count": min(2, raw["cta_count"])},
    },
    {
        "id": "improve_headings",
        "issue": "Weak heading hierarchy / unclear hero section",
        "action": "Add a clear H1 with descriptive subheadings, establish content hierarchy",
        "effort": 1,
        "modify": lambda raw: {**raw, "heading_depth": max(3, raw["heading_depth"])},
    },
    {
        "id": "fix_accessibility",
        "issue": "Accessibility violations detected",
        "action": "Add alt text to images, fix ARIA labels, improve color contrast ratios",
        "effort": 2,
        "modify": lambda raw: {**raw, "missing_alt_count": 0, "aria_role_issues": 0, "contrast_violations": 0},
    },
    {
        "id": "reduce_scroll",
        "issue": "Excessive page length requiring heavy scrolling",
        "action": "Move key content above fold, reduce vertical scroll depth, use progressive disclosure",
        "effort": 2,
        "modify": lambda raw: {**raw, "scroll_height": min(2000, raw["scroll_height"])},
    },
    {
        "id": "optimize_text_density",
        "issue": "Poor text density (too dense or too sparse)",
        "action": "Adjust content density to optimal range, improve whitespace balance",
        "effort": 1,
        "modify": lambda raw: {**raw, "text_density": 0.035},
    },
]


# --- Startup ---

@app.on_event("startup")
def load_model():
    global model, feature_importance, training_metadata
    if os.path.exists(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
        print(f"Model loaded from {MODEL_PATH}")
    else:
        print(f"Model not found at {MODEL_PATH}. Run train.py first. Using formula fallback.")
    if os.path.exists(IMPORTANCE_PATH):
        feature_importance = joblib.load(IMPORTANCE_PATH)
    if os.path.exists(METADATA_PATH):
        training_metadata = joblib.load(METADATA_PATH)


# --- Pydantic Models ---

class UserProfile(BaseModel):
    user_type: Literal["new", "returning", "power"] = "new"
    device_type: Literal["mobile", "desktop", "tablet"] = "desktop"
    traffic_source: Literal["organic", "direct", "social", "paid", "referral"] = "direct"
    session_intent: Literal["browse", "evaluate", "buy", "learn"] = "browse"
    pages_viewed: int = 1
    session_duration_sec: int = 45


class Features(BaseModel):
    load_time: float
    cta_count: int
    heading_depth: int
    scroll_height: float
    text_density: float
    visual_clutter_index: int
    missing_alt_count: int
    aria_role_issues: int
    contrast_violations: int
    lcp: float = 0.0
    # Behavioral features (computed by backend, passed through)
    clutter_index: float = 0.0
    cta_competition_score: float = 0.0
    hero_clarity_score: float = 0.5
    scroll_friction_index: float = 0.0
    readability_index: float = 0.5
    cognitive_load_index: float = 0.0
    performance_score: float = 0.5
    contrast_quality: float = 1.0
    accessibility_score: float = 0.8
    user_profile: Optional[UserProfile] = None


# --- Core Functions ---

def clip(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return float(max(lo, min(hi, value)))


def compute_behavioral_features(raw: dict) -> dict:
    """Mirror of backend computeBehavioralFeatures for when we need to recompute."""
    clutter_index = min(1, raw["visual_clutter_index"] / 3000)
    cta_competition_score = min(1, raw["cta_count"] / 8)
    heading_clarity = min(1, raw["heading_depth"] / 3)
    cta_penalty = min(1, raw["cta_count"] / 5)
    hero_clarity_score = max(0, heading_clarity * 0.6 + (1 - cta_penalty) * 0.4)
    scroll_friction_index = min(1, raw["scroll_height"] / 8000)
    text_density = clip(raw["text_density"], 0.0001, 8.0)
    readability_index = float(np.exp(-((text_density - 1.2) ** 2) / (2 * (1.25 ** 2))))
    cognitive_load_index = min(1, clutter_index * 0.4 + cta_competition_score * 0.3 + (1 - readability_index) * 0.3)
    lcp = raw.get("lcp", raw["load_time"] * 0.85)
    performance_score = max(0, 1 - (lcp / 6))
    contrast_quality = max(0, 1 - (raw["contrast_violations"] / 15))
    accessibility_score = max(0, 1 - (
        (min(raw["missing_alt_count"], 20) / 20) * 0.4
        + (min(raw["aria_role_issues"], 10) / 10) * 0.3
        + (1 - contrast_quality) * 0.3
    ))
    return {
        "clutter_index": round(clutter_index, 4),
        "cta_competition_score": round(cta_competition_score, 4),
        "hero_clarity_score": round(hero_clarity_score, 4),
        "modify": lambda raw: {**raw, "text_density": 1.2},
        "readability_index": round(readability_index, 4),
        "cognitive_load_index": round(cognitive_load_index, 4),
        "performance_score": round(performance_score, 4),
        "contrast_quality": round(contrast_quality, 4),
        "accessibility_score": round(accessibility_score, 4),
    }


def predict_base_retention(feature_dict: dict) -> float:
    """Use the ML model to predict base retention, or fall back to formula."""
    feature_df = pd.DataFrame([[feature_dict.get(col, 0) for col in ALL_FEATURE_COLUMNS]], columns=ALL_FEATURE_COLUMNS)

    if model is not None:
        return float(model.predict(feature_df)[0])

    # Formula fallback (research-grounded, same as train.py labeling)
    row = pd.Series(feature_dict)
    retention = 100.0
    lt = row.get("load_time", 1.0)
    if lt <= 1.0:
        retention -= 2
    elif lt <= 2.0:
        retention -= 2 + (lt - 1.0) * 8
    elif lt <= 3.0:
        retention -= 10 + (lt - 2.0) * 8
    elif lt <= 5.0:
        retention -= 18 + (lt - 3.0) * 7
    else:
        retention -= 32 + (lt - 5.0) * 4

    clutter = row.get("clutter_index", 0)
    if clutter > 0.7:
        retention -= 12
    elif clutter > 0.4:
        retention -= 6
    elif clutter > 0.2:
        retention -= 2

    cta = row.get("cta_count", 1)
    if cta == 0:
        retention -= 15
    elif cta <= 2:
        pass
    elif cta <= 4:
        retention -= 3
    elif cta <= 8:
        retention -= 8
    else:
        retention -= 14

    hero = row.get("hero_clarity_score", 0.5)
    retention -= max(0, (1 - hero) * 10)
    a11y = row.get("accessibility_score", 0.8)
    retention -= max(0, (1 - a11y) * 12)
    cv = row.get("contrast_violations", 0)
    retention -= min(8, cv * 0.8)
    alt = row.get("missing_alt_count", 0)
    retention -= min(6, alt * 0.5)
    readability = row.get("readability_index", 0.5)
    retention -= max(0, (1 - readability) * 6)
    scroll = row.get("scroll_friction_index", 0)
    if scroll > 0.6:
        retention -= 5
    elif scroll > 0.3:
        retention -= 2
    perf = row.get("performance_score", 0.5)
    retention += perf * 5

    return clip(retention, 5, 98)


def compute_friction_signals(behavioral: dict) -> dict:
    return {
        "performance_friction": round(max(0, 1 - behavioral.get("performance_score", 0.5)), 4),
        "clutter_friction": round(behavioral.get("clutter_index", 0), 4),
        "navigation_friction": round(
            behavioral.get("cta_competition_score", 0) * 0.5
            + (1 - behavioral.get("hero_clarity_score", 0.5)) * 0.5, 4
        ),
        "cognitive_friction": round(behavioral.get("cognitive_load_index", 0), 4),
        "accessibility_friction": round(max(0, 1 - behavioral.get("accessibility_score", 0.8)), 4),
        "scroll_friction": round(behavioral.get("scroll_friction_index", 0), 4),
    }


def total_weighted_friction(friction_signals: dict) -> float:
    total = 0.0
    for key, weight in FRICTION_WEIGHTS.items():
        total += weight * friction_signals.get(key, 0)
    return total


def simulate_persona(persona: dict, friction_signals: dict, duration_sec: int = 10):
    friction_sum = total_weighted_friction(friction_signals)
    timeline = []
    drop_off_time = None

    for t in range(duration_sec + 1):
        attention = (
            persona["base_attention"]
            - persona["decay_rate"] * (t / duration_sec)
            - persona["friction_multiplier"] * friction_sum * (t / duration_sec)
        )
        clamped = max(0.0, min(1.0, attention))
        retention_pct = round(clamped * 100, 1)
        timeline.append({"time": t, "retention": retention_pct})

        if drop_off_time is None and clamped < persona["drop_threshold"]:
            drop_off_time = t

    return {
        "label": persona["label"],
        "retention": timeline[-1]["retention"],
        "drop_off_time": drop_off_time,
        "base_attention": persona["base_attention"] * 100,
        "timeline": timeline,
    }


def run_simulation(behavioral: dict, duration_sec: int = 10):
    friction_signals = compute_friction_signals(behavioral)
    friction_sum = total_weighted_friction(friction_signals)

    persona_results = {}
    persona_timelines = {}

    for key, persona in PERSONAS.items():
        result = simulate_persona(persona, friction_signals, duration_sec)
        persona_results[key] = {
            "label": result["label"],
            "retention": result["retention"],
            "drop_off_time": result["drop_off_time"],
            "base_attention": result["base_attention"],
        }
        persona_timelines[key] = result["timeline"]

    # Combined timeline
    combined_timeline = []
    for t in range(duration_sec + 1):
        entry = {"time": t}
        for key in PERSONAS:
            entry[key] = persona_timelines[key][t]["retention"]
        entry["overall"] = round(
            sum(PERSONAS[k]["weight"] * persona_timelines[k][t]["retention"] for k in PERSONAS), 1
        )
        combined_timeline.append(entry)

    # Confidence
    signal_strength = [
        behavioral.get("performance_score", 0.5),
        behavioral.get("hero_clarity_score", 0.5),
        behavioral.get("readability_index", 0.5),
        1 - behavioral.get("clutter_index", 0.5),
        behavioral.get("accessibility_score", 0.8),
    ]
    avg_signal = sum(signal_strength) / len(signal_strength)
    confidence = round(min(95, max(30, avg_signal * 100)))

    return {
        "confidence": confidence,
        "personas": persona_results,
        "attention_decay_timeline": combined_timeline,
        "friction_signals": {k: round(v, 4) for k, v in friction_signals.items()},
        "friction_total": round(friction_sum, 3),
    }


def run_impact_analysis(raw_features: dict, base_retention: float):
    results = []
    for scenario in IMPROVEMENT_SCENARIOS:
        modified_raw = scenario["modify"](raw_features)
        modified_behavioral = compute_behavioral_features(modified_raw)
        modified_feature_dict = {**modified_raw, **modified_behavioral}
        modified_retention = predict_base_retention(modified_feature_dict)
        gain = modified_retention - base_retention

        if gain > 0.5:
            results.append({
                "id": scenario["id"],
                "issue": scenario["issue"],
                "action": scenario["action"],
                "effort": scenario["effort"],
                "retention_gain": round(gain, 1),
                "new_retention": round(modified_retention, 1),
                "impact_score": round(gain / scenario["effort"], 1),
                "impact_label": "High" if gain >= 5 else "Medium" if gain >= 2 else "Low",
            })

    results.sort(key=lambda x: x["impact_score"], reverse=True)
    return results[:5]


def apply_user_profile(base_retention: float, profile: Optional[UserProfile]):
    if profile is None:
        return {"personalized_retention": base_retention, "profile_adjustment": 0, "segment_retention": {}}

    adjustment = 0.0
    adjustment += {"new": -5, "returning": 5, "power": 10}.get(profile.user_type, 0)
    adjustment += {"mobile": -3, "desktop": 2, "tablet": 0}.get(profile.device_type, 0)
    adjustment += {"organic": 3, "direct": 5, "social": -2, "paid": 0, "referral": 2}.get(profile.traffic_source, 0)
    adjustment += {"browse": -3, "evaluate": 2, "buy": 8, "learn": 1}.get(profile.session_intent, 0)

    personalized = clip(base_retention + adjustment)
    segment_retention = {
        "new_users": clip(base_retention - 5),
        "returning_users": clip(base_retention + 5),
        "mobile_users": clip(base_retention - 3),
        "desktop_users": clip(base_retention + 2),
        "high_intent": clip(base_retention + 8),
    }

    return {
        "personalized_retention": round(personalized, 2),
        "profile_adjustment": round(adjustment, 2),
        "segment_retention": {k: round(v, 2) for k, v in segment_retention.items()},
    }


# --- API Endpoints ---

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "model_type": training_metadata.get("model_type", "unknown") if training_metadata else "none",
        "features": len(ALL_FEATURE_COLUMNS),
        "version": "2.0.0",
    }


@app.get("/metrics/importance")
def get_feature_importance():
    if feature_importance is None:
        return {"error": "Feature importance not loaded. Run train.py first."}
    return feature_importance


@app.get("/model/validation")
def get_validation_report():
    if not os.path.exists(VALIDATION_REPORT_PATH):
        return {"error": "Validation report not found. Run train.py first."}
    with open(VALIDATION_REPORT_PATH, "r", encoding="utf-8") as handle:
        import json
        return json.load(handle)


@app.post("/predict")
def predict(features: Features):
    # Build raw feature dict
    raw_features = {
        "load_time": features.load_time,
        "cta_count": features.cta_count,
        "heading_depth": features.heading_depth,
        "scroll_height": features.scroll_height,
        "text_density": features.text_density,
        "visual_clutter_index": features.visual_clutter_index,
        "missing_alt_count": features.missing_alt_count,
        "aria_role_issues": features.aria_role_issues,
        "contrast_violations": features.contrast_violations,
        "lcp": features.lcp or features.load_time * 0.85,
    }

    # Build behavioral features dict (use what was passed, or recompute)
    behavioral = {
        "clutter_index": features.clutter_index,
        "cta_competition_score": features.cta_competition_score,
        "hero_clarity_score": features.hero_clarity_score,
        "scroll_friction_index": features.scroll_friction_index,
        "readability_index": features.readability_index,
        "cognitive_load_index": features.cognitive_load_index,
        "performance_score": features.performance_score,
        "contrast_quality": features.contrast_quality,
        "accessibility_score": features.accessibility_score,
    }

    # If behavioral features look like defaults, recompute them
    if features.clutter_index == 0 and features.performance_score == 0.5:
        behavioral = compute_behavioral_features(raw_features)

    # Full feature dict for model
    all_features = {**raw_features, **behavioral}

    # 1. Predict base retention using ML model (or formula fallback)
    base_retention = predict_base_retention(all_features)
    base_retention = round(clip(base_retention, 5, 98), 2)

    # 2. Run persona-based attention decay simulation
    simulation = run_simulation(behavioral)

    # 3. Run what-if impact analysis
    prioritized_fixes = run_impact_analysis(raw_features, base_retention)

    # 4. Apply user profile adjustments
    user_based_retention = apply_user_profile(base_retention, features.user_profile)

    return {
        "base_retention_probability": base_retention,
        "confidence": simulation["confidence"],
        "model_used": model is not None,
        "personas": simulation["personas"],
        "attention_decay_timeline": simulation["attention_decay_timeline"],
        "friction_signals": simulation["friction_signals"],
        "friction_total": simulation["friction_total"],
        "user_based_retention": user_based_retention,
        "prioritized_fixes": prioritized_fixes,
    }

from video_engine.extractor import VideoMetricExtractor
from video_engine.simulator import VideoSimulator
from video_engine.optimizer import OptimizationEngine

class VideoSimulationRequest(BaseModel):
    video_path: Optional[str] = None


def run_video_retention_pipeline(video_path: Optional[str]):
    extractor = VideoMetricExtractor()
    simulator = VideoSimulator()
    optimizer = OptimizationEngine(simulator)

    max_video_duration = int(os.getenv("VIDEO_MAX_DURATION_SECONDS", "90"))

    extraction = extractor.extract_metrics(video_path=video_path, video_duration=max_video_duration)
    friction_timeline = extraction["timeline"]
    effective_duration = extraction["duration"]

    weights = {
        'weak_hook_friction': 1.0,
        'low_motion_friction': 0.8,
        'high_silence_friction': 0.9,
        'low_face_friction': 0.7
    }

    simulation_result = simulator.simulate_retention(effective_duration, friction_timeline, weights)
    improvements = optimizer.generate_improvements(effective_duration, friction_timeline, weights)

    return {
        'overall_retention': round(simulation_result['overall_retention'], 2),
        'extraction_mode': extraction['mode'],
        'extraction_reason': extraction.get('mode_reason'),
        'video_metrics': extraction['metrics'],
        'persona_retention': {k: round(v, 2) for k, v in simulation_result['persona_retention'].items()},
        'drop_times': simulation_result['drop_times'],
        'timeline': simulation_result['timeline'],
        'improvements': improvements
    }

@app.post('/api/simulate-video')
def simulate_video_retention(req: VideoSimulationRequest):
    return run_video_retention_pipeline(req.video_path)


@app.post('/api/simulate-video-upload')
async def simulate_video_retention_upload(video: UploadFile = File(...)):
    suffix = os.path.splitext(video.filename or '')[1] or '.mp4'
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            shutil.copyfileobj(video.file, temp_file)
            temp_path = temp_file.name

        return run_video_retention_pipeline(temp_path)
    finally:
        await video.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)



