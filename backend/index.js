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

const VIDEO_PERSONAS = [
  {
    name: 'High Interest',
    base_attention: 0.95,
    decay_rate: 0.22,
    friction_multiplier: 0.22,
    drop_threshold: 0.22,
    weight: 0.2,
  },
  {
    name: 'Average Interest',
    base_attention: 0.78,
    decay_rate: 0.45,
    friction_multiplier: 0.35,
    drop_threshold: 0.26,
    weight: 0.5,
  },
  {
    name: 'Low Interest',
    base_attention: 0.62,
    decay_rate: 0.7,
    friction_multiplier: 0.5,
    drop_threshold: 0.3,
    weight: 0.3,
  },
];

const VIDEO_FRICTION_WEIGHTS = {
  weak_hook_friction: 1.0,
  low_motion_friction: 0.8,
  high_silence_friction: 0.9,
  low_face_friction: 0.7,
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function buildSyntheticVideoExtraction(durationSec = 60) {
  const timeline = [];
  for (let t = 0; t < durationSec; t += 1) {
    const inSlowSegment = t >= 20 && t <= 30;
    const hookStrength = t < 5 ? 0.9 : 0.55;
    const motionIntensity = inSlowSegment ? 0.15 : 0.62;
    const silenceRatio = inSlowSegment ? 0.78 : 0.08;
    const faceRatio = inSlowSegment ? 0.12 : 0.68;

    timeline.push({
      time: t,
      weak_hook_friction: clamp01(t < 5 ? 1 - hookStrength : 0),
      low_motion_friction: clamp01(1 - motionIntensity),
      high_silence_friction: clamp01(silenceRatio),
      low_face_friction: clamp01(1 - faceRatio),
    });
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const motionSeries = timeline.map((row) => 1 - row.low_motion_friction);
  const faceSeries = timeline.map((row) => 1 - row.low_face_friction);
  const silenceSeries = timeline.map((row) => row.high_silence_friction);
  const hookSeries = timeline.slice(0, Math.min(5, durationSec)).map((row) => 1 - row.weak_hook_friction);
  const sceneChanges = motionSeries.filter((value) => value > 0.55).length / Math.max(1, durationSec);

  return {
    duration: durationSec,
    timeline,
    metrics: {
      scene_change_frequency: Number(sceneChanges.toFixed(4)),
      motion_intensity: Number(avg(motionSeries).toFixed(4)),
      face_presence_ratio: Number(avg(faceSeries).toFixed(4)),
      hook_strength: Number(avg(hookSeries).toFixed(4)),
      silence_ratio: Number(avg(silenceSeries).toFixed(4)),
      video_length: durationSec,
    },
  };
}

function simulateVideoRetention(durationSec, frictionTimeline, weights = VIDEO_FRICTION_WEIGHTS) {
  const frictionByTime = new Map(frictionTimeline.map((item) => [Number(item.time), item]));
  const timeline = [];
  const alive = Object.fromEntries(VIDEO_PERSONAS.map((persona) => [persona.name, true]));
  const dropTimes = Object.fromEntries(VIDEO_PERSONAS.map((persona) => [persona.name, null]));
  const belowThresholdStreak = Object.fromEntries(VIDEO_PERSONAS.map((persona) => [persona.name, 0]));

  let rollingFriction = 0;
  const durationNorm = Math.max(durationSec, 60);

  for (let second = 0; second < durationSec; second += 1) {
    const row = frictionByTime.get(second) || { time: second };
    const totalFrictionPenalty = Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (Number(row[key] || 0) * weight);
    }, 0);

    rollingFriction = (0.85 * rollingFriction) + (0.15 * totalFrictionPenalty);

    const output = { time: second };
    let overallRetention = 0;

    for (const persona of VIDEO_PERSONAS) {
      if (!alive[persona.name]) {
        output[`${persona.name} Attention`] = 0;
        continue;
      }

      const progress = second / durationNorm;
      const attentionRaw = persona.base_attention
        - (persona.decay_rate * progress)
        - (persona.friction_multiplier * rollingFriction);
      let attention = clamp01(attentionRaw);

      if (attention < persona.drop_threshold) {
        belowThresholdStreak[persona.name] += 1;
      } else {
        belowThresholdStreak[persona.name] = 0;
      }

      if (belowThresholdStreak[persona.name] >= 3) {
        alive[persona.name] = false;
        dropTimes[persona.name] = second;
        attention = 0;
      }

      output[`${persona.name} Attention`] = attention;
      overallRetention += persona.weight * attention;
    }

    output['Overall Retention'] = overallRetention;
    timeline.push(output);
  }

  const personaRetention = {};
  for (const persona of VIDEO_PERSONAS) {
    if (alive[persona.name]) {
      personaRetention[persona.name] = 100;
    } else {
      personaRetention[persona.name] = Number(((dropTimes[persona.name] / durationSec) * 100).toFixed(2));
    }
  }

  const overallRetentionPercent = VIDEO_PERSONAS.reduce((sum, persona) => {
    return sum + ((personaRetention[persona.name] / 100) * persona.weight);
  }, 0) * 100;

  return {
    timeline,
    drop_times: dropTimes,
    persona_retention: personaRetention,
    overall_retention: Number(overallRetentionPercent.toFixed(2)),
  };
}

function buildVideoImprovements(durationSec, originalTimeline, weights) {
  const baseline = simulateVideoRetention(durationSec, originalTimeline, weights).overall_retention;

  const patchAndMeasure = (name, description, type, patchFn) => {
    const modified = originalTimeline.map((row, idx) => patchFn({ ...row }, idx));
    const retention = simulateVideoRetention(durationSec, modified, weights).overall_retention;
    return {
      name,
      description,
      type,
      impact_percentage: Number((retention - baseline).toFixed(2)),
    };
  };

  const candidates = [
    patchAndMeasure(
      'Strengthen first 5 seconds',
      'Increase hook strength in the first 5 seconds to reduce early drop-off.',
      'visual',
      (row, idx) => {
        if (idx < 5) {
          row.weak_hook_friction = clamp01((row.weak_hook_friction || 0) - 0.5);
        }
        return row;
      },
    ),
    patchAndMeasure(
      'Reduce silence by 20%',
      'Cut out dead air and long pauses.',
      'audio',
      (row) => {
        row.high_silence_friction = clamp01((row.high_silence_friction || 0) - 0.2);
        return row;
      },
    ),
    patchAndMeasure(
      'Increase motion variation',
      'Add more b-roll, graphics, or cuts to increase dynamic engagement.',
      'visual',
      (row) => {
        row.low_motion_friction = clamp01((row.low_motion_friction || 0) - 0.15);
        return row;
      },
    ),
  ];

  return candidates.sort((a, b) => b.impact_percentage - a.impact_percentage);
}

function buildLocalVideoSimulationFallback(reasonMessage) {
  const extraction = buildSyntheticVideoExtraction(60);
  const simulation = simulateVideoRetention(extraction.duration, extraction.timeline, VIDEO_FRICTION_WEIGHTS);
  const improvements = buildVideoImprovements(extraction.duration, extraction.timeline, VIDEO_FRICTION_WEIGHTS);

  return {
    overall_retention: simulation.overall_retention,
    extraction_mode: 'synthetic',
    extraction_reason: `backend_fallback_ml_unavailable: ${reasonMessage}`,
    video_metrics: extraction.metrics,
    persona_retention: simulation.persona_retention,
    drop_times: simulation.drop_times,
    timeline: simulation.timeline,
    improvements,
  };
}

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

async function getVideoSimulationFromUpload(uploadedFilePath, originalFileName, mimeType) {
  try {
    const fileBuffer = await fs.promises.readFile(uploadedFilePath);
    const formData = new FormData();
    const safeFileName = originalFileName || path.basename(uploadedFilePath) || 'upload.mp4';

    formData.append(
      'video',
      new Blob([fileBuffer], { type: mimeType || 'application/octet-stream' }),
      safeFileName,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);

    const response = await fetch(`${ML_SERVICE_URL}/api/simulate-video-upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ML video upload API returned ${response.status}: ${text}`);
    }

    return await response.json();
  } catch (err) {
    throw new Error(`Video upload simulation failed: ${err.message}`);
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
    console.warn('Video simulation ML unavailable, using backend fallback:', error.message);
    const fallback = buildLocalVideoSimulationFallback(error.message);
    return res.json({
      input: {
        videoPath: videoPath || null,
        analyzedDuration: fallback?.timeline?.length || fallback?.video_metrics?.video_length || null,
      },
      simulation: fallback,
    });
  }
});

app.post('/api/simulate-video-upload', upload.single('video'), async (req, res) => {
  const uploadedFilePath = req.file?.path;

  if (!uploadedFilePath) {
    return res.status(400).json({ error: 'Video file is required.' });
  }

  try {
    const result = await getVideoSimulationFromUpload(
      uploadedFilePath,
      req.file?.originalname,
      req.file?.mimetype,
    );
    return res.json({
      input: {
        videoPath: req.file?.originalname || null,
        analyzedDuration: result?.timeline?.length || result?.video_metrics?.video_length || null,
      },
      simulation: result,
    });
  } catch (error) {
    console.warn('Video upload ML unavailable, using backend fallback:', error.message);
    const fallback = buildLocalVideoSimulationFallback(error.message);
    return res.json({
      input: {
        videoPath: req.file?.originalname || null,
        analyzedDuration: fallback?.timeline?.length || fallback?.video_metrics?.video_length || null,
      },
      simulation: fallback,
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
