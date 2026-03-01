import { create } from 'zustand';

type NavSection = 'simulator' | 'analytics' | 'performance' | 'personas' | 'settings';
type SimulationMode = 'website' | 'video';

interface User {
  name: string;
  email: string;
  role: string;
}

interface AppState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  themeMode: 'light' | 'dark';
  toggleTheme: () => void;
  user: User | null;
  setUser: (user: User | null) => void;
  activeNav: NavSection;
  setActiveNav: (section: NavSection) => void;
  simulationMode: SimulationMode;
  setSimulationMode: (mode: SimulationMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  themeMode: 'light',
  toggleTheme: () => set((state) => ({ themeMode: state.themeMode === 'light' ? 'dark' : 'light' })),
  user: { name: 'Admin User', email: 'admin@enterprise.com', role: 'Super Admin' },
  setUser: (user) => set({ user }),
  activeNav: 'simulator',
  setActiveNav: (section) => set({ activeNav: section }),
  simulationMode: 'website',
  setSimulationMode: (mode) => set({ simulationMode: mode }),
}));
