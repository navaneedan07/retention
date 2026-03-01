'use client';

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  Warning,
  TrendingUp,
  TrendingDown,
  Speed,
  Visibility,
  AccessibilityNew,
  Psychology,
  Search,
  AutoAwesome,
  CheckCircleOutline,
  Timeline,
  Tune,
  ArrowUpward,
} from '@mui/icons-material';
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
  Bar,
  BarChart,
  Area,
  AreaChart,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const API_BASE = 'http://localhost:3001';

const PERSONA_COLORS: Record<string, string> = {
  high_interest: '#10B981',
  average: '#6366F1',
  low_interest: '#F43F5E',
  overall: '#8B5CF6',
};

const PERSONA_BG: Record<string, string> = {
  high_interest: 'rgba(16,185,129,0.06)',
  average: 'rgba(99,102,241,0.06)',
  low_interest: 'rgba(244,63,94,0.06)',
};

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

// --- Animated Score Ring ---
function ScoreRing({ score, size = 140, strokeWidth = 10, color }: { score: number; size?: number; strokeWidth?: number; color: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score));
  const offset = circumference - (progress / 100) * circumference;

  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          opacity={0.08}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <Box sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <Typography sx={{ fontSize: size * 0.26, fontWeight: 800, lineHeight: 1, color }}>
            {Math.round(score)}
          </Typography>
        </motion.div>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mt: 0.25 }}>
          / 100
        </Typography>
      </Box>
    </Box>
  );
}

// --- Metric Card ---
function MetricCard({
  title, value, subtitle, color, icon, delay = 0,
}: {
  title: string; value: string; subtitle?: string; color: string; icon?: React.ReactNode; delay?: number;
}) {
  return (
    <motion.div variants={fadeUp} transition={{ duration: 0.4, delay }}>
      <Card sx={{ height: '100%', position: 'relative', overflow: 'visible' }}>
        <Box sx={{
          position: 'absolute', top: -1, left: 0, right: 0, height: 3,
          borderRadius: '16px 16px 0 0',
          background: `linear-gradient(90deg, ${color}, ${color}44)`,
        }} />
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' }}>
              {title}
            </Typography>
            {icon && <Box sx={{ color, opacity: 0.6, display: 'flex' }}>{icon}</Box>}
          </Box>
          <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.1, mb: 0.5, letterSpacing: '-0.02em' }}>
            {value}
          </Typography>
          {subtitle && <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{subtitle}</Typography>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// --- Section Header ---
function SectionTitle({ children, subtitle, icon }: { children: React.ReactNode; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
      {icon && <Box sx={{ color: 'primary.main', mt: 0.25 }}>{icon}</Box>}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' }}>{children}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mt: 0.25 }}>{subtitle}</Typography>}
      </Box>
    </Box>
  );
}

// --- Loading Steps ---
function LoadingSteps() {
  const [step, setStep] = useState(0);
  const steps = ['Connecting to website...', 'Extracting page features...', 'Computing behavioral signals...', 'Running persona simulation...'];

  React.useEffect(() => {
    const interval = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 3 }}>
        <Box sx={{ position: 'relative' }}>
          <CircularProgress size={48} thickness={3} sx={{ color: 'primary.main' }} />
          <Box sx={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Psychology sx={{ fontSize: 20, color: 'primary.main' }} />
          </Box>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{steps[step]}</Typography>
            </motion.div>
          </AnimatePresence>
          <Box sx={{ display: 'flex', gap: 0.75, mt: 2, justifyContent: 'center' }}>
            {steps.map((_, i) => (
              <Box key={i} sx={{
                width: 40, height: 3, borderRadius: 2,
                bgcolor: i <= step ? 'primary.main' : 'divider',
                transition: 'background-color 0.3s ease',
              }} />
            ))}
          </Box>
        </Box>
      </Box>
    </motion.div>
  );
}

// --- Empty State ---
function EmptyState() {
  return (
    <Box sx={{ textAlign: 'center', py: 10 }}>
      <Box sx={{
        width: 72, height: 72, borderRadius: '20px', mx: 'auto', mb: 3,
        background: (theme) => theme.palette.mode === 'light'
          ? 'linear-gradient(135deg, rgba(79,70,229,0.08), rgba(139,92,246,0.08))'
          : 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AutoAwesome sx={{ fontSize: 32, color: 'primary.main' }} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
        Ready to analyze
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto', lineHeight: 1.6 }}>
        Enter a URL above to predict user retention. The simulator models attention decay across three distinct motivation personas backed by published UX research.
      </Typography>
      <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', mt: 4 }}>
        {[
          { icon: <Timeline sx={{ fontSize: 18 }} />, label: 'Attention decay' },
          { icon: <Psychology sx={{ fontSize: 18 }} />, label: '3 personas' },
          { icon: <Speed sx={{ fontSize: 18 }} />, label: 'Real-time' },
        ].map((item) => (
          <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ color: 'primary.main', display: 'flex' }}>{item.icon}</Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>{item.label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// --- Main Dashboard ---
export default function EnterpriseDashboard() {
  const [url, setUrl] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [userProfile, setUserProfile] = useState({
    user_type: 'new',
    device_type: 'mobile',
    traffic_source: 'organic',
    session_intent: 'browse',
    pages_viewed: 2,
    session_duration_sec: 90,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const runAnalysis = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await axios.post(`${API_BASE}/api/analyze`, {
        url: url.trim(),
        userProfile,
      });
      setResult(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.details || 'Analysis failed. Check backend.');
    } finally {
      setLoading(false);
    }
  };

  const timeline = useMemo(() => result?.prediction?.attention_decay_timeline || [], [result]);

  const personas = useMemo(() => {
    if (!result?.prediction?.personas) return [];
    return Object.entries(result.prediction.personas).map(([key, data]: [string, any]) => ({
      key, label: data.label, retention: data.retention,
      drop_off_time: data.drop_off_time, base_attention: data.base_attention,
    }));
  }, [result]);

  const frictionSignals = useMemo(() => {
    if (!result?.prediction?.friction_signals) return [];
    return Object.entries(result.prediction.friction_signals).map(([key, value]) => ({
      name: key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      value: Math.round(Number(value) * 100), key,
    }));
  }, [result]);

  const behavioralFeatures = useMemo(() => {
    if (!result?.behavioral_features) return [];
    return Object.entries(result.behavioral_features).map(([key, value]) => ({
      name: key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      value: Number(value), key,
    }));
  }, [result]);

  const retentionColor = useMemo(() => {
    if (!result) return '#8B5CF6';
    const r = result.prediction.base_retention_probability;
    if (r >= 70) return '#10B981';
    if (r >= 50) return '#F59E0B';
    return '#EF4444';
  }, [result]);

  const frictionIcons: Record<string, React.ReactNode> = {
    performance_friction: <Speed fontSize="small" />,
    clutter_friction: <Visibility fontSize="small" />,
    navigation_friction: <TrendingDown fontSize="small" />,
    cognitive_friction: <Psychology fontSize="small" />,
    accessibility_friction: <AccessibilityNew fontSize="small" />,
    scroll_friction: <TrendingUp fontSize="small" />,
  };

  return (
    <Box sx={{ maxWidth: 1300, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3.5 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5, letterSpacing: '-0.03em' }}>
          Retention Simulator
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520, lineHeight: 1.6 }}>
          Predict user drop-off before publishing. Models human attention decay across three motivation personas using behavioral signals.
        </Typography>
      </Box>

      {/* URL Input */}
      <Card sx={{ mb: 4, overflow: 'visible' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: showProfile ? 2 : 0 }}>
            <TextField
              fullWidth
              placeholder="Enter website URL to analyze..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => e.key === 'Enter' && runAnalysis()}
              slotProps={{
                input: {
                  startAdornment: <Search sx={{ mr: 1, color: 'text.secondary', opacity: 0.5 }} />,
                },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '12px',
                  backgroundColor: (theme) => theme.palette.mode === 'light' ? '#f8f9fb' : 'rgba(255,255,255,0.03)',
                  '&.Mui-focused': {
                    backgroundColor: (theme) => theme.palette.mode === 'light' ? '#fff' : 'rgba(255,255,255,0.05)',
                  },
                },
              }}
            />
            <Button
              variant="contained"
              onClick={runAnalysis}
              disabled={loading || !url.trim()}
              sx={{
                height: 56, minWidth: 140,
                background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                '&:hover': { background: 'linear-gradient(135deg, #4338CA, #6D28D9)' },
                '&.Mui-disabled': { background: (theme) => theme.palette.mode === 'light' ? '#e2e8f0' : '#2d2d44', color: 'text.disabled' },
              }}
            >
              {loading ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Analyze'}
            </Button>
            <Tooltip title="User profile settings" arrow>
              <Button
                variant="outlined"
                onClick={() => setShowProfile(!showProfile)}
                size="small"
                sx={{ height: 56, minWidth: 48, borderColor: 'divider', color: 'text.secondary' }}
              >
                <Tune fontSize="small" />
              </Button>
            </Tooltip>
          </Box>

          <Collapse in={showProfile}>
            <Box sx={{ pt: 1, pb: 0.5, px: 0.5, borderTop: '1px solid', borderColor: 'divider', mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1.5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Simulated Visitor Profile
              </Typography>
              <Grid container spacing={2}>
                {[
                  { label: 'User Type', key: 'user_type', options: ['new', 'returning', 'power'] },
                  { label: 'Device', key: 'device_type', options: ['mobile', 'desktop', 'tablet'] },
                  { label: 'Traffic', key: 'traffic_source', options: ['organic', 'direct', 'social', 'paid', 'referral'] },
                  { label: 'Intent', key: 'session_intent', options: ['browse', 'evaluate', 'buy', 'learn'] },
                ].map((field) => (
                  <Grid size={{ xs: 6, md: 3 }} key={field.key}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{field.label}</InputLabel>
                      <Select
                        value={(userProfile as any)[field.key]}
                        label={field.label}
                        onChange={(e) => setUserProfile((p) => ({ ...p, [field.key]: e.target.value }))}
                        disabled={loading}
                      >
                        {field.options.map((opt) => (
                          <MenuItem key={opt} value={opt} sx={{ textTransform: 'capitalize' }}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Collapse>

          {error && <Alert severity="error" sx={{ mt: 2, borderRadius: '10px' }}>{error}</Alert>}
        </CardContent>
      </Card>

      {/* Loading */}
      <AnimatePresence mode="wait">
        {loading && <LoadingSteps key="loading" />}
      </AnimatePresence>

      {/* Empty State */}
      {!loading && !result && <EmptyState />}

      {/* Results */}
      <AnimatePresence>
        {result && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            {/* Status Badges */}
            <motion.div {...fadeUp} transition={{ delay: 0.05 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  label={result.features.extraction_mode}
                  sx={{
                    bgcolor: result.features.extraction_mode.includes('live') ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                    color: result.features.extraction_mode.includes('live') ? '#10B981' : '#F59E0B',
                    fontWeight: 600,
                  }}
                />
                <Chip
                  size="small"
                  label={`${result.prediction.confidence}% confidence`}
                  sx={{
                    bgcolor: result.prediction.confidence >= 70 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                    color: result.prediction.confidence >= 70 ? '#10B981' : '#F59E0B',
                    fontWeight: 600,
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                  {result.url}
                </Typography>
              </Box>
            </motion.div>

            {/* Hero Score + Metric Cards */}
            <motion.div variants={stagger} initial="initial" animate="animate">
              <Grid container spacing={2.5} sx={{ mb: 4 }}>
                {/* Main Score Ring */}
                <Grid size={{ xs: 12, md: 4 }}>
                  <motion.div variants={fadeUp}>
                    <Card sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3 }}>
                      <CardContent sx={{ textAlign: 'center' }}>
                        <ScoreRing score={result.prediction.base_retention_probability} color={retentionColor} />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1.5, mb: 0.25 }}>
                          Overall Retention
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Weighted audience estimate
                        </Typography>
                      </CardContent>
                    </Card>
                  </motion.div>
                </Grid>

                {/* Side Metrics */}
                <Grid size={{ xs: 12, md: 8 }}>
                  <Grid container spacing={2} sx={{ height: '100%' }}>
                    <Grid size={{ xs: 6 }}>
                      <MetricCard
                        title="Personalized"
                        value={`${result.prediction.user_based_retention?.personalized_retention ?? result.prediction.base_retention_probability}%`}
                        subtitle={`Profile: ${(result.prediction.user_based_retention?.profile_adjustment ?? 0) >= 0 ? '+' : ''}${result.prediction.user_based_retention?.profile_adjustment ?? 0}%`}
                        color="#6366F1"
                        icon={<TrendingUp fontSize="small" />}
                        delay={0.1}
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <MetricCard
                        title="Total Friction"
                        value={`${Math.round(result.prediction.friction_total * 100)}%`}
                        subtitle="Cumulative friction pressure"
                        color="#F43F5E"
                        icon={<TrendingDown fontSize="small" />}
                        delay={0.15}
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <MetricCard
                        title="Load Time"
                        value={`${Number(result.features.load_time).toFixed(1)}s`}
                        subtitle={`LCP: ${Number(result.features.lcp).toFixed(2)}s`}
                        color="#10B981"
                        icon={<Speed fontSize="small" />}
                        delay={0.2}
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <MetricCard
                        title="Accessibility"
                        value={`${Math.round((result.behavioral_features?.accessibility_score ?? 0.8) * 100)}%`}
                        subtitle={`${result.features.missing_alt_count} missing alt, ${result.features.contrast_violations} contrast issues`}
                        color="#F59E0B"
                        icon={<AccessibilityNew fontSize="small" />}
                        delay={0.25}
                      />
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            </motion.div>

            {/* Persona Cards */}
            <motion.div {...fadeUp} transition={{ delay: 0.2 }}>
              <SectionTitle subtitle="Retention across three motivation-level personas" icon={<Psychology fontSize="small" />}>
                Persona Retention
              </SectionTitle>
              <Grid container spacing={2} sx={{ mb: 4 }}>
                {personas.map((p) => (
                  <Grid size={{ xs: 12, md: 4 }} key={p.key}>
                    <Card sx={{
                      height: '100%',
                      background: (theme) => theme.palette.mode === 'light' ? PERSONA_BG[p.key] : PERSONA_BG[p.key],
                      border: `1px solid ${PERSONA_COLORS[p.key]}15`,
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: `0 8px 24px ${PERSONA_COLORS[p.key]}15`,
                      },
                    }}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: PERSONA_COLORS[p.key], fontSize: '0.85rem' }}>
                              {p.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                              Base attention: {p.base_attention}%
                            </Typography>
                          </Box>
                          <ScoreRing score={p.retention} size={64} strokeWidth={5} color={PERSONA_COLORS[p.key]} />
                        </Box>
                        <Box sx={{
                          display: 'flex', alignItems: 'center', gap: 0.75,
                          px: 1.25, py: 0.75, borderRadius: '8px',
                          bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                        }}>
                          {p.drop_off_time !== null ? (
                            <>
                              <Warning sx={{ fontSize: 14, color: PERSONA_COLORS[p.key] }} />
                              <Typography variant="caption" color="text.secondary">
                                Drops at <strong>{p.drop_off_time}s</strong>
                              </Typography>
                            </>
                          ) : (
                            <>
                              <CheckCircleOutline sx={{ fontSize: 14, color: '#10B981' }} />
                              <Typography variant="caption" color="text.secondary">
                                Retains through full window
                              </Typography>
                            </>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </motion.div>

            {/* Charts */}
            <motion.div {...fadeUp} transition={{ delay: 0.3 }}>
              <Grid container spacing={2.5} sx={{ mb: 4 }}>
                {/* Attention Decay */}
                <Grid size={{ xs: 12, lg: 8 }}>
                  <Card>
                    <CardContent sx={{ p: 3 }}>
                      <SectionTitle subtitle="Second-by-second attention simulation" icon={<Timeline fontSize="small" />}>
                        Attention Decay Timeline
                      </SectionTitle>
                      <Box sx={{ height: 340, mt: 2 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={timeline} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <defs>
                              <linearGradient id="gradHigh" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={PERSONA_COLORS.high_interest} stopOpacity={0.15} />
                                <stop offset="100%" stopColor={PERSONA_COLORS.high_interest} stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="gradAvg" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={PERSONA_COLORS.average} stopOpacity={0.15} />
                                <stop offset="100%" stopColor={PERSONA_COLORS.average} stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="gradLow" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={PERSONA_COLORS.low_interest} stopOpacity={0.15} />
                                <stop offset="100%" stopColor={PERSONA_COLORS.low_interest} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.1)" />
                            <XAxis dataKey="time" tickFormatter={(v) => `${v}s`} fontSize={12} />
                            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} width={45} />
                            <RechartsTooltip
                              formatter={(value) => `${Number(value).toFixed(1)}%`}
                              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 13 }}
                            />
                            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                            <Area type="monotone" dataKey="high_interest" name="High Interest" stroke={PERSONA_COLORS.high_interest} strokeWidth={2} fill="url(#gradHigh)" dot={false} />
                            <Area type="monotone" dataKey="average" name="Average" stroke={PERSONA_COLORS.average} strokeWidth={2} fill="url(#gradAvg)" dot={false} />
                            <Area type="monotone" dataKey="low_interest" name="Low Interest" stroke={PERSONA_COLORS.low_interest} strokeWidth={2} fill="url(#gradLow)" dot={false} />
                            <Line type="monotone" dataKey="overall" name="Overall" stroke={PERSONA_COLORS.overall} strokeWidth={2.5} strokeDasharray="6 3" dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Friction */}
                <Grid size={{ xs: 12, lg: 4 }}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent sx={{ p: 3 }}>
                      <SectionTitle subtitle="Friction signal breakdown">Friction Sources</SectionTitle>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        {frictionSignals.map((f) => {
                          const barColor = f.value > 60 ? '#EF4444' : f.value > 30 ? '#F59E0B' : '#10B981';
                          return (
                            <Box key={f.key}>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <Box sx={{ color: barColor, display: 'flex', opacity: 0.8 }}>
                                    {frictionIcons[f.key] || <Visibility fontSize="small" />}
                                  </Box>
                                  <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>{f.name}</Typography>
                                </Box>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: barColor, fontSize: '0.8rem' }}>
                                  {f.value}%
                                </Typography>
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(f.value, 100)}
                                sx={{
                                  height: 5, borderRadius: '3px',
                                  '& .MuiLinearProgress-bar': {
                                    borderRadius: '3px',
                                    background: f.value > 60
                                      ? 'linear-gradient(90deg, #EF4444, #F87171)'
                                      : f.value > 30
                                      ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                                      : 'linear-gradient(90deg, #10B981, #34D399)',
                                  },
                                }}
                              />
                            </Box>
                          );
                        })}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </motion.div>

            {/* Behavioral Features + Segments */}
            <motion.div {...fadeUp} transition={{ delay: 0.35 }}>
              <Grid container spacing={2.5} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, lg: 8 }}>
                  <Card>
                    <CardContent sx={{ p: 3 }}>
                      <SectionTitle subtitle="Normalized behavioral indices (0-100%)">Feature Indices</SectionTitle>
                      <Box sx={{ height: 300, mt: 1 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={behavioralFeatures} layout="vertical" margin={{ left: 90, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(128,128,128,0.1)" />
                            <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} fontSize={12} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
                            <RechartsTooltip
                              formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`}
                              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 13 }}
                            />
                            <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="url(#barGrad)" />
                            <defs>
                              <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#6366F1" />
                                <stop offset="100%" stopColor="#A78BFA" />
                              </linearGradient>
                            </defs>
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, lg: 4 }}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent sx={{ p: 3 }}>
                      <SectionTitle subtitle="Retention across user segments">Segment Breakdown</SectionTitle>
                      {!result?.prediction?.user_based_retention?.segment_retention ||
                      Object.keys(result.prediction.user_based_retention.segment_retention).length === 0 ? (
                        <Alert severity="info" sx={{ mt: 1 }}>No segment data available.</Alert>
                      ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                          {Object.entries(result.prediction.user_based_retention.segment_retention).map(([name, score]) => {
                            const numScore = Number(score);
                            return (
                              <Box key={name}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                  <Typography variant="body2" sx={{ textTransform: 'capitalize', fontWeight: 500, fontSize: '0.8rem' }}>
                                    {name.replace(/_/g, ' ')}
                                  </Typography>
                                  <Typography variant="body2" fontWeight={700} sx={{ fontSize: '0.8rem' }}>
                                    {numScore.toFixed(1)}%
                                  </Typography>
                                </Box>
                                <LinearProgress
                                  variant="determinate"
                                  value={numScore}
                                  sx={{
                                    height: 5, borderRadius: '3px',
                                    '& .MuiLinearProgress-bar': {
                                      borderRadius: '3px',
                                      background: numScore < 50
                                        ? 'linear-gradient(90deg, #EF4444, #F87171)'
                                        : numScore < 70
                                        ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                                        : 'linear-gradient(90deg, #10B981, #34D399)',
                                    },
                                  }}
                                />
                              </Box>
                            );
                          })}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </motion.div>

            {/* Prioritized Improvements */}
            <motion.div {...fadeUp} transition={{ delay: 0.4 }}>
              <Card sx={{ mb: 4 }}>
                <CardContent sx={{ p: 3 }}>
                  <SectionTitle subtitle="Ranked by impact-to-effort ratio" icon={<ArrowUpward fontSize="small" />}>
                    Suggested Improvements
                  </SectionTitle>
                  {!result.prediction.prioritized_fixes || result.prediction.prioritized_fixes.length === 0 ? (
                    <Alert
                      severity="success"
                      icon={<CheckCircleOutline />}
                      sx={{
                        bgcolor: 'rgba(16,185,129,0.06)',
                        border: '1px solid rgba(16,185,129,0.15)',
                        color: '#10B981',
                        borderRadius: '10px',
                        '& .MuiAlert-icon': { color: '#10B981' },
                      }}
                    >
                      No significant improvements identified. The page performs well across all personas.
                    </Alert>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
                      {result.prediction.prioritized_fixes.map((fix: any, idx: number) => (
                        <Paper
                          key={idx}
                          variant="outlined"
                          sx={{
                            p: 2, display: 'flex', gap: 2, alignItems: 'center',
                            borderColor: 'divider', borderRadius: '12px',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                              borderColor: 'primary.main',
                              bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(99,102,241,0.02)' : 'rgba(129,140,248,0.04)',
                              transform: 'translateX(4px)',
                            },
                          }}
                        >
                          <Box sx={{
                            width: 30, height: 30, borderRadius: '8px',
                            bgcolor: (theme) => theme.palette.mode === 'light' ? '#f0f2f5' : '#2d2d44',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
                              {idx + 1}
                            </Typography>
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{fix.issue}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>{fix.action}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                            <Chip
                              label={`+${fix.retention_gain}%`}
                              size="small"
                              sx={{
                                fontWeight: 700, fontSize: '0.72rem',
                                bgcolor: fix.impact_label === 'High' ? 'rgba(239,68,68,0.1)' : fix.impact_label === 'Medium' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                                color: fix.impact_label === 'High' ? '#EF4444' : fix.impact_label === 'Medium' ? '#F59E0B' : '#10B981',
                              }}
                            />
                            <Box sx={{ textAlign: 'right', minWidth: 40 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1, fontSize: '0.6rem' }}>Score</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', fontSize: '0.85rem' }}>{fix.impact_score}</Typography>
                            </Box>
                          </Box>
                        </Paper>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Raw Features (Collapsible) */}
            <motion.div {...fadeUp} transition={{ delay: 0.45 }}>
              <Card sx={{ mb: 4 }}>
                <CardContent sx={{ p: 0 }}>
                  <Box
                    onClick={() => setShowRaw(!showRaw)}
                    sx={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      px: 3, py: 2, cursor: 'pointer',
                      '&:hover': { bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' },
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Raw Extracted Features</Typography>
                    <IconButton size="small">{showRaw ? <ExpandLess /> : <ExpandMore />}</IconButton>
                  </Box>
                  <Collapse in={showRaw}>
                    <TableContainer sx={{ px: 1, pb: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Feature</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Value</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Signal</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(result.features)
                            .filter(([key]) => key !== 'extraction_mode')
                            .map(([key, value]) => {
                              const numeric = Number(value);
                              const isNumeric = Number.isFinite(numeric);
                              const signal = !isNumeric ? 'Info' : numeric > 10 ? 'Risk' : 'OK';
                              return (
                                <TableRow key={key} sx={{ '&:last-child td': { border: 0 } }}>
                                  <TableCell sx={{ textTransform: 'capitalize', fontWeight: 500, fontSize: '0.78rem' }}>{key.replace(/_/g, ' ')}</TableCell>
                                  <TableCell align="right" sx={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: '0.78rem' }}>
                                    {isNumeric ? numeric.toFixed(3) : String(value)}
                                  </TableCell>
                                  <TableCell align="right">
                                    <Chip
                                      size="small"
                                      label={signal}
                                      sx={{
                                        fontSize: '0.65rem', height: 20,
                                        bgcolor: signal === 'Risk' ? 'rgba(245,158,11,0.1)' : signal === 'OK' ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)',
                                        color: signal === 'Risk' ? '#F59E0B' : signal === 'OK' ? '#10B981' : '#64748b',
                                      }}
                                      icon={signal === 'Risk' ? <Warning sx={{ fontSize: '0.8rem !important' }} /> : undefined}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Collapse>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}
