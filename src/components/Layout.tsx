import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { useAIStore } from '@/store/useAIStore';
import { AnimatePresence, motion } from 'framer-motion';
import { AIFloatingWindow } from './AIFloatingWindow';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';

export function Layout() {
  const loadSettings = useAIStore(s => s.loadSettings);
  const location = useLocation();
  const isMobile = useIsMobile();
  const runsInNativeShell = Capacitor.isNativePlatform();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <div
      className={cn(
        'app-root-bg flex h-screen w-full overflow-hidden',
        runsInNativeShell && 'native-safe-area-top',
      )}
    >
      {/* 自定义网页背景层（全局，作用于所有页面与侧边栏） */}
      <div className="app-bg-layer" aria-hidden="true" />

      {/* Desktop Sidebar: always visible */}
      {!isMobile && <Sidebar />}

      {/* Main content area */}
      <main className="flex-1 overflow-hidden relative" style={{ contain: 'paint' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full w-full overflow-hidden"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation */}
      {isMobile && <MobileBottomNav />}

      {/* Global AI floating window */}
      <AIFloatingWindow />
    </div>
  );
}
