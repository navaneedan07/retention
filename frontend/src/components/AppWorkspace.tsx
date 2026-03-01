'use client';

import React from 'react';
import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import { useAppStore } from '@/store/useAppStore';
import SimulatorWorkspace from '@/components/SimulatorWorkspace';

function PlaceholderSection({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Box sx={{ width: '100%', minWidth: 0, maxWidth: 1320, mx: 'auto' }}>
      <Card>
        <CardContent>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>{title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>{subtitle}</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined"><CardContent><Typography variant="subtitle2">Module Status</Typography><Typography variant="h6" sx={{ mt: 1 }}>Ready</Typography></CardContent></Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined"><CardContent><Typography variant="subtitle2">Data Pipeline</Typography><Typography variant="h6" sx={{ mt: 1 }}>Connected</Typography></CardContent></Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined"><CardContent><Typography variant="subtitle2">Next Step</Typography><Typography variant="h6" sx={{ mt: 1 }}>Use Simulator</Typography></CardContent></Card>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}

export default function AppWorkspace() {
  const activeNav = useAppStore((state) => state.activeNav);

  if (activeNav === 'simulator') return <SimulatorWorkspace />;
  if (activeNav === 'analytics') {
    return <PlaceholderSection title="Analytics" subtitle="Retention analytics overview and trend comparison modules will appear here." />;
  }
  if (activeNav === 'performance') {
    return <PlaceholderSection title="Performance" subtitle="Performance diagnostics and friction hotspot analysis will appear here." />;
  }
  if (activeNav === 'personas') {
    return <PlaceholderSection title="Personas" subtitle="Persona definitions, thresholds, and sensitivity tuning will appear here." />;
  }
  return <PlaceholderSection title="Settings" subtitle="Model, API, and simulator settings will appear here." />;
}
