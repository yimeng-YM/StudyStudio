import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import React from 'react';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const toggleThemeWithAnimation = () => {
    // 降级处理：不支持 View Transition API 则直接切换
    // @ts-ignore - View Transition API 是实验性 API
    if (!document.startViewTransition) {
      toggleTheme();
      return;
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      toggleTheme();
      return;
    }

    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const endRadius = Math.hypot(window.innerWidth, window.innerHeight);

    // 先让按钮立即反馈（避免点击无响应感），再在下一帧启动快照
    requestAnimationFrame(() => {
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
            duration: 300,
            easing: "ease-in-out",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      });
    });
  };

  return (
    <button
      ref={buttonRef}
      onClick={toggleThemeWithAnimation}
      className={`
        relative flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-300
        ${isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-yellow-400' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}
        shadow-sm focus:outline-none
      `}
      title={isDark ? '切换到亮色模式' : '切换到深色模式'}
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
