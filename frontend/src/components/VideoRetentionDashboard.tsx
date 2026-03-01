'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Movie, Timeline, Psychology, AutoFixHigh } from '@mui/icons-material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import axios from 'axios';

const API_BASE = 'https://retention-backend-ieae.onrender.com';

interface SimulationResponse {
  input: {
    videoPath: string | null;
    analyzedDuration: number | null;
  };
  simulation: {
    overall_retention: number;
    extraction_mode: 'video' | 'synthetic';
    extraction_reason?: string;
    video_metrics: Record<string, number>;
    persona_retention: Record<string, number>;
    drop_times: Record<string, number | null>;
    timeline: Array<Record<string, number>>;
    improvements: Array<{
      name: string;
      impact_percentage: number;
      description: string;
      type: string;
    }>;
  };
}

function scoreColor(score: number): string {
  if (score >= 70) return '#16a34a';
  if (score >= 45) return '#d97706';
  return '#dc2626';
}

export default function VideoRetentionDashboard() {
  const [mounted, setMounted] = useState(false);
  const [videoPath, setVideoPath] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const runSimulation = async () => {
    if (!videoPath.trim()) {
      setError('Enter a valid video path or upload a video file.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setUploadProgress(0);
    abortControllerRef.current = new AbortController();

    try {
      const response = await axios.post<SimulationResponse>(`${API_BASE}/api/simulate-video`, {
        videoPath: videoPath.trim() || null,
      }, {
        signal: abortControllerRef.current.signal,
      });
      setResult(response.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const details = (err.response?.data as { details?: string; error?: string } | undefined);
        setError(details?.details || details?.error || 'Failed to run simulation');
      } else {
        setError('Failed to run simulation');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const runUploadSimulation = async () => {
    if (!selectedFile) {
      setError('Choose a video file first.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setUploadProgress(0);
    abortControllerRef.current = new AbortController();

    try {
      const formData = new FormData();
      formData.append('video', selectedFile);

      const response = await axios.post<SimulationResponse>(`${API_BASE}/api/simulate-video-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: abortControllerRef.current.signal,
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || 1;
          const progress = Math.round((progressEvent.loaded / total) * 100);
          setUploadProgress(progress);
        },
      });

      setResult(response.data);
      setVideoPath(selectedFile.name);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const details = (err.response?.data as { details?: string; error?: string } | undefined);
        setError(details?.details || details?.error || 'Failed to upload and run simulation');
      } else {
        setError('Failed to upload and run simulation');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const cancelRunningRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
      setError('Request cancelled.');
    }
  };

  const overall = result?.simulation.overall_retention ?? 0;

  const personaBars = useMemo(() => {
    if (!result) return [];
    return Object.entries(result.simulation.persona_retention).map(([name, value]) => ({
      persona: name,
      retention: Number(value.toFixed(2)),
      drop: result.simulation.drop_times[name] ?? result.input.analyzedDuration ?? 0,
    }));
  }, [result]);

  const attentionTimeline = useMemo(() => {
    if (!result) return [];
    return result.simulation.timeline.map((row) => ({
      time: row.time,
      high: row['High Interest Attention'] ?? 0,
      average: row['Average Interest Attention'] ?? 0,
      low: row['Low Interest Attention'] ?? 0,
      overall: row['Overall Retention'] ?? 0,
    }));
  }, [result]);

  const topMetrics = useMemo(() => {
    if (!result) return [];
    const m = result.simulation.video_metrics;
    return [
      { label: 'Hook Strength', value: m.hook_strength ?? 0, max: 1 },
      { label: 'Motion Intensity', value: m.motion_intensity ?? 0, max: 1 },
      { label: 'Face Presence', value: m.face_presence_ratio ?? 0, max: 1 },
      { label: 'Silence Ratio', value: m.silence_ratio ?? 0, max: 1 },
      { label: 'Scene Change Freq', value: m.scene_change_frequency ?? 0, max: 1 },
    ];
  }, [result]);

  return (
    <Box sx={{ width: '100%', minWidth: 0, py: 2 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em', mb: 0.5 }}>
            AI Synthetic Audience Retention Simulator
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Predict pre-publish retention from MP4 signals with 3 viewer personas and what-if fix impact.
          </Typography>
        </Box>

        <Card>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, md: 7 }}>
                <TextField
                  fullWidth
                  label="Video path"
                  placeholder="C:/videos/demo.mp4"
                  value={videoPath}
                  onChange={(e) => setVideoPath(e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    component="label"
                    variant="outlined"
                    sx={{ height: 56 }}
                    disabled={loading}
                  >
                    {selectedFile ? 'Change File' : 'Choose File'}
                    <input
                      type="file"
                      hidden
                      accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,.mp4,.mov,.avi,.webm"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                  </Button>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <Movie />}
                    onClick={selectedFile ? runUploadSimulation : runSimulation}
                    disabled={loading}
                    sx={{ height: 56, flex: 1 }}
                  >
                    {loading ? 'Running...' : selectedFile ? 'Upload & Simulate' : 'Run Simulation'}
                  </Button>
                </Stack>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                    {selectedFile
                      ? `Selected file: ${selectedFile.name}`
                      : 'Duration is auto-detected from the video. If no video path is provided, API runs synthetic prototype mode.'}
                  </Typography>
                  {loading && (
                    <Button color="error" onClick={cancelRunningRequest}>
                      Cancel
                    </Button>
                  )}
                </Stack>
              </Grid>
              {loading && selectedFile && (
                <Grid size={{ xs: 12 }}>
                  <LinearProgress variant="determinate" value={Math.max(5, uploadProgress)} />
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>

        {error && <Alert severity="error">{error}</Alert>}

        {result?.simulation.extraction_mode === 'synthetic' && (
          <Alert severity="warning">
            Using synthetic mode ({result.simulation.extraction_reason || 'fallback'}). Check video path/codec or OpenCV support if you expected real MP4 extraction.
          </Alert>
        )}

        {!result && !loading && (
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5 }}>Prototype Flow</Typography>
              <Typography variant="body2" color="text.secondary">
                MP4 → Metric extraction → Friction modeling → Persona attention simulation → Drop-off prediction → Ranked fixes.
              </Typography>
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Psychology fontSize="small" color="primary" />
                      <Typography variant="subtitle2" color="text.secondary">Overall Retention</Typography>
                    </Stack>
                    <Typography variant="h3" sx={{ fontWeight: 800, color: scoreColor(overall) }}>
                      {overall.toFixed(1)}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Extraction mode: {result.simulation.extraction_mode}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                      Analyzed duration: {result.input.analyzedDuration ?? result.simulation.video_metrics.video_length ?? '--'} sec
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 8 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                      <Timeline fontSize="small" color="primary" />
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Persona Retention</Typography>
                    </Stack>
                    <Box sx={{ width: '100%', height: 220 }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={220}>
                        <BarChart data={personaBars}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="persona" />
                          <YAxis domain={[0, 100]} />
                          <Tooltip />
                          <Bar dataKey="retention" fill="#6366f1" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Attention Timeline</Typography>
                <Box sx={{ width: '100%', height: 280 }}>
                  {mounted ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={280}>
                      <LineChart data={attentionTimeline}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" />
                        <YAxis domain={[0, 1]} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="high" stroke="#16a34a" dot={false} strokeWidth={2} name="High Interest" />
                        <Line type="monotone" dataKey="average" stroke="#4f46e5" dot={false} strokeWidth={2} name="Average Interest" />
                        <Line type="monotone" dataKey="low" stroke="#dc2626" dot={false} strokeWidth={2} name="Low Interest" />
                        <Line type="monotone" dataKey="overall" stroke="#7c3aed" dot={false} strokeWidth={2} name="Overall Retention" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : null}
                </Box>
              </CardContent>
            </Card>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Extracted Video Metrics</Typography>
                    <Stack spacing={1.5}>
                      {topMetrics.map((m) => {
                        const normalized = Math.max(0, Math.min(100, (m.value / m.max) * 100));
                        return (
                          <Box key={m.label}>
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                              <Typography variant="body2">{m.label}</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>{normalized.toFixed(1)}%</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={normalized} />
                          </Box>
                        );
                      })}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                      <AutoFixHigh fontSize="small" color="primary" />
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Top Fix Suggestions</Typography>
                    </Stack>
                    <Stack spacing={1.25}>
                      {result.simulation.improvements.slice(0, 5).map((fix) => (
                        <Box key={fix.name} sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{fix.name}</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: '#16a34a' }}>
                              +{fix.impact_percentage.toFixed(2)}%
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">{fix.description}</Typography>
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </>
        )}
      </Stack>
    </Box>
  );
}
