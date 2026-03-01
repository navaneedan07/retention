'use client';

import React from 'react';
import { Box, Card, CardContent, Tab, Tabs, Typography } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import MovieIcon from '@mui/icons-material/Movie';
import EnterpriseDashboard from '@/components/EnterpriseDashboard';
import VideoRetentionDashboard from '@/components/VideoRetentionDashboard';
import { useAppStore } from '@/store/useAppStore';

export default function SimulatorWorkspace() {
  const mode = useAppStore((state) => state.simulationMode);
  const setMode = useAppStore((state) => state.setSimulationMode);

  return (
    <Box sx={{ width: '100%', minWidth: 0, maxWidth: 1320, mx: 'auto' }}>
      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Simulation Mode
          </Typography>
          <Tabs
            value={mode}
            onChange={(_, value) => setMode(value)}
            textColor="primary"
            indicatorColor="primary"
            sx={{ minHeight: 44 }}
          >
            <Tab
              icon={<LanguageIcon fontSize="small" />}
              iconPosition="start"
              value="website"
              label="Website Retention"
              sx={{ minHeight: 44 }}
            />
            <Tab
              icon={<MovieIcon fontSize="small" />}
              iconPosition="start"
              value="video"
              label="Video Retention"
              sx={{ minHeight: 44 }}
            />
          </Tabs>
        </CardContent>
      </Card>

      {mode === 'website' ? <EnterpriseDashboard /> : <VideoRetentionDashboard />}
    </Box>
  );
}
