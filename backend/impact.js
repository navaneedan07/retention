// Retention Impact & What-If Simulator
// Simulates improvements, computes retention gains, and ranks fixes by impact.

const { computeBehavioralFeatures } = require('./extractor');
const { runSimulation } = require('./simulator');

// --- Improvement scenarios ---
// Each scenario modifies a raw feature, then re-runs the full simulation to measure gain.

const IMPROVEMENT_SCENARIOS = [
  {
    id: 'reduce_lcp',
    issue: 'Slow Largest Contentful Paint (LCP)',
    action: 'Optimize images, defer non-critical JS, use CDN to reduce LCP by ~40%',
    effort: 2, // 1=easy, 3=hard
    apply: (raw) => ({ ...raw, lcp: raw.lcp * 0.6, load_time: raw.load_time * 0.6 }),
  },
  {
    id: 'reduce_clutter',
    issue: 'High visual clutter / DOM complexity',
    action: 'Simplify page layout, remove unnecessary DOM elements, reduce visual noise',
    effort: 2,
    apply: (raw) => ({ ...raw, visual_clutter_index: Math.max(100, raw.visual_clutter_index * 0.5) }),
  },
  {
    id: 'fix_cta_competition',
    issue: 'Too many competing CTAs',
    action: 'Reduce CTA count to 1-2 primary actions, establish clear visual hierarchy',
    effort: 1,
    apply: (raw) => ({ ...raw, cta_count: Math.min(2, raw.cta_count) }),
  },
  {
    id: 'improve_headings',
    issue: 'Weak heading hierarchy / unclear hero section',
    action: 'Add a clear H1 with descriptive subheadings, establish content hierarchy',
    effort: 1,
    apply: (raw) => ({ ...raw, heading_depth: Math.max(3, raw.heading_depth) }),
  },
  {
    id: 'fix_accessibility',
    issue: 'Accessibility violations detected',
    action: 'Add alt text to images, fix ARIA labels, improve color contrast ratios',
    effort: 2,
    apply: (raw) => ({ ...raw, missing_alt_count: 0, aria_role_issues: 0, contrast_violations: 0 }),
  },
  {
    id: 'reduce_scroll',
    issue: 'Excessive page length requiring heavy scrolling',
    action: 'Move key content above fold, reduce vertical scroll depth, use progressive disclosure',
    effort: 2,
    apply: (raw) => ({ ...raw, scroll_height: Math.min(2000, raw.scroll_height) }),
  },
  {
    id: 'optimize_text_density',
    issue: 'Poor text density (too dense or too sparse)',
    action: 'Adjust content density to optimal range, improve whitespace balance',
    effort: 1,
    apply: (raw) => ({ ...raw, text_density: 0.035 }),
  },
  {
    id: 'reduce_tti',
    issue: 'Slow Time to Interactive (TTI)',
    action: 'Reduce JavaScript bundle size, defer non-critical scripts, improve TTI',
    effort: 3,
    apply: (raw) => ({ ...raw, tti: raw.tti * 0.5, load_time: raw.load_time * 0.7 }),
  },
];

// --- Run What-If Analysis ---
// For each scenario, apply the modification, re-run simulation, compute retention delta

function runImpactAnalysis(rawFeatures, baseRetention) {
  const results = [];

  for (const scenario of IMPROVEMENT_SCENARIOS) {
    const modifiedRaw = scenario.apply(rawFeatures);
    const modifiedBehavioral = computeBehavioralFeatures(modifiedRaw);
    const modifiedSim = runSimulation(modifiedBehavioral);
    const retentionGain = modifiedSim.base_retention_probability - baseRetention;

    // Only include scenarios that actually improve retention
    if (retentionGain > 0.5) {
      results.push({
        id: scenario.id,
        issue: scenario.issue,
        action: scenario.action,
        effort: scenario.effort,
        retention_gain: Math.round(retentionGain * 10) / 10,
        new_retention: modifiedSim.base_retention_probability,
        impact_score: Math.round((retentionGain / scenario.effort) * 10) / 10,
        impact_label: retentionGain >= 5 ? 'High' : retentionGain >= 2 ? 'Medium' : 'Low',
      });
    }
  }

  // Sort by impact_score descending (best ROI first)
  results.sort((a, b) => b.impact_score - a.impact_score);

  return results.slice(0, 5); // top 5 fixes
}

// --- User Profile Adjustments ---
// Adjust base retention based on user profile characteristics

function applyUserProfile(baseRetention, userProfile) {
  if (!userProfile) {
    return { personalized_retention: baseRetention, profile_adjustment: 0, segment_retention: {} };
  }

  let adjustment = 0;

  // User type modifiers
  const userTypeModifiers = { new: -5, returning: 5, power: 10 };
  adjustment += userTypeModifiers[userProfile.user_type] || 0;

  // Device modifiers
  const deviceModifiers = { mobile: -3, desktop: 2, tablet: 0 };
  adjustment += deviceModifiers[userProfile.device_type] || 0;

  // Traffic source modifiers
  const trafficModifiers = { organic: 3, direct: 5, social: -2, paid: 0, referral: 2 };
  adjustment += trafficModifiers[userProfile.traffic_source] || 0;

  // Intent modifiers
  const intentModifiers = { browse: -3, evaluate: 2, buy: 8, learn: 1 };
  adjustment += intentModifiers[userProfile.session_intent] || 0;

  const personalized = Math.max(0, Math.min(100, baseRetention + adjustment));

  // Segment retention breakdown
  const segment_retention = {
    new_users: Math.max(0, Math.min(100, baseRetention - 5)),
    returning_users: Math.max(0, Math.min(100, baseRetention + 5)),
    mobile_users: Math.max(0, Math.min(100, baseRetention - 3)),
    desktop_users: Math.max(0, Math.min(100, baseRetention + 2)),
    high_intent: Math.max(0, Math.min(100, baseRetention + 8)),
  };

  return {
    personalized_retention: Math.round(personalized * 10) / 10,
    profile_adjustment: Math.round(adjustment * 10) / 10,
    segment_retention,
  };
}

module.exports = { runImpactAnalysis, applyUserProfile };
