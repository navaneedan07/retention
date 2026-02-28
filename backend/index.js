const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractFeatures, computeBehavioralFeatures } = require('./extractor');
const { runSimulation } = require('./simulator');
const { runImpactAnalysis, applyUserProfile } = require('./impact');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  dest: path.join(os.tmpdir(), 'retainiq-uploads'),
  limits: {
    fileSize: 1024 * 1024 * 1024,
  },
});

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Try to get prediction from the ML service.
 * Returns the prediction object on success, or null if the service is unavailable.
 */
async function getMLPrediction(rawFeatures, behavioralFeatures, userProfile) {
  try {
    const payload = {
      ...rawFeatures,
      ...behavioralFeatures,
    };
    if (userProfile) {
      payload.user_profile = userProfile;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`ML service returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.warn(`ML service unavailable (${err.message}), using built-in simulator`);
    return null;
  }
}

async function getVideoSimulation(videoPath) {
  try {
    const payload = {
      video_path: videoPath || null,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);

    const response = await fetch(`${ML_SERVICE_URL}/api/simulate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ML video API returned ${response.status}: ${text}`);
    }

    return await response.json();
  } catch (err) {
    throw new Error(`Video simulation failed: ${err.message}`);
  }
}

app.post('/api/analyze', async (req, res) => {
  let { url, userProfile } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    console.log(`Starting analysis for: ${url}`);

    // 1. Extract raw features from the page
    const rawFeatures = await extractFeatures(url);
    console.log('Raw features extracted:', rawFeatures);

    // 2. Compute behavioral feature indices
    const behavioralFeatures = computeBehavioralFeatures(rawFeatures);
    console.log('Behavioral features:', behavioralFeatures);

    // 3. Try ML service first, fall back to built-in simulator
    const mlResult = await getMLPrediction(rawFeatures, behavioralFeatures, userProfile);

    let prediction;

    if (mlResult && mlResult.base_retention_probability != null) {
      // ML service returned a valid prediction
      console.log(`ML model prediction: ${mlResult.base_retention_probability}% (model_used: ${mlResult.model_used})`);
      prediction = {
        base_retention_probability: mlResult.base_retention_probability,
        confidence: mlResult.confidence,
        personas: mlResult.personas,
        attention_decay_timeline: mlResult.attention_decay_timeline,
        friction_signals: mlResult.friction_signals,
        friction_total: mlResult.friction_total,
        user_based_retention: mlResult.user_based_retention,
        prioritized_fixes: mlResult.prioritized_fixes,
      };
    } else {
      // Fallback: use built-in simulator
      console.log('Using built-in simulator fallback');

      const simulation = runSimulation(behavioralFeatures);
      const prioritized_fixes = runImpactAnalysis(rawFeatures, simulation.base_retention_probability);
      const user_based_retention = applyUserProfile(simulation.base_retention_probability, userProfile);

      prediction = {
        base_retention_probability: simulation.base_retention_probability,
        confidence: simulation.confidence,
        personas: simulation.personas,
        attention_decay_timeline: simulation.attention_decay_timeline,
        friction_signals: simulation.friction_signals,
        friction_total: simulation.friction_total,
        user_based_retention,
        prioritized_fixes,
      };
    }

    // 4. Return combined results
    res.json({
      url,
      features: rawFeatures,
      behavioral_features: behavioralFeatures,
      prediction,
    });
  } catch (error) {
    console.error('Analysis failed:', error);
    res.status(500).json({ error: 'Analysis failed', details: error.message });
  }
});

app.post('/api/simulate-video', async (req, res) => {
  const { videoPath } = req.body || {};

  try {
    const result = await getVideoSimulation(videoPath);
    return res.json({
      input: {
        videoPath: videoPath || null,
        analyzedDuration: result?.timeline?.length || result?.video_metrics?.video_length || null,
      },
      simulation: result,
    });
  } catch (error) {
    console.error('Video simulation failed:', error.message);
    return res.status(500).json({
      error: 'Video simulation failed',
      details: error.message,
    });
  }
});

app.post('/api/simulate-video-upload', upload.single('video'), async (req, res) => {
  const uploadedFilePath = req.file?.path;

  if (!uploadedFilePath) {
    return res.status(400).json({ error: 'Video file is required.' });
  }

  try {
    const result = await getVideoSimulation(uploadedFilePath);
    return res.json({
      input: {
        videoPath: req.file?.originalname || null,
        analyzedDuration: result?.timeline?.length || result?.video_metrics?.video_length || null,
      },
      simulation: result,
    });
  } catch (error) {
    console.error('Video upload simulation failed:', error.message);
    return res.status(500).json({
      error: 'Video upload simulation failed',
      details: error.message,
    });
  } finally {
    if (uploadedFilePath) {
      fs.unlink(uploadedFilePath, () => {});
    }
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`ML service URL: ${ML_SERVICE_URL}`);
});
