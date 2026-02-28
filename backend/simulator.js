// Synthetic Audience Simulator
// Models human attention decay using performance, cognitive load, and accessibility signals.
// Three motivation-level personas simulate different viewer behaviors.

// --- Persona Profiles ---
// Each persona differs in: base_attention, decay_rate, friction_multiplier, drop_threshold

const PERSONAS = {
  high_interest: {
    label: 'High Interest',
    base_attention: 0.9,
    decay_rate: 0.05,
    friction_multiplier: 0.7,
    drop_threshold: 0.2,
    weight: 0.2, // 20% of audience
  },
  average: {
    label: 'Average',
    base_attention: 0.7,
    decay_rate: 0.1,
    friction_multiplier: 1.0,
    drop_threshold: 0.3,
    weight: 0.5, // 50% of audience
  },
  low_interest: {
    label: 'Low Interest',
    base_attention: 0.5,
    decay_rate: 0.15,
    friction_multiplier: 1.3,
    drop_threshold: 0.4,
    weight: 0.3, // 30% of audience
  },
};

// --- Friction Signal Weights ---
// How much each friction dimension contributes to attention loss

const FRICTION_WEIGHTS = {
  performance_friction: 0.25,   // slow load = major friction
  clutter_friction: 0.20,       // visual overload
  navigation_friction: 0.15,    // confusing nav / CTA competition
  cognitive_friction: 0.20,     // text overload / poor readability
  accessibility_friction: 0.10, // a11y barriers
  scroll_friction: 0.10,        // excessive scrolling required
};

// --- Convert behavioral features into friction signals ---
// Each friction value is 0-1 where 1 = maximum friction

function computeFrictionSignals(behavioral) {
  return {
    performance_friction: Math.max(0, 1 - behavioral.performance_score),
    clutter_friction: behavioral.clutter_index,
    navigation_friction: behavioral.cta_competition_score * 0.5 + (1 - behavioral.hero_clarity_score) * 0.5,
    cognitive_friction: behavioral.cognitive_load_index,
    accessibility_friction: Math.max(0, 1 - behavioral.accessibility_score),
    scroll_friction: behavioral.scroll_friction_index,
  };
}

// --- Compute weighted friction sum ---

function totalWeightedFriction(frictionSignals) {
  let total = 0;
  for (const [key, weight] of Object.entries(FRICTION_WEIGHTS)) {
    total += weight * (frictionSignals[key] || 0);
  }
  return total;
}

// --- Unified Attention Equation ---
// Attention(t) = base_attention - decay_rate * t - friction_multiplier * sum(weight_i * friction_i)
// Simulates second-by-second from t=0 to duration

function simulatePersona(persona, frictionSignals, durationSec) {
  const frictionSum = totalWeightedFriction(frictionSignals);
  const timeline = [];
  let dropOffTime = null;

  for (let t = 0; t <= durationSec; t++) {
    const attention = persona.base_attention
      - persona.decay_rate * (t / durationSec) // normalized time decay
      - persona.friction_multiplier * frictionSum * (t / durationSec); // friction accumulates over time

    const clampedAttention = Math.max(0, Math.min(1, attention));
    const retentionPct = clampedAttention * 100;

    timeline.push({ time: t, retention: Math.round(retentionPct * 10) / 10 });

    if (dropOffTime === null && clampedAttention < persona.drop_threshold) {
      dropOffTime = t;
    }
  }

  return {
    label: persona.label,
    timeline,
    drop_off_time: dropOffTime,
    final_retention: timeline[timeline.length - 1].retention,
    base_attention: persona.base_attention * 100,
  };
}

// --- Main Simulation Entry Point ---

function runSimulation(behavioralFeatures, durationSec = 10) {
  const frictionSignals = computeFrictionSignals(behavioralFeatures);
  const frictionSum = totalWeightedFriction(frictionSignals);

  const personaResults = {};
  const personaTimelines = {};

  for (const [key, persona] of Object.entries(PERSONAS)) {
    const result = simulatePersona(persona, frictionSignals, durationSec);
    personaResults[key] = {
      label: result.label,
      retention: Math.round(result.final_retention * 10) / 10,
      drop_off_time: result.drop_off_time,
      base_attention: result.base_attention,
    };
    personaTimelines[key] = result.timeline;
  }

  // Weighted overall retention: 20% high + 50% average + 30% low
  const overallRetention =
    PERSONAS.high_interest.weight * personaResults.high_interest.retention +
    PERSONAS.average.weight * personaResults.average.retention +
    PERSONAS.low_interest.weight * personaResults.low_interest.retention;

  // Combined attention decay timeline (merged per-second)
  const combinedTimeline = [];
  for (let t = 0; t <= durationSec; t++) {
    const entry = { time: t };
    for (const [key] of Object.entries(PERSONAS)) {
      entry[key] = personaTimelines[key][t].retention;
    }
    // Weighted average retention at this timestamp
    entry.overall =
      Math.round((
        PERSONAS.high_interest.weight * personaTimelines.high_interest[t].retention +
        PERSONAS.average.weight * personaTimelines.average[t].retention +
        PERSONAS.low_interest.weight * personaTimelines.low_interest[t].retention
      ) * 10) / 10;
    combinedTimeline.push(entry);
  }

  // Confidence score: higher when extraction signals are strong
  // Penalized when many features are at default/uncertain values
  const signalStrength = [
    behavioralFeatures.performance_score,
    behavioralFeatures.hero_clarity_score,
    behavioralFeatures.readability_index,
    1 - behavioralFeatures.clutter_index,
    behavioralFeatures.accessibility_score,
  ];
  const avgSignal = signalStrength.reduce((a, b) => a + b, 0) / signalStrength.length;
  const confidence = Math.round(Math.min(95, Math.max(30, avgSignal * 100)));

  return {
    base_retention_probability: Math.round(overallRetention * 10) / 10,
    confidence,
    personas: personaResults,
    attention_decay_timeline: combinedTimeline,
    friction_signals: frictionSignals,
    friction_total: Math.round(frictionSum * 1000) / 1000,
  };
}

module.exports = { runSimulation, PERSONAS, computeFrictionSignals, totalWeightedFriction };
