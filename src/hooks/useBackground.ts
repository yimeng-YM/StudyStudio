import { useState, useLayoutEffect, useCallback, useEffect } from 'react';
import { useThemeStore } from './useTheme';

/**
 * 自定义网页背景管理
 *
 * 设计思路：
 * 通过 CSS 变量驱动 Layout 中的 `.app-bg-layer` 背景层（见 index.css）：
 * - `--app-bg-color`：底色（纯色模式或主题默认白/黑）
 * - `--app-bg-image`：图片地址（`url("...")` 或 `none`）
 * - `--app-bg-blur`：图片模糊度（px）
 * - `--app-bg-overlay-alpha`：遮罩透明度（0–1，遮罩色随亮/暗主题自动取白/黑）
 *
 * 模块加载时即应用持久化配置，避免首屏闪烁。
 */

/** localStorage 存储键 */
const STORAGE_KEY = 'studyStudio_appBackground_v1';

export type BackgroundMode = 'none' | 'color' | 'image';

export interface BackgroundConfig {
  /** 背景模式 */
  mode: BackgroundMode;
  /** 纯色模式颜色（hex） */
  color: string;
  /** 图片模式 URL */
  imageUrl: string;
  /** 图片模糊度 (px)，0 表示不模糊 */
  blur: number;
  /** 遮罩透明度 (0–100)，用于增强内容可读性 */
  overlay: number;
}

/** 默认配置 */
export const DEFAULT_BACKGROUND: BackgroundConfig = {
  mode: 'none',
  color: '#dbeafe',
  imageUrl: '',
  blur: 0,
  overlay: 30,
};

/** 纯色模式预设色板 */
export const BACKGROUND_COLOR_PRESETS: readonly string[] = [
  '#dbeafe', // 浅蓝
  '#dcfce7', // 浅绿
  '#fce7f3', // 浅粉
  '#fef3c7', // 浅黄
  '#ede9fe', // 浅紫
  '#e0e7ff', // 浅靛
  '#ccfbf1', // 浅青
  '#f1f5f9', // 浅灰
  '#1e293b', // 深蓝灰
  '#0f172a', // 深夜
  '#000000', // 纯黑
];

/** 从 localStorage 读取背景配置，合并默认值以兼容字段增补 */
function loadBackground(): BackgroundConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_BACKGROUND, ...(JSON.parse(raw) as Partial<BackgroundConfig>) };
  } catch { /* ignore */ }
  return DEFAULT_BACKGROUND;
}

/** 将图片 URL 转义后包裹为合法的 CSS url() 值 */
function toCssUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return 'none';
  // 仅做最小限度的引号转义，避免破坏 CSS 语法
  const escaped = trimmed.replace(/"/g, '\\"');
  return `url("${escaped}")`;
}

/** 解析 hex 颜色 (#RRGGBB) 为 [r, g, b]（0-255），非法格式返回 null */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** WCAG 2.1 相对亮度：0 为最暗（纯黑），1 为最亮（纯白） */
function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 根据配置写入 <html> 的背景相关 CSS 变量 */
function applyBackground(cfg: BackgroundConfig): void {
  const root = document.documentElement;

  if (cfg.mode === 'color') {
    root.style.setProperty('--app-bg-color', cfg.color);
    root.style.setProperty('--app-bg-image', 'none');
    root.style.setProperty('--app-bg-blur', '0px');
    root.style.setProperty('--app-bg-overlay-alpha', '0');
    root.setAttribute('data-bg', 'color');

    // 根据背景亮度自动切换主题，确保文字可读
    const lum = relativeLuminance(cfg.color);
    if (lum !== null) {
      const store = useThemeStore.getState();
      // 比较 DOM 上实际生效的 class（已处理 system → light/dark 解析），而非 store 中的原始值
      if (lum >= 0.5 && root.classList.contains('dark')) {
        store.setTheme('light');
      } else if (lum <= 0.3 && root.classList.contains('light')) {
        store.setTheme('dark');
      }
      // 0.3 < lum < 0.5：中等亮度，保持当前主题不变
    }
  } else if (cfg.mode === 'image' && cfg.imageUrl.trim()) {
    // 图片模式下沿用主题默认底色，以便图片加载失败时仍有兜底背景
    root.style.removeProperty('--app-bg-color');
    root.style.setProperty('--app-bg-image', toCssUrl(cfg.imageUrl));
    root.style.setProperty('--app-bg-blur', `${cfg.blur}px`);
    root.style.setProperty('--app-bg-overlay-alpha', String(cfg.overlay / 100));
    root.setAttribute('data-bg', 'image');
  } else {
    // none：恢复主题默认（清除内联覆盖，让 :root/.dark 的默认值生效）
    root.style.removeProperty('--app-bg-color');
    root.style.removeProperty('--app-bg-image');
    root.style.removeProperty('--app-bg-blur');
    root.style.setProperty('--app-bg-overlay-alpha', '0');
    root.setAttribute('data-bg', 'none');
  }
}

// 模块加载时立即应用，避免首屏背景闪烁
applyBackground(loadBackground());

/** 监听主题切换：若纯色背景亮度与当前主题冲突则自动重置背景，确保文字可读 */
useThemeStore.subscribe((state, prevState) => {
  if (state.theme === prevState.theme) return;
  const cfg = loadBackground();
  if (cfg.mode !== 'color') return;
  const lum = relativeLuminance(cfg.color);
  if (lum === null) return;

  const root = document.documentElement;
  const isLightBg = lum >= 0.5;
  const isDarkBg = lum <= 0.3;
  const isDarkTheme = root.classList.contains('dark');

  if ((isLightBg && isDarkTheme) || (isDarkBg && !isDarkTheme)) {
    applyBackground(DEFAULT_BACKGROUND);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_BACKGROUND));
    window.dispatchEvent(new CustomEvent('studystudio-bg-reset'));
  }
});

/**
 * 自定义网页背景管理 Hook（仅在 Settings 页面使用，确保全局单一 React 状态）。
 * @returns 当前背景配置与更新方法
 */
export function useBackground() {
  const [background, setBackgroundState] = useState(loadBackground);

  useLayoutEffect(() => {
    applyBackground(background);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 响应模块级 subscriber 因主题冲突而触发的背景重置，保持 React 状态同步
  useEffect(() => {
    const handler = () => setBackgroundState(DEFAULT_BACKGROUND);
    window.addEventListener('studystudio-bg-reset', handler);
    return () => window.removeEventListener('studystudio-bg-reset', handler);
  }, []);

  /** 更新背景配置，立即写入 DOM 并持久化 */
  const setBackground = useCallback((cfg: BackgroundConfig) => {
    // 先持久化，再应用到 DOM：避免 applyBackground 内触发的主题切换
    // 导致 subscriber 从 localStorage 读到旧配置而误判冲突重置
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    applyBackground(cfg);
    setBackgroundState(cfg);
  }, []);

  return { background, setBackground };
}
