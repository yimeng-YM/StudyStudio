import { create } from 'zustand';
import { useEffect } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const useThemeStore = create<ThemeStore>((set) => ({
  theme: (localStorage.getItem('theme') as Theme) || 'system',
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    updateDomClass(theme);
    set({ theme });
  },
  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme);
      updateDomClass(newTheme);
      return { theme: newTheme };
    });
  },
}));

// Helper to update DOM classes
const updateDomClass = (theme: Theme) => {
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');

  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    root.classList.add(systemTheme);
    return;
  }

  root.classList.add(theme);
};

// Initialize DOM class on script load (optional but good for preventing flash)
const initialTheme = (localStorage.getItem('theme') as Theme) || 'system';
updateDomClass(initialTheme);

// Hook wrapper for compatibility
export function useTheme() {
  const { theme, setTheme, toggleTheme } = useThemeStore();
  
  // Listen for system preference changes if theme is 'system'
  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => updateDomClass('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  return { theme, setTheme, toggleTheme };
}
