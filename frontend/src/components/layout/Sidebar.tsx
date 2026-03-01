'use client';

import React from 'react';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Toolbar, Box, Divider, Typography } from '@mui/material';
import { Psychology } from '@mui/icons-material';
import { useAppStore } from '../../store/useAppStore';

const drawerWidth = 240;

const menuItems = [
  { key: 'simulator', text: 'Simulator', icon: <Psychology /> },
];

export default function Sidebar() {
  const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);
  const activeNav = useAppStore((state) => state.activeNav);
  const setActiveNav = useAppStore((state) => state.setActiveNav);

  return (
    <Drawer
      variant="persistent"
      open={isSidebarOpen}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: 'border-box',
          borderRight: (theme) => `1px solid ${theme.palette.divider}`,
          backgroundColor: 'background.paper',
        },
      }}
    >
      <Toolbar />
      <Box sx={{ overflow: 'auto', mt: 2, px: 1.5 }}>
        <Typography variant="overline" sx={{ px: 1.5, color: 'text.secondary', fontWeight: 600, display: 'block', mb: 1 }}>
          Navigation
        </Typography>
        <List disablePadding>
          {menuItems.map((item) => {
            const isActive = activeNav === item.key;
            return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              <Box
                onClick={() => setActiveNav(item.key as 'simulator' | 'analytics' | 'performance' | 'personas' | 'settings')}
                sx={{
                  width: '100%',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  py: 1,
                  px: 1.5,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  ...(isActive ? {
                    background: (theme) => theme.palette.mode === 'light'
                      ? 'linear-gradient(135deg, rgba(79,70,229,0.08), rgba(124,58,237,0.08))'
                      : 'linear-gradient(135deg, rgba(129,140,248,0.12), rgba(167,139,250,0.12))',
                    color: 'primary.main',
                    '& .MuiListItemIcon-root': { color: 'primary.main' },
                  } : {
                    '&:hover': {
                      backgroundColor: (theme) => theme.palette.mode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
                    },
                  }),
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    fontSize: '0.85rem',
                    fontWeight: isActive ? 600 : 500,
                  }}
                />
              </Box>
            </ListItem>
            );
          })}
        </List>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ px: 1.5, py: 2 }}>
          <Box sx={{
            p: 2,
            borderRadius: '12px',
            background: (theme) => theme.palette.mode === 'light'
              ? 'linear-gradient(135deg, rgba(79,70,229,0.06), rgba(236,72,153,0.06))'
              : 'linear-gradient(135deg, rgba(79,70,229,0.12), rgba(236,72,153,0.12))',
            border: (theme) => `1px solid ${theme.palette.divider}`,
          }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Synthetic Audience
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Model human attention decay using behavioral signals
            </Typography>
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
}
