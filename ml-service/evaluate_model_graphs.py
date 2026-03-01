import json
import os
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from train import ALL_FEATURE_COLUMNS, TARGET_COLUMN, load_and_prepare_training_data


BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
REPORT_DIR = MODELS_DIR / "eval_reports"
MODEL_PATH = MODELS_DIR / "retention_model.pkl"
TRAINING_SUMMARY_PATH = MODELS_DIR / "training_summary.json"


def regression_accuracy_proxies(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    abs_err = np.abs(y_true - y_pred)
    return {
        "within_1pt_pct": float(np.mean(abs_err <= 1.0) * 100.0),
        "within_2pt_pct": float(np.mean(abs_err <= 2.0) * 100.0),
        "within_3pt_pct": float(np.mean(abs_err <= 3.0) * 100.0),
        "within_5pt_pct": float(np.mean(abs_err <= 5.0) * 100.0),
    }


def safe_mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    denom = np.where(np.abs(y_true) < 1e-6, 1e-6, np.abs(y_true))
    return float(np.mean(np.abs((y_true - y_pred) / denom)) * 100.0)


def load_training_summary() -> dict:
    if TRAINING_SUMMARY_PATH.exists():
        with TRAINING_SUMMARY_PATH.open("r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def main() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    model = joblib.load(MODEL_PATH)

    df, _ = load_and_prepare_training_data()
    X = df[ALL_FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]

    y_bins = pd.qcut(y, q=min(10, y.nunique()), duplicates="drop")
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y_bins,
    )

    y_pred_train = model.predict(X_train)
    y_pred_test = model.predict(X_test)

    train_mae = float(mean_absolute_error(y_train, y_pred_train))
    test_mae = float(mean_absolute_error(y_test, y_pred_test))
    train_rmse = float(np.sqrt(mean_squared_error(y_train, y_pred_train)))
    test_rmse = float(np.sqrt(mean_squared_error(y_test, y_pred_test)))
    train_r2 = float(r2_score(y_train, y_pred_train))
    test_r2 = float(r2_score(y_test, y_pred_test))
    test_mape = safe_mape(y_test.to_numpy(), np.asarray(y_pred_test))

    acc = regression_accuracy_proxies(y_test.to_numpy(), np.asarray(y_pred_test))

    residuals = y_test.to_numpy() - np.asarray(y_pred_test)

    # 1) Predicted vs Actual
    plt.figure(figsize=(8.5, 6.2))
    plt.scatter(y_test, y_pred_test, alpha=0.35, s=20)
    lo = float(min(y_test.min(), y_pred_test.min()))
    hi = float(max(y_test.max(), y_pred_test.max()))
    plt.plot([lo, hi], [lo, hi], "r--", linewidth=2, label="Ideal")
    plt.xlabel("Actual Retention Score")
    plt.ylabel("Predicted Retention Score")
    plt.title("Model Fit: Predicted vs Actual (Test Set)")
    plt.legend()
    plt.grid(alpha=0.25)
    plt.tight_layout()
    plt.savefig(REPORT_DIR / "predicted_vs_actual.png", dpi=180)
    plt.close()

    # 2) Residual Distribution
    plt.figure(figsize=(8.5, 6.2))
    plt.hist(residuals, bins=30, alpha=0.85)
    plt.axvline(0, color="red", linestyle="--", linewidth=1.6)
    plt.xlabel("Residual (Actual - Predicted)")
    plt.ylabel("Frequency")
    plt.title("Residual Distribution (Test Set)")
    plt.grid(alpha=0.25)
    plt.tight_layout()
    plt.savefig(REPORT_DIR / "residual_distribution.png", dpi=180)
    plt.close()

    # 3) Absolute Error by True Score Decile
    eval_df = pd.DataFrame({
        "y_true": y_test.to_numpy(),
        "y_pred": np.asarray(y_pred_test),
    })
    eval_df["abs_err"] = np.abs(eval_df["y_true"] - eval_df["y_pred"])
    eval_df["score_bin"] = pd.qcut(eval_df["y_true"], 10, duplicates="drop")
    grouped = eval_df.groupby("score_bin", observed=False)["abs_err"].mean().reset_index()
    grouped["bin_label"] = grouped["score_bin"].astype(str)

    plt.figure(figsize=(11, 6.2))
    plt.bar(grouped["bin_label"], grouped["abs_err"])
    plt.xticks(rotation=45, ha="right")
    plt.ylabel("Mean Absolute Error")
    plt.xlabel("True Retention Score Bin")
    plt.title("Estimated Loss by Retention Range (MAE by Decile)")
    plt.grid(axis="y", alpha=0.25)
    plt.tight_layout()
    plt.savefig(REPORT_DIR / "loss_by_score_bin.png", dpi=180)
    plt.close()

    # 4) Feature Importance (if available)
    if hasattr(model, "feature_importances_"):
        importances = np.asarray(model.feature_importances_)
        order = np.argsort(importances)[::-1][:12]
        top_features = [ALL_FEATURE_COLUMNS[i] for i in order]
        top_importance = importances[order]

        plt.figure(figsize=(10, 6.6))
        plt.barh(top_features[::-1], top_importance[::-1])
        plt.xlabel("Importance")
        plt.title("Top Feature Importances")
        plt.grid(axis="x", alpha=0.25)
        plt.tight_layout()
        plt.savefig(REPORT_DIR / "feature_importance_top12.png", dpi=180)
        plt.close()

    # 5) Combined presentation-ready dashboard
    fig, axes = plt.subplots(2, 2, figsize=(16, 11))
    fig.suptitle("Hooklabs — ML Model Evaluation Snapshot", fontsize=18, fontweight="bold")

    # Panel A: Predicted vs Actual
    ax = axes[0, 0]
    ax.scatter(y_test, y_pred_test, alpha=0.35, s=18)
    ax.plot([lo, hi], [lo, hi], "r--", linewidth=2)
    ax.set_title("Predicted vs Actual")
    ax.set_xlabel("Actual")
    ax.set_ylabel("Predicted")
    ax.grid(alpha=0.25)

    # Panel B: Residual Distribution
    ax = axes[0, 1]
    ax.hist(residuals, bins=30, alpha=0.85)
    ax.axvline(0, color="red", linestyle="--", linewidth=1.6)
    ax.set_title("Residual Distribution")
    ax.set_xlabel("Residual (Actual - Predicted)")
    ax.set_ylabel("Frequency")
    ax.grid(alpha=0.25)

    # Panel C: MAE by Score Bin
    ax = axes[1, 0]
    ax.bar(grouped["bin_label"], grouped["abs_err"])
    ax.set_title("Estimated Loss by Retention Range")
    ax.set_xlabel("True Score Bin")
    ax.set_ylabel("Mean Absolute Error")
    ax.tick_params(axis="x", rotation=45)
    ax.grid(axis="y", alpha=0.25)

    # Panel D: Top feature importance or fallback text
    ax = axes[1, 1]
    if hasattr(model, "feature_importances_"):
        ax.barh(top_features[::-1], top_importance[::-1])
        ax.set_title("Top Feature Importances")
        ax.set_xlabel("Importance")
        ax.grid(axis="x", alpha=0.25)
    else:
        ax.text(0.5, 0.5, "Feature importance not available\nfor this model type", ha="center", va="center", fontsize=12)
        ax.set_title("Top Feature Importances")
        ax.set_xticks([])
        ax.set_yticks([])

    metric_text = (
        f"R²: {test_r2:.4f}   MAE: {test_mae:.3f}   RMSE: {test_rmse:.3f}   MAPE: {test_mape:.2f}%\n"
        f"Within ±2: {acc['within_2pt_pct']:.2f}%   Within ±3: {acc['within_3pt_pct']:.2f}%   Within ±5: {acc['within_5pt_pct']:.2f}%"
    )
    fig.text(0.5, 0.01, metric_text, ha="center", fontsize=11)

    plt.tight_layout(rect=[0.02, 0.04, 1, 0.95])
    plt.savefig(REPORT_DIR / "hooklabs_model_dashboard.png", dpi=220)
    plt.close(fig)

    training_summary = load_training_summary()

    result = {
        "model_type": type(model).__name__,
        "dataset_rows": int(len(df)),
        "train_size": int(len(X_train)),
        "test_size": int(len(X_test)),
        "metrics": {
            "train_mae": train_mae,
            "test_mae": test_mae,
            "train_rmse": train_rmse,
            "test_rmse": test_rmse,
            "train_r2": train_r2,
            "test_r2": test_r2,
            "test_mape_pct": test_mape,
            **acc,
        },
        "existing_training_summary": {
            "test_mae": training_summary.get("test_mae"),
            "test_r2": training_summary.get("test_r2"),
            "cv_leaderboard": training_summary.get("leaderboard", []),
        },
        "artifacts": {
            "predicted_vs_actual": str(REPORT_DIR / "predicted_vs_actual.png"),
            "residual_distribution": str(REPORT_DIR / "residual_distribution.png"),
            "loss_by_score_bin": str(REPORT_DIR / "loss_by_score_bin.png"),
            "feature_importance_top12": str(REPORT_DIR / "feature_importance_top12.png"),
            "hooklabs_model_dashboard": str(REPORT_DIR / "hooklabs_model_dashboard.png"),
        },
    }

    out_path = REPORT_DIR / "evaluation_metrics.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"Saved metrics: {out_path}")
    for key, val in result["artifacts"].items():
        print(f"Saved chart [{key}]: {val}")


if __name__ == "__main__":
    main()
