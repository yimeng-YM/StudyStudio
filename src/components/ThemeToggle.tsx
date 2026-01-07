import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

import React from 'react';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const toggleThemeWithAnimation = () => {
    // @ts-ignore - View Transition API is experimental in some environments
    if (!document.startViewTransition) {
      toggleTheme();
      return;
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      toggleTheme();
      return;
    }

    const x = rect.left + rect.width / 2 + 50;
    const y = rect.top + rect.height / 2 + 200;

    // Use a much larger radius to ensure complete coverage regardless of screen shape/size
    const endRadius = Math.hypot(window.innerWidth, window.innerHeight) * 1.2;

    // @ts-ignore
    const transition = document.startViewTransition(() => {
      toggleTheme();
    });

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];

      document.documentElement.animate(
        {
          clipPath: clipPath,
        },
        {
          duration: 1000,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });
  };

  return (
    <button
      ref={buttonRef}
      onClick={toggleThemeWithAnimation}
      className={`
        relative flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-300
        ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-yellow-400' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}
        shadow-sm focus:outline-none
      `}
      title={isDark ? '切换到亮色模式' : '切换到深色模式'}
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}

