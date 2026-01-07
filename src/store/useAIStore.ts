import { create } from 'zustand';
import { db, AISettings } from '@/db';

export interface AIContext {
  getSystemContext: () => string;
  handleCommand?: (command: any) => Promise<void>;
  sessionId?: string | null;
  onSessionChange?: (sessionId: string) => void;
  id?: string; // Optional identifier to prevent overwriting by same component
  sourceType?: 'general' | 'mindmap' | 'note' | 'task';
}

interface AIStore {
  settings: AISettings | null;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AISettings>) => Promise<void>;

  // Floating Window State
  isFloatingWindowOpen: boolean;
  isFloatingWindowMinimized: boolean;
  floatingWindowPosition: { x: number; y: number };
  floatingWindowSize: { width: number; height: number };
  
  setFloatingWindowOpen: (open: boolean) => void;
  setFloatingWindowMinimized: (minimized: boolean) => void;
  setFloatingWindowPosition: (x: number, y: number) => void;
  setFloatingWindowSize: (width: number, height: number) => void;

  // Context Management
  currentContext: AIContext | null;
  setContext: (context: AIContext | null) => void;
}

export const useAIStore = create<AIStore>((set, get) => ({
  settings: null,
  isLoading: true,
  
  // Default Window State
  isFloatingWindowOpen: false,
  isFloatingWindowMinimized: false,
  floatingWindowPosition: { x: window.innerWidth - 420, y: 100 },
  floatingWindowSize: { width: 400, height: 600 },

  loadSettings: async () => {
    try {
      let settings = await db.settings.get(1);
      if (!settings) {
        settings = { 
          id: 1, 
          provider: 'openai', 
          apiKey: '', 
          baseUrl: 'https://api.openai.com/v1', 
          model: 'gpt-3.5-turbo' 
        };
        await db.settings.put(settings);
      }
      set({ settings, isLoading: false });
    } catch (error) {
      console.error("Failed to load AI settings", error);
      set({ isLoading: false });
    }
  },
  
  updateSettings: async (newSettings) => {
    const current = get().settings;
    if (!current) return;
    const updated = { ...current, ...newSettings, id: 1 } as AISettings;
    await db.settings.put(updated);
    set({ settings: updated });
  },

  setFloatingWindowOpen: (open) => set({ isFloatingWindowOpen: open }),
  setFloatingWindowMinimized: (minimized) => set({ isFloatingWindowMinimized: minimized }),
  setFloatingWindowPosition: (x, y) => set({ floatingWindowPosition: { x, y } }),
  setFloatingWindowSize: (width, height) => set({ floatingWindowSize: { width, height } }),
  
  currentContext: null,
  setContext: (context) => set({ currentContext: context }),
}));
