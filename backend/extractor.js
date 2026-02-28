const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveChromeExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const cacheRoot = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  if (!fs.existsSync(cacheRoot)) {
    return undefined;
  }

  const dirs = fs
    .readdirSync(cacheRoot)
    .filter((dir) => dir.startsWith('win64-'))
    .sort()
    .reverse();

  for (const dir of dirs) {
    const candidate = path.join(cacheRoot, dir, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function normalizeFeatureBounds(features) {
  return {
    load_time: Math.max(0.1, Number(features.load_time || 1.0)),
    cta_count: Math.max(0, Number(features.cta_count || 0)),
    heading_depth: Math.max(1, Number(features.heading_depth || 1)),
    scroll_height: Math.max(400, Number(features.scroll_height || 1200)),
    text_density: Math.max(0.0005, Number(features.text_density || 0.01)),
    visual_clutter_index: Math.max(20, Number(features.visual_clutter_index || 200)),
    missing_alt_count: Math.max(0, Number(features.missing_alt_count || 0)),
    aria_role_issues: Math.max(0, Number(features.aria_role_issues || 0)),
    lcp: Math.max(0.1, Number(features.lcp || 1.0)),
    cls: Math.max(0, Number(features.cls || 0.05)),
    tti: Math.max(0.1, Number(features.tti || 1.2)),
    contrast_violations: Math.max(0, Number(features.contrast_violations || 0)),
    extraction_mode: features.extraction_mode || 'unknown'
  };
}

function estimateContrastViolationsFromHtml($) {
  let violations = 0;
  $('[style]').each((_, el) => {
    const style = ($(el).attr('style') || '').toLowerCase();
    if (style.includes('color: #') && style.includes('background')) {
      violations += 1;
    }
    if (style.includes('opacity: 0.') || style.includes('font-size: 10px') || style.includes('font-size: 11px')) {
      violations += 1;
    }
  });
  return Math.min(30, violations);
}

async function extractFeaturesViaHttp(url) {
  const startTime = Date.now();
  const response = await axios.get(url, {
    timeout: 20000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  const loadTime = (Date.now() - startTime) / 1000;
  const html = String(response.data || '');
  const $ = cheerio.load(html);

  const allElements = $('*').length;
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const textLength = bodyText.length;

  const headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  let headingDepth = 1;
  headingTags.forEach((tag, idx) => {
    if ($(tag).length > 0) {
      headingDepth = idx + 1;
    }
  });

  const ctaCount = $('button, input[type="button"], input[type="submit"], a').filter((_, el) => {
    const text = ($(el).text() || $(el).attr('aria-label') || '').toLowerCase();
    const cls = ($(el).attr('class') || '').toLowerCase();
    return /sign up|get started|buy|trial|contact|subscribe|join|download|start|book|apply|register/.test(text) || cls.includes('cta');
  }).length;

  const missingAltCount = $('img').filter((_, img) => {
    const alt = $(img).attr('alt');
    return alt === undefined || alt === null || String(alt).trim() === '';
  }).length;

  const ariaRoleIssues = $('[role=""], [aria-label=""]').length;
  const visualClutterIndex = allElements;
  const scrollHeight = Math.max(600, Math.round((allElements * 8) + (textLength * 0.2)));
  const textDensity = textLength / Math.max(scrollHeight, 1);
  const contrastViolations = estimateContrastViolationsFromHtml($);

  return normalizeFeatureBounds({
    load_time: loadTime,
    cta_count: ctaCount,
    heading_depth: headingDepth,
    scroll_height: scrollHeight,
    text_density: textDensity,
    visual_clutter_index: visualClutterIndex,
    missing_alt_count: missingAltCount,
    aria_role_issues: ariaRoleIssues,
    lcp: loadTime * 0.85,
    cls: Math.min(0.5, visualClutterIndex / 10000),
    tti: loadTime * 1.25,
    contrast_violations: contrastViolations,
    extraction_mode: 'live-http'
  });
}

async function extractFeatures(url) {
  let browser;
  try {
    const executablePath = resolveChromeExecutablePath();
    browser = await puppeteer.launch({ 
      headless: 'new',
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  } catch (error) {
    console.warn(`Puppeteer launch failed for ${url}. Falling back to HTTP extractor:`, error.message);
    try {
      return await extractFeaturesViaHttp(url);
    } catch (httpError) {
      throw new Error(`All extraction modes failed. Browser: ${error.message}; HTTP: ${httpError.message}`);
    }
  }

  const page = await browser.newPage();
  
  // Set viewport to simulate desktop
  await page.setViewport({ width: 1280, height: 800 });

  // Block unnecessary resources to speed up analysis
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
      req.continue(); // We need images for alt text checks, but we could block media
    } else {
      req.continue();
    }
  });

  const startTime = Date.now();
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e) {
    console.warn(`Navigation timeout or error for ${url}:`, e.message);
  }

  const loadTime = (Date.now() - startTime) / 1000; // in seconds

  // Extract structural and cognitive signals
  let features = {};
  try {
    features = await page.evaluate(() => {
    const ctaCount = document.querySelectorAll('button, a.btn, .cta').length;
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const headingDepth = headings.length > 0 ? Math.max(...Array.from(headings).map(h => parseInt(h.tagName[1]))) : 0;
    const scrollHeight = document.body.scrollHeight;
    
    // Cognitive Friction Signals (Approximations)
    const textDensity = document.body.innerText.length / (window.innerWidth * window.innerHeight);
    const visualClutterIndex = document.querySelectorAll('*').length; // Simple proxy for DOM complexity
    
    // Accessibility Signals (Basic checks)
    const missingAltCount = document.querySelectorAll('img:not([alt])').length;
    const ariaRoleIssues = document.querySelectorAll('[role=""]').length; // Empty roles

    return {
      ctaCount,
      headingDepth,
      scrollHeight,
      textDensity,
      visualClutterIndex,
      missingAltCount,
      ariaRoleIssues
    };
  });
  } catch (e) {
    console.error(`Failed to evaluate page for ${url}:`, e.message);
    features = {
      ctaCount: 0,
      headingDepth: 0,
      scrollHeight: 1000,
      textDensity: 0.01,
      visualClutterIndex: 500,
      missingAltCount: 0,
      ariaRoleIssues: 0
    };
  } finally {
    await browser.close();
  }

  // Combine with performance metrics
  return normalizeFeatureBounds({
    load_time: loadTime,
    cta_count: features.ctaCount || 0,
    heading_depth: features.headingDepth || 0,
    scroll_height: features.scrollHeight || 1000,
    text_density: features.textDensity || 0.01,
    visual_clutter_index: features.visualClutterIndex || 500,
    missing_alt_count: features.missingAltCount || 0,
    aria_role_issues: features.ariaRoleIssues || 0,
    // Mocking some metrics that would normally require Lighthouse
    lcp: loadTime * 0.8,
    cls: Math.min(0.5, (features.visualClutterIndex || 500) / 10000),
    tti: loadTime * 1.2,
    contrast_violations: Math.max(0, Math.floor((features.missingAltCount || 0) / 2) + Math.floor((features.ariaRoleIssues || 0) / 2)),
    extraction_mode: 'live-browser'
  });
}

// --- Behavioral Feature Engineering ---
// Converts raw extraction metrics into meaningful friction indices (all 0-1 normalized)

const VIEWPORT_AREA = 1280 * 800; // desktop viewport pixels

function computeBehavioralFeatures(raw) {
  // Clutter Index: DOM elements relative to viewport (more elements = more clutter)
  const clutter_index = Math.min(1, raw.visual_clutter_index / 3000);

  // CTA Competition Score: too many CTAs compete for attention
  const cta_competition_score = Math.min(1, raw.cta_count / 8);

  // Hero Clarity Score: presence of clear heading hierarchy + limited CTAs above fold
  // Higher heading_depth with low CTA competition = clearer hero
  const headingClarity = Math.min(1, raw.heading_depth / 3);
  const ctaPenalty = Math.min(1, raw.cta_count / 5);
  const hero_clarity_score = Math.max(0, (headingClarity * 0.6 + (1 - ctaPenalty) * 0.4));

  // Scroll Friction Index: how much scrolling is needed relative to viewport
  const scroll_friction_index = Math.min(1, raw.scroll_height / 8000);

  // Readability Index: Gaussian around practical web-content density.
  const safeDensity = Math.min(8, Math.max(0.0001, raw.text_density));
  const readability_index = Math.exp(-Math.pow(safeDensity - 1.2, 2) / (2 * Math.pow(1.25, 2)));

  // Cognitive Load Index: composite of clutter, text density, and CTA competition
  const cognitive_load_index = Math.min(1,
    clutter_index * 0.4 +
    cta_competition_score * 0.3 +
    (1 - readability_index) * 0.3
  );

  // Performance Score: normalized 0-1 (1 = fast, 0 = slow)
  const performance_score = Math.max(0, 1 - (raw.lcp / 6));

  // Contrast Quality: normalized 0-1 (1 = no violations)
  const contrast_quality = Math.max(0, 1 - (raw.contrast_violations / 15));

  // Accessibility Score: composite of missing alts, ARIA issues, contrast
  const accessibility_score = Math.max(0, 1 - (
    (Math.min(raw.missing_alt_count, 20) / 20) * 0.4 +
    (Math.min(raw.aria_role_issues, 10) / 10) * 0.3 +
    (1 - contrast_quality) * 0.3
  ));

  return {
    clutter_index: round(clutter_index),
    cta_competition_score: round(cta_competition_score),
    hero_clarity_score: round(hero_clarity_score),
    scroll_friction_index: round(scroll_friction_index),
    readability_index: round(readability_index),
    cognitive_load_index: round(cognitive_load_index),
    performance_score: round(performance_score),
    contrast_quality: round(contrast_quality),
    accessibility_score: round(accessibility_score),
  };
}

function round(v) {
  return Math.round(v * 1000) / 1000;
}

module.exports = { extractFeatures, computeBehavioralFeatures };
