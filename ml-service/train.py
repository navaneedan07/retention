
"""
RetainIQ real-data training pipeline.

Uses existing CSV datasets, validates and cleans them, computes missing behavioral
features, and fits a best-of ensemble regressor selection for retention prediction.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import cross_val_score, train_test_split

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODELS_DIR = os.path.join(BASE_DIR, "models")

REAL_DATASET_PATH = os.path.join(DATA_DIR, "retention_real_dataset.csv")
AUGMENTED_DATASET_PATH = os.path.join(DATA_DIR, "retention_dataset.csv")

RAW_FEATURE_COLUMNS = [
    "load_time",
    "cta_count",
    "heading_depth",
    "scroll_height",
    "text_density",
    "visual_clutter_index",
    "missing_alt_count",
    "aria_role_issues",
    "contrast_violations",
]

BEHAVIORAL_FEATURE_COLUMNS = [
    "clutter_index",
    "cta_competition_score",
    "hero_clarity_score",
    "scroll_friction_index",
    "readability_index",
    "cognitive_load_index",
    "performance_score",
    "contrast_quality",
    "accessibility_score",
]

ALL_FEATURE_COLUMNS = RAW_FEATURE_COLUMNS + BEHAVIORAL_FEATURE_COLUMNS
TARGET_COLUMN = "retention_score"


@dataclass
class ValidationReport:
    dataset_name: str
    rows_before: int
    rows_after: int
    duplicate_rows_removed: int
    rows_missing_target_removed: int
    rows_invalid_removed: int
    missing_values: Dict[str, int]
    numeric_ranges: Dict[str, Dict[str, float]]


def _as_number(value: float | int, default: float = 0.0) -> float:
    try:
        if pd.isna(value):
            return float(default)
        return float(value)
    except Exception:
        return float(default)


def sanitize_text_density(text_density: float) -> float:
    td = _as_number(text_density, 0.2)
    return float(np.clip(td, 0.0001, 8.0))


def compute_behavioral_features(raw: dict) -> dict:
    clutter_index = min(1.0, _as_number(raw.get("visual_clutter_index"), 300) / 3000.0)
    cta_competition_score = min(1.0, _as_number(raw.get("cta_count"), 0) / 8.0)

    heading_depth = float(np.clip(_as_number(raw.get("heading_depth"), 1), 1, 6))
    heading_clarity = min(1.0, heading_depth / 3.0)
    cta_penalty = min(1.0, _as_number(raw.get("cta_count"), 0) / 5.0)
    hero_clarity_score = max(0.0, heading_clarity * 0.6 + (1.0 - cta_penalty) * 0.4)

    scroll_friction_index = min(1.0, _as_number(raw.get("scroll_height"), 1200) / 8000.0)

    # Better readability curve for real web text density distribution.
    td = sanitize_text_density(raw.get("text_density", 0.2))
    readability_index = float(np.exp(-((td - 1.2) ** 2) / (2 * (1.25 ** 2))))

    cognitive_load_index = min(
        1.0,
        clutter_index * 0.4 + cta_competition_score * 0.3 + (1.0 - readability_index) * 0.3,
    )

    load_time = max(0.1, _as_number(raw.get("load_time"), 1.0))
    lcp = max(0.1, _as_number(raw.get("lcp"), load_time * 0.85))
    performance_score = max(0.0, 1.0 - (lcp / 6.0))
    contrast_violations = max(0.0, _as_number(raw.get("contrast_violations"), 0.0))
    contrast_quality = max(0.0, 1.0 - (contrast_violations / 15.0))

    missing_alt_count = max(0.0, _as_number(raw.get("missing_alt_count"), 0.0))
    aria_role_issues = max(0.0, _as_number(raw.get("aria_role_issues"), 0.0))
    accessibility_score = max(
        0.0,
        1.0
        - (
            (min(missing_alt_count, 20.0) / 20.0) * 0.4
            + (min(aria_role_issues, 10.0) / 10.0) * 0.3
            + (1.0 - contrast_quality) * 0.3
        ),
    )

    return {
        "clutter_index": round(clutter_index, 4),
        "cta_competition_score": round(cta_competition_score, 4),
        "hero_clarity_score": round(hero_clarity_score, 4),
        "scroll_friction_index": round(scroll_friction_index, 4),
        "readability_index": round(readability_index, 4),
        "cognitive_load_index": round(cognitive_load_index, 4),
        "performance_score": round(performance_score, 4),
        "contrast_quality": round(contrast_quality, 4),
        "accessibility_score": round(accessibility_score, 4),
    }


def _load_csv(path: str, dataset_name: str) -> pd.DataFrame:
    if not os.path.exists(path):
        raise FileNotFoundError(f"{dataset_name} not found at {path}")
    return pd.read_csv(path)


def _coerce_and_fill(df: pd.DataFrame) -> pd.DataFrame:
    working = df.copy()

    for col in RAW_FEATURE_COLUMNS + [TARGET_COLUMN]:
        if col not in working.columns:
            working[col] = np.nan

    if "data_source" not in working.columns:
        working["data_source"] = "real"

    # Ensure numeric types.
    for col in RAW_FEATURE_COLUMNS + [TARGET_COLUMN]:
        working[col] = pd.to_numeric(working[col], errors="coerce")

    # Defaults and clipping.
    working["load_time"] = working["load_time"].fillna(1.0).clip(lower=0.1, upper=30.0)
    working["cta_count"] = working["cta_count"].fillna(0).clip(lower=0, upper=500).round()
    working["heading_depth"] = working["heading_depth"].fillna(1).clip(lower=1, upper=6).round()
    working["scroll_height"] = working["scroll_height"].fillna(1200).clip(lower=400, upper=120000)
    working["text_density"] = working["text_density"].fillna(0.2).apply(sanitize_text_density)
    working["visual_clutter_index"] = working["visual_clutter_index"].fillna(300).clip(lower=20, upper=25000)
    working["missing_alt_count"] = working["missing_alt_count"].fillna(0).clip(lower=0, upper=200).round()
    working["aria_role_issues"] = working["aria_role_issues"].fillna(0).clip(lower=0, upper=100).round()
    working["contrast_violations"] = working["contrast_violations"].fillna(0).clip(lower=0, upper=100).round()

    # Drop rows without target.
    before_target_drop = len(working)
    working = working.dropna(subset=[TARGET_COLUMN]).copy()
    working[TARGET_COLUMN] = working[TARGET_COLUMN].clip(lower=5, upper=98)
    working.attrs["rows_missing_target_removed"] = before_target_drop - len(working)

    # Compute / overwrite behavioral features using consistent logic.
    behavioral_rows = []
    for _, row in working.iterrows():
        behavioral_rows.append(
            compute_behavioral_features(
                {
                    "load_time": row["load_time"],
                    "cta_count": row["cta_count"],
                    "heading_depth": row["heading_depth"],
                    "scroll_height": row["scroll_height"],
                    "text_density": row["text_density"],
                    "visual_clutter_index": row["visual_clutter_index"],
                    "missing_alt_count": row["missing_alt_count"],
                    "aria_role_issues": row["aria_role_issues"],
                    "contrast_violations": row["contrast_violations"],
                    "lcp": row["load_time"] * 0.85,
                }
            )
        )
    behavioral_df = pd.DataFrame(behavioral_rows)
    for col in BEHAVIORAL_FEATURE_COLUMNS:
        working[col] = behavioral_df[col].values

    # Deduplicate feature-target duplicates.
    dedupe_cols = RAW_FEATURE_COLUMNS + [TARGET_COLUMN]
    before_dedupe = len(working)
    working = working.drop_duplicates(subset=dedupe_cols).copy()
    working.attrs["duplicates_removed"] = before_dedupe - len(working)

    return working


def validate_dataset(df: pd.DataFrame, dataset_name: str) -> ValidationReport:
    rows_before = len(df)
    rows_after = len(df)
    duplicate_rows_removed = int(df.attrs.get("duplicates_removed", 0))
    rows_missing_target_removed = int(df.attrs.get("rows_missing_target_removed", 0))

    missing_values = {col: int(df[col].isna().sum()) for col in ALL_FEATURE_COLUMNS + [TARGET_COLUMN] if col in df.columns}

    numeric_ranges = {}
    for col in ALL_FEATURE_COLUMNS + [TARGET_COLUMN]:
        if col in df.columns:
            numeric_ranges[col] = {
                "min": float(df[col].min()),
                "max": float(df[col].max()),
                "mean": float(df[col].mean()),
            }

    # Remaining invalid rows (should be zero after clipping/coercion).
    invalid_mask = (
        (df["load_time"] < 0.1)
        | (df["heading_depth"] < 1)
        | (df["heading_depth"] > 6)
        | (df[TARGET_COLUMN] < 5)
        | (df[TARGET_COLUMN] > 98)
    )
    rows_invalid_removed = int(invalid_mask.sum())

    return ValidationReport(
        dataset_name=dataset_name,
        rows_before=rows_before,
        rows_after=rows_after,
        duplicate_rows_removed=duplicate_rows_removed,
        rows_missing_target_removed=rows_missing_target_removed,
        rows_invalid_removed=rows_invalid_removed,
        missing_values=missing_values,
        numeric_ranges=numeric_ranges,
    )


def load_and_prepare_training_data() -> Tuple[pd.DataFrame, Dict[str, dict]]:
    real_df_raw = _load_csv(REAL_DATASET_PATH, "retention_real_dataset.csv")
    augmented_df_raw = _load_csv(AUGMENTED_DATASET_PATH, "retention_dataset.csv")

    real_df = _coerce_and_fill(real_df_raw)
    augmented_df = _coerce_and_fill(augmented_df_raw)

    if "data_source" not in real_df.columns:
        real_df["data_source"] = "real"

    combined = pd.concat([real_df, augmented_df], ignore_index=True)
    combined = _coerce_and_fill(combined)

    # Bias towards real rows to avoid overfitting on synthetic variations.
    source_weights = {
        "real": 1.0,
        "variation": 0.35,
        "edge-case": 0.45,
    }
    combined["sample_weight"] = combined["data_source"].map(source_weights).fillna(0.5)

    reports = {
        "real": validate_dataset(real_df, "real"),
        "augmented": validate_dataset(augmented_df, "augmented"),
        "combined": validate_dataset(combined, "combined"),
    }

    return combined, {
        k: {
            "dataset_name": v.dataset_name,
            "rows_before": v.rows_before,
            "rows_after": v.rows_after,
            "duplicate_rows_removed": v.duplicate_rows_removed,
            "rows_missing_target_removed": v.rows_missing_target_removed,
            "rows_invalid_removed": v.rows_invalid_removed,
            "missing_values": v.missing_values,
            "numeric_ranges": v.numeric_ranges,
        }
        for k, v in reports.items()
    }


def train_best_model(df: pd.DataFrame) -> Tuple[object, dict, pd.DataFrame]:
    X = df[ALL_FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]
    sample_weight = df["sample_weight"]

    # Stratify by target quantiles for balanced split.
    y_bins = pd.qcut(y, q=min(10, y.nunique()), duplicates="drop")
    X_train, X_test, y_train, y_test, w_train, w_test = train_test_split(
        X,
        y,
        sample_weight,
        test_size=0.2,
        random_state=42,
        stratify=y_bins,
    )

    candidates = {
        "GradientBoostingRegressor": GradientBoostingRegressor(
            n_estimators=180,
            max_depth=5,
            learning_rate=0.04,
            min_samples_leaf=4,
            subsample=0.8,
            random_state=42,
        ),
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=220,
            max_depth=16,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        ),
        "ExtraTreesRegressor": ExtraTreesRegressor(
            n_estimators=220,
            max_depth=18,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        ),
    }

    best_name = None
    best_model = None
    best_score = float("inf")
    leaderboard: List[dict] = []

    for name, model in candidates.items():
        model.fit(X_train, y_train, sample_weight=w_train)
        preds = model.predict(X_test)

        test_mae = float(mean_absolute_error(y_test, preds))
        test_r2 = float(r2_score(y_test, preds))

        cv_mae = float(
            -cross_val_score(
                model,
                X,
                y,
                cv=3,
                scoring="neg_mean_absolute_error",
            ).mean()
        )

        leaderboard.append(
            {
                "model": name,
                "test_mae": round(test_mae, 4),
                "test_r2": round(test_r2, 4),
                "cv_mae": round(cv_mae, 4),
            }
        )

        # Primary objective: lower CV MAE. Secondary: better R2.
        ranking_score = cv_mae - (test_r2 * 0.05)
        if ranking_score < best_score:
            best_score = ranking_score
            best_name = name
            best_model = model

    train_preds = best_model.predict(X_train)
    test_preds = best_model.predict(X_test)

    metadata = {
        "model_type": best_name,
        "features": ALL_FEATURE_COLUMNS,
        "dataset_rows": int(len(df)),
        "real_samples": int((df["data_source"] == "real").sum()),
        "variation_samples": int((df["data_source"] == "variation").sum()),
        "edge_case_samples": int((df["data_source"] == "edge-case").sum()),
        "train_mae": float(mean_absolute_error(y_train, train_preds)),
        "test_mae": float(mean_absolute_error(y_test, test_preds)),
        "test_r2": float(r2_score(y_test, test_preds)),
        "leaderboard": leaderboard,
    }

    if hasattr(best_model, "feature_importances_"):
        importance_values = best_model.feature_importances_
    else:
        importance_values = np.zeros(len(ALL_FEATURE_COLUMNS))

    feature_importance = (
        pd.DataFrame({"feature": ALL_FEATURE_COLUMNS, "importance": importance_values})
        .sort_values("importance", ascending=False)
        .reset_index(drop=True)
    )

    return best_model, metadata, feature_importance


def train_model() -> None:
    np.random.seed(42)
    os.makedirs(MODELS_DIR, exist_ok=True)

    df, validation_report = load_and_prepare_training_data()
    model, metadata, feature_importance = train_best_model(df)

    # Persist model artifacts.
    joblib.dump(model, os.path.join(MODELS_DIR, "retention_model.pkl"))
    joblib.dump(feature_importance.to_dict("records"), os.path.join(MODELS_DIR, "feature_importance.pkl"))
    joblib.dump(metadata, os.path.join(MODELS_DIR, "training_metadata.pkl"))

    # Persist cleaned merged dataset and validation report.
    cleaned_dataset_path = os.path.join(DATA_DIR, "retention_dataset_validated.csv")
    df.to_csv(cleaned_dataset_path, index=False)

    with open(os.path.join(MODELS_DIR, "data_validation_report.json"), "w", encoding="utf-8") as handle:
        json.dump(validation_report, handle, indent=2)

    with open(os.path.join(MODELS_DIR, "training_summary.json"), "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print("=" * 60)
    print("RetainIQ training completed")
    print(f"Rows used: {len(df)}")
    print(f"Best model: {metadata['model_type']}")
    print(f"Test MAE: {metadata['test_mae']:.3f}")
    print(f"Test R2: {metadata['test_r2']:.3f}")
    print(f"Saved model: {os.path.join(MODELS_DIR, 'retention_model.pkl')}")
    print(f"Validation report: {os.path.join(MODELS_DIR, 'data_validation_report.json')}")
    print("=" * 60)


if __name__ == "__main__":
    train_model()
