import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import React from 'react';

interface ViewTransitionHandle {
  ready: Promise<void>;
  finished: Promise<void>;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionHandle;
};

const getCoverRadius = (x: number, y: number, width: number, height: number) => {
  const farthestX = Math.max(x, width - x);
  const farthestY = Math.max(y, height - y);
  return Math.ceil(Math.hypot(farthestX, farthestY)) + 2;
};

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const transitionRunning = React.useRef(false);

  const toggleThemeWithAnimation = (event: React.MouseEvent<HTMLButtonElement>) => {
    const transitionDocument = document as DocumentWithViewTransition;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (transitionRunning.current) return;

    if (!transitionDocument.startViewTransition || reduceMotion) {
      toggleTheme();
      return;
    }

    // 直接读取本次被点击的按钮，避免多个 ThemeToggle 实例或重排造成坐标漂移。
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const endRadius = getCoverRadius(x, y, viewportWidth, viewportHeight);

    transitionRunning.current = true;
    document.documentElement.classList.add('theme-view-transition');

    try {
      const transition = transitionDocument.startViewTransition(() => {
        toggleTheme();
      });

      void transition.ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 460,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      }).catch(() => {
        // 浏览器可能因页面状态变化跳过 transition；主题切换本身仍然有效。
      });

      void transition.finished.catch(() => undefined).finally(() => {
        transitionRunning.current = false;
        document.documentElement.classList.remove('theme-view-transition');
      });
    } catch {
      transitionRunning.current = false;
      document.documentElement.classList.remove('theme-view-transition');
      toggleTheme();
    }
  };

  return (
    <button
      onClick={toggleThemeWithAnimation}
      type="button"
      aria-label={isDark ? '切换到亮色模式' : '切换到深色模式'}
      aria-pressed={isDark}
      className={`
        relative flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-300
        ${isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-yellow-400' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}
        shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
      `}
      title={isDark ? '切换到亮色模式' : '切换到深色模式'}
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
