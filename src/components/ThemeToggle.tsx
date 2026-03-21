import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import React from 'react';

/**
 * 主题切换按钮组件
 * 
 * 核心功能：
 * 1. 状态展示：根据当前系统或手动设置的主题显示太阳（亮色）或月亮（深色）图标。
 * 2. 动画过渡：集成了实验性的 View Transition API 实现平滑的圆形扩散切换动画。
 *    - 如果浏览器支持 View Transition API，切换时会从按钮位置开始产生一个圆形的遮罩动画。
 *    - 如果不支持，则直接进行无动画的主题切换。
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const buttonRef = React.useRef<HTMLButtonElement>(null);

  /**
   * 带动画效果的主题切换函数
   */
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

    // 计算动画圆心的坐标
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // 计算扩散圆的最大半径，确保覆盖整个视口
    const endRadius = Math.hypot(window.innerWidth, window.innerHeight);

    // 启动视图转换动画
    // @ts-ignore
    const transition = document.startViewTransition(() => {
      toggleTheme();
    });

    // 动画就绪后，执行自定义的 clip-path 动画
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
          duration: 500, // 动画持续时间
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
        ${isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-yellow-400' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}
        shadow-sm focus:outline-none
      `}
      title={isDark ? '切换到亮色模式' : '切换到深色模式'}
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
