import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { useAIStore } from '@/store/useAIStore';
import { AnimatePresence, motion } from 'framer-motion';
import { AIFloatingWindow } from './AIFloatingWindow';
import { useIsMobile } from '@/hooks/useIsMobile';

export function Layout() {
  const { loadSettings } = useAIStore();
  const location = useLocation();
  const isMobile = useIsMobile();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <div className="flex h-screen w-full bg-white dark:bg-black overflow-hidden">
      {/* Desktop Sidebar: always visible */}
      {!isMobile && <Sidebar />}

      {/* Main content area */}
      <main className="flex-1 overflow-hidden bg-white dark:bg-black relative">
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
