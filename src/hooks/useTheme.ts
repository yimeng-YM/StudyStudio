import { create } from 'zustand';
import { useEffect } from 'react';

/**
 * 支持的系统主题类型枚举
 */
type Theme = 'dark' | 'light' | 'system';

/**
 * 主题状态管理的 Store 接口
 */
interface ThemeStore {
  /** 当前生效的主题模式 */
  theme: Theme;
  /** 手动设置主题，并触发 DOM 样式更新及持久化 */
  setTheme: (theme: Theme) => void;
  /** 在暗色和亮色之间进行切换（如果当前为 system，则视为 light 进行切换） */
  toggleTheme: () => void;
}

/**
 * Zustand 创建的内部主题状态 Store
 */
export const useThemeStore = create<ThemeStore>((set) => ({
  theme: (localStorage.getItem('theme') as Theme) || 'light',
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

/**
 * 核心副作用函数：根据传入的主题模式，更新 HTML 根节点的 class
 * 如果配置为 'system'，则会通过 matchMedia 探测操作系统的偏好
 *
 * @param theme - 目标主题模式
 */
const updateDomClass = (theme: Theme) => {
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');

  let resolvedTheme = theme;
  if (theme === 'system') {
    resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  root.classList.add(resolvedTheme);

  // 动态修改开屏动画的背景颜色，与最终生效的主题保持一致，避免因 prefers-color-scheme 差异而闪烁
  const splashScreen = document.getElementById('splash-screen') as HTMLElement | null;
  if (splashScreen) {
    if (resolvedTheme === 'dark') {
      splashScreen.style.backgroundColor = '#09090b';
      const title = splashScreen.querySelector('.splash-title') as HTMLElement | null;
      const subtitle = splashScreen.querySelector('.splash-subtitle') as HTMLElement | null;
      if (title) title.style.color = '#f4f4f5';
      if (subtitle) subtitle.style.color = '#a1a1aa';
    } else {
      splashScreen.style.backgroundColor = '#ffffff';
      const title = splashScreen.querySelector('.splash-title') as HTMLElement | null;
      const subtitle = splashScreen.querySelector('.splash-subtitle') as HTMLElement | null;
      if (title) title.style.color = '#09090b';
      if (subtitle) subtitle.style.color = '#71717a';
    }
  }
};

const initialTheme = (localStorage.getItem('theme') as Theme) || 'light';
updateDomClass(initialTheme);

/**
 * 提供给组件使用的主题 Hook 封装
 * 暴露出响应式的主题状态及修改方法，并自动监听操作系统的主题偏好变化
 *
 * @returns 包含当前主题配置及相关操作函数的对象
 */
export function useTheme() {
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);
  const toggleTheme = useThemeStore(s => s.toggleTheme);
  
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
