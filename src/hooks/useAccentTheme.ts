import { useState, useLayoutEffect, useCallback } from 'react';

/**
 * 主题配色（强调色）管理
 *
 * 设计思路：
 * 应用全局以 Tailwind 的 `blue` 作为统一强调色（按钮、选中态、图标等）。
 * 本 hook 将 `blue` 调色板重映射为 CSS 变量（见 index.css 与 tailwind.config.js），
 * 切换配色时仅需覆盖这些变量即可实现全应用换肤。
 * 默认 "经典蓝" 与 Tailwind 原生 blue 字节级一致，零视觉回归。
 */

/** localStorage 存储键 */
const STORAGE_KEY = 'studyStudio_accentTheme_v1';

/** 默认配色 ID */
const DEFAULT_ID = 'blue';

/** 配色档位键（50–950） */
const PALETTE_KEYS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;
type PaletteKey = (typeof PALETTE_KEYS)[number];

/** 单个配色的 11 档调色板，值为空格分隔的 RGB 三元组（配合 Tailwind 的 <alpha-value>） */
export type AccentPalette = Record<PaletteKey, string>;

export interface AccentTheme {
  id: string;
  /** 展示名称 */
  name: string;
  /** UI 色板预览色（hex） */
  swatch: string;
  palette: AccentPalette;
}

/**
 * 内置配色方案 —— 直接采用 Tailwind 官方调色板的精确 RGB 值，
 * 保证各配色之间亮度梯度一致、观感统一。
 */
export const ACCENT_THEMES: readonly AccentTheme[] = [
  {
    id: 'blue',
    name: '经典蓝',
    swatch: '#3b82f6',
    palette: {
      '50': '239 246 255', '100': '219 234 254', '200': '191 219 254',
      '300': '147 197 253', '400': '96 165 250', '500': '59 130 246',
      '600': '37 99 235', '700': '29 78 216', '800': '30 64 175',
      '900': '30 58 138', '950': '23 37 84',
    },
  },
  {
    id: 'pink',
    name: '樱花粉',
    swatch: '#fedfe1',
    palette: {
      '50': '253 242 243', '100': '254 223 225', '200': '248 206 211',
      '300': '239 179 189', '400': '224 138 155', '500': '210 106 130',
      '600': '200 65 99', '700': '171 54 85', '800': '138 51 76',
      '900': '107 46 64', '950': '82 40 54',
    },
  },
  {
    id: 'indigo',
    name: '靛蓝',
    swatch: '#6366f1',
    palette: {
      '50': '238 242 255', '100': '224 231 255', '200': '199 210 254',
      '300': '165 180 252', '400': '129 140 248', '500': '99 102 241',
      '600': '79 70 229', '700': '67 56 202', '800': '55 48 163',
      '900': '49 46 129', '950': '30 27 75',
    },
  },
  {
    id: 'violet',
    name: '紫罗兰',
    swatch: '#8b5cf6',
    palette: {
      '50': '245 243 255', '100': '237 233 254', '200': '221 214 254',
      '300': '196 181 253', '400': '167 139 250', '500': '139 92 246',
      '600': '124 58 237', '700': '109 40 217', '800': '91 33 182',
      '900': '76 29 149', '950': '46 16 101',
    },
  },
  {
    id: 'emerald',
    name: '翠绿',
    swatch: '#10b981',
    palette: {
      '50': '236 253 245', '100': '209 250 229', '200': '167 243 208',
      '300': '110 231 183', '400': '52 211 153', '500': '16 185 129',
      '600': '5 150 105', '700': '4 120 87', '800': '6 95 70',
      '900': '6 78 59', '950': '2 44 34',
    },
  },
  {
    id: 'teal',
    name: '青碧',
    swatch: '#14b8a6',
    palette: {
      '50': '240 253 250', '100': '204 251 241', '200': '153 246 228',
      '300': '94 234 212', '400': '45 212 191', '500': '20 184 166',
      '600': '13 148 136', '700': '15 118 110', '800': '17 94 89',
      '900': '19 78 74', '950': '4 47 46',
    },
  },
  {
    id: 'rose',
    name: '玫红',
    swatch: '#f43f5e',
    palette: {
      '50': '255 241 242', '100': '255 228 230', '200': '254 205 211',
      '300': '253 164 175', '400': '251 113 133', '500': '244 63 94',
      '600': '225 29 72', '700': '190 18 60', '800': '159 18 57',
      '900': '136 19 55', '950': '76 5 25',
    },
  },
  {
    id: 'orange',
    name: '暖橙',
    swatch: '#f97316',
    palette: {
      '50': '255 247 237', '100': '255 237 213', '200': '254 215 170',
      '300': '253 186 116', '400': '251 146 60', '500': '249 115 22',
      '600': '234 88 12', '700': '194 65 12', '800': '154 52 18',
      '900': '124 45 18', '950': '67 20 7',
    },
  },
] as const;

/** 从 localStorage 读取配色 ID，非法值回退默认 */
function loadAccent(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && ACCENT_THEMES.some(t => t.id === v)) return v;
  } catch { /* ignore */ }
  return DEFAULT_ID;
}

/** 将配色档位写入 <html> 的 `--blue-*` CSS 变量，并标记 data-accent */
function applyAccent(id: string): void {
  const theme = ACCENT_THEMES.find(t => t.id === id) ?? ACCENT_THEMES[0];
  const root = document.documentElement;
  PALETTE_KEYS.forEach(k => {
    root.style.setProperty(`--blue-${k}`, theme.palette[k]);
  });
  root.setAttribute('data-accent', theme.id);
}

// 模块加载时立即应用，避免首屏强调色闪烁（App 静态导入 Settings，故此模块随启动加载）
applyAccent(loadAccent());

/**
 * 主题配色管理 Hook（仅在 Settings 页面使用，确保全局单一 React 状态）。
 * @returns 当前配色 ID 与更新方法
 */
export function useAccentTheme() {
  const [accent, setAccentState] = useState(loadAccent);

  // 挂载时同步一次 DOM（StrictMode 下幂等）
  useLayoutEffect(() => {
    applyAccent(accent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 切换强调色主题，立即写入 DOM 并持久化 */
  const setAccent = useCallback((id: string) => {
    applyAccent(id);
    localStorage.setItem(STORAGE_KEY, id);
    setAccentState(id);
  }, []);

  return { accent, setAccent };
}
