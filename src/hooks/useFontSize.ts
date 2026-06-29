import { useState, useLayoutEffect, useCallback } from 'react';

/**
 * 全局字体大小配置常量
 */
export const APP_FONT_OPTIONS = [11, 12, 13, 14, 15, 16] as const;
export const DEFAULT_APP_FONT = 14;

// 兼容旧版存储键
const LEGACY_CONTENT_KEY = 'studyStudio_contentFontSize_v2';
const LEGACY_DIALOG_KEY = 'studyStudio_dialogFontSize_v2';
const LEGACY_MERGED_KEY = 'studyStudio_fontSize';
const STORAGE_KEY = 'studyStudio_appFontSize_v3';

/** CSS 变量名 */
const CSS_VAR = '--app-font-size';

/** 从 localStorage 加载字体大小，向后兼容旧版 key */
function loadFontSize(): number {
  // v3 独立键
  const v3 = localStorage.getItem(STORAGE_KEY);
  if (v3 !== null) {
    const n = Number(v3);
    if (APP_FONT_OPTIONS.includes(n as any)) return n;
  }
  // 回退 v2 对话框键（对话框字体 → 全局字体）
  const v2 = localStorage.getItem(LEGACY_DIALOG_KEY);
  if (v2 !== null) {
    const n = Number(v2);
    if (APP_FONT_OPTIONS.includes(n as any)) return n;
  }
  // 回退 v2 内容键
  const v2c = localStorage.getItem(LEGACY_CONTENT_KEY);
  if (v2c !== null) {
    const n = Number(v2c);
    if (APP_FONT_OPTIONS.includes(n as any)) return n;
  }
  // 回退 v1 合并对象
  try {
    const raw = localStorage.getItem(LEGACY_MERGED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (APP_FONT_OPTIONS.includes(parsed.dialogFontSize)) {
        return parsed.dialogFontSize;
      }
      if (APP_FONT_OPTIONS.includes(parsed.contentFontSize)) {
        return parsed.contentFontSize;
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_APP_FONT;
}

/** 写入全局字体 CSS 变量到 `<html>` */
function applyFont(size: number) {
  document.documentElement.style.setProperty(CSS_VAR, `${size}px`);
}

/**
 * 一次性初始化：从 localStorage 读取字体设置并写入 CSS 变量。
 * 在 App 根组件挂载时调用，确保 CSS 变量在任何组件渲染前就绪。
 * 此函数不创建 React 状态，仅做 DOM 写入。
 */
export function initFontSize() {
  applyFont(loadFontSize());
}

/**
 * 全局字体大小管理 Hook
 *
 * 单一字体大小同时应用于网页内容和对话框，由统一的 useState / localStorage key 管理。
 * **此 hook 仅应在 Settings 页面中使用**，确保全局只有一份 React 状态。
 * App 根组件应使用 initFontSize() 做一次性 CSS 变量初始化。
 *
 * @returns 当前字体配置和更新方法
 */
export function useFontSize() {
  const [fontSize, setFontSizeState] = useState(loadFontSize);

  // 挂载时将值写入 DOM
  useLayoutEffect(() => {
    applyFont(fontSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 更新全局字体大小 */
  const setFontSize = useCallback((size: number) => {
    applyFont(size);
    localStorage.setItem(STORAGE_KEY, String(size));
    setFontSizeState(size);
  }, []);

  return { fontSize, setFontSize };
}

// 向后兼容旧导出（v2 → v3 迁移期间）
/** @deprecated 使用 APP_FONT_OPTIONS */
export const CONTENT_FONT_OPTIONS = APP_FONT_OPTIONS;
/** @deprecated 使用 APP_FONT_OPTIONS */
export const DIALOG_FONT_OPTIONS = APP_FONT_OPTIONS;
/** @deprecated 使用 DEFAULT_APP_FONT */
export const DEFAULT_CONTENT_FONT = DEFAULT_APP_FONT;
/** @deprecated 使用 DEFAULT_APP_FONT */
export const DEFAULT_DIALOG_FONT = DEFAULT_APP_FONT;
