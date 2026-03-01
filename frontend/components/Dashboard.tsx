'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { AlertTriangle, Zap, CheckCircle, Brain } from 'lucide-react';
import { Card, CardContent, Typography, TextField, Button, Grid, Box, CircularProgress, Alert, Chip, Paper } from '@mui/material';
import axios from 'axios';

const PERSONA_COLORS: Record<string, string> = {
  high_interest: '#34a853',
  average: '#1a73e8',
  low_interest: '#ea4335',
  overall: '#9334e6',
};

export default function Dashboard() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');

  const analyzeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError('');

    try {
      const response = await axios.post('http://localhost:3001/api/analyze', { url });
      setResults(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to analyze URL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 400, color: '#202124' }}>
          Simulation Overview
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Synthetic Audience Simulator — predict user drop-off across three motivation personas.
        </Typography>
      </Box>

      <Card sx={{ mb: 4, boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)' }}>
        <CardContent>
          <form onSubmit={analyzeUrl} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Enter website URL (e.g., https://example.com)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              size="medium"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{
                height: 56,
                px: 4,
                borderRadius: 2,
                textTransform: 'none',
                fontSize: '1rem',
                boxShadow: 'none',
                '&:hover': { boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)' }
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Run Simulation'}
            </Button>
          </form>
          {error && (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      {loading && !results && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {results && !loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Top Stats */}
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ height: '100%', borderTop: '4px solid #9334e6', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)' }}>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="subtitle2" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Overall Retention
                  </Typography>
                  <Typography variant="h3" component="div" sx={{ color: '#202124', my: 2 }}>
                    {results.prediction.base_retention_probability}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Weighted across High / Average / Low interest personas.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ height: '100%', borderTop: '4px solid #ea4335', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)' }}>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="subtitle2" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Friction Total
                  </Typography>
                  <Typography variant="h3" component="div" sx={{ color: '#202124', my: 2 }}>
                    {Math.round(results.prediction.friction_total * 100)}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Cumulative friction from performance, clutter, and accessibility.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ height: '100%', borderTop: '4px solid #34a853', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)' }}>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="subtitle2" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Confidence
                  </Typography>
                  <Typography variant="h3" component="div" sx={{ color: '#202124', my: 2 }}>
                    {results.prediction.confidence}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Signal quality of extracted features.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Charts Row */}
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <Card sx={{ height: '100%', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <Zap size={20} color="#fbbc04" />
                    <Typography variant="h6" sx={{ color: '#202124' }}>Attention Decay Timeline</Typography>
                  </Box>
                  <Box sx={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={results.prediction.attention_decay_timeline}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eaed" />
                        <XAxis dataKey="time" stroke="#5f6368" tick={{ fill: '#5f6368' }} />
                        <YAxis stroke="#5f6368" tick={{ fill: '#5f6368' }} domain={[0, 100]} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 3px 1px rgba(60,64,67,0.15)' }} />
                        <Line type="monotone" dataKey="high_interest" name="High Interest" stroke={PERSONA_COLORS.high_interest} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="average" name="Average" stroke={PERSONA_COLORS.average} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="low_interest" name="Low Interest" stroke={PERSONA_COLORS.low_interest} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="overall" name="Overall" stroke={PERSONA_COLORS.overall} strokeWidth={3} strokeDasharray="6 3" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, lg: 6 }}>
              <Card sx={{ height: '100%', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <Brain size={20} color="#9334e6" />
                    <Typography variant="h6" sx={{ color: '#202124' }}>Persona Retention</Typography>
                  </Box>
                  <Box sx={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={
                        Object.entries(results.prediction.personas).map(([key, data]: [string, any]) => ({
                          name: data.label,
                          retention: data.retention,
                        }))
                      } layout="vertical" margin={{ left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e8eaed" />
                        <XAxis type="number" domain={[0, 100]} stroke="#5f6368" />
                        <YAxis dataKey="name" type="category" stroke="#5f6368" tick={{ fill: '#5f6368' }} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 3px 1px rgba(60,64,67,0.15)' }} />
                        <Bar dataKey="retention" fill="#8ab4f8" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Prioritized Fixes */}
          <Card sx={{ boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <AlertTriangle size={20} color="#ea4335" />
                <Typography variant="h6" sx={{ color: '#202124' }}>Prioritized Improvements</Typography>
              </Box>

              {results.prediction.prioritized_fixes && results.prediction.prioritized_fixes.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {results.prediction.prioritized_fixes.map((fix: any, idx: number) => (
                    <Paper key={idx} variant="outlined" sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'flex-start', borderColor: '#e8eaed', backgroundColor: '#f8f9fa' }}>
                      <Chip
                        label={`+${fix.retention_gain}%`}
                        color={fix.impact_label === 'High' ? 'error' : fix.impact_label === 'Medium' ? 'warning' : 'success'}
                        size="small"
                        sx={{ fontWeight: 'bold', borderRadius: 1 }}
                      />
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#202124' }}>{fix.issue}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{fix.action}</Typography>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              ) : (
                <Alert severity="success" icon={<CheckCircle />} sx={{ borderRadius: 2 }}>
                  No significant friction points detected. The page performs well across all personas.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
}
