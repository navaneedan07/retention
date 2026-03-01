# Hooklabs

Hooklabs is an AI-powered retention intelligence platform that predicts both:
- Website retention (URL-based UX/behavioral analysis)
- Video retention (uploaded video signal extraction and persona simulation)

It combines a modern web app, Node.js API layer, and Python ML service to provide pre-publish retention predictions, drop-off insights, and prioritized improvement recommendations.

## Project Structure

- `frontend/` — Next.js app (UI for Website + Video retention)
- `backend/` — Express API (feature extraction orchestration, simulation routes, ML proxying)
- `ml-service/` — FastAPI ML service (model inference, video analytics, training/evaluation)
- `ml-service/video_engine/` — video metric extractor, simulator, optimization logic

## Core Capabilities

### 1) Website Retention Simulation
- Analyze a target URL
- Extract UX/performance/accessibility signals
- Compute behavioral friction indices
- Predict retention with persona-based attention decay
- Return prioritized fixes with estimated impact

### 2) Video Retention Simulation
- Upload video files (`.mp4`, `.mov`, `.avi`, `.webm`)
- Extract timeline features (hook strength, motion, silence, face presence, scene changes)
- Simulate persona retention second-by-second
- Return drop times, overall retention, and recommended improvements

## Tech Stack

- Frontend: Next.js, React, TypeScript, MUI, Recharts, Zustand
- Backend: Node.js, Express, Multer, Puppeteer/Cheerio, Axios
- ML Service: FastAPI, scikit-learn, pandas, NumPy, OpenCV, MoviePy, Librosa
- Deployment: Vercel (frontend), Render (backend + ML service)

## Future Roadmap (AMD)

- Planned infrastructure upgrade to AMD-powered compute (AMD EPYC-based cloud instances) for backend and ML workloads.
- Goal: improve cost-performance for CPU-heavy retention simulation and video-processing pipelines.
- Optional future phase: evaluate AMD GPU/ROCm acceleration if deep-learning workloads are introduced.

## Local Setup

## Prerequisites
- Node.js 18+
- Python 3.10+
- npm

## 1) Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on: `http://localhost:3000`

## 2) Backend

```bash
cd backend
npm install
node index.js
```

Default backend port: `3001`

Environment variables (optional):
- `ML_SERVICE_URL` (default: `http://localhost:8000`)
- `ML_VIDEO_REQUEST_TIMEOUT_MS`
- `ML_VIDEO_UPLOAD_TIMEOUT_MS`

## 3) ML Service

```bash
cd ml-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

### Backend
- `POST /api/analyze` — website retention analysis
- `POST /api/simulate-video` — video simulation by path/payload
- `POST /api/simulate-video-upload` — multipart video upload simulation

### ML Service
- `POST /predict` — retention prediction for website features
- `POST /api/simulate-video` — video simulation pipeline
- `POST /api/simulate-video-upload` — multipart upload video simulation

## Model Training & Evaluation

### Train model

```bash
cd ml-service
python train.py
```

### Generate evaluation metrics and graphs

```bash
cd ml-service
python evaluate_model_graphs.py
```

Outputs are generated in:
- `ml-service/models/eval_reports/evaluation_metrics.json`
- `ml-service/models/eval_reports/predicted_vs_actual.png`
- `ml-service/models/eval_reports/residual_distribution.png`
- `ml-service/models/eval_reports/loss_by_score_bin.png`
- `ml-service/models/eval_reports/feature_importance_top12.png`
- `ml-service/models/eval_reports/hooklabs_model_dashboard.png`

## Current Evaluation Snapshot

From latest run:
- Test R²: `0.9667`
- Test MAE: `2.0473`
- Test RMSE: `2.6545`
- Test MAPE: `3.88%`

## Notes

- The system includes fallback simulation logic if ML service is temporarily unavailable.
- For best video extraction reliability, ensure codecs/dependencies are available in runtime environment.
- Audio extraction in video pipeline can be enabled via `ENABLE_AUDIO_EXTRACTION=true` when needed.

---

Built as Hooklabs: a dual-mode retention intelligence platform for website and video experiences.
