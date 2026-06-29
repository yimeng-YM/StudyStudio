import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type SortMode = 'name' | 'lastAccessed' | 'manual';
export type SortDirection = 'asc' | 'desc';

interface SortContextValue {
  sortMode: SortMode;
  sortDirection: SortDirection;
  setSortMode: (mode: SortMode) => void;
  setSortDirection: (dir: SortDirection) => void;
  toggleDirection: () => void;
}

const SortContext = createContext<SortContextValue | null>(null);

const STORAGE_KEY = 'globalSortPreference';

/** 从 localStorage 加载排序偏好，优先读取新键，不存在则从旧键迁移 */
function loadPreference(): { mode: SortMode; direction: SortDirection } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.mode && parsed.direction) return parsed;
    }
    // 尝试从旧的 dashboardSortMode 迁移
    const oldMode = localStorage.getItem('dashboardSortMode') as SortMode | null;
    const oldDir = localStorage.getItem('dashboardSortDirection') as SortDirection | null;
    if (oldMode && oldDir && ['name', 'lastAccessed', 'manual'].includes(oldMode)) {
      return { mode: oldMode, direction: oldDir };
    }
  } catch { /* ignore */ }
  return { mode: 'lastAccessed', direction: 'desc' };
}

/** 清除所有旧的独立排序 localStorage 键 */
function cleanupOldKeys() {
  const oldKeys = [
    'sidebarSortMode', 'sidebarSortDirection',
    'dashboardSortMode', 'dashboardSortDirection',
    'notesSortMode', 'notesSortDirection',
    'quizSortMode', 'quizSortDirection',
  ];
  oldKeys.forEach(k => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
}

/**
 * 全局排序 Provider
 * 在 App 根组件中包裹，使所有子组件共享同一套排序偏好。
 */
export function SortProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState(loadPreference);

  // 持久化到 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  }, [pref]);

  // 挂载时清理旧键（仅执行一次）
  useEffect(() => {
    cleanupOldKeys();
  }, []);

  const setSortMode = useCallback((mode: SortMode) => {
    setPref(prev => prev.mode === mode ? prev : { ...prev, mode });
  }, []);

  const setSortDirection = useCallback((direction: SortDirection) => {
    setPref(prev => prev.direction === direction ? prev : { ...prev, direction });
  }, []);

  const toggleDirection = useCallback(() => {
    setPref(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }));
  }, []);

  return (
    <SortContext.Provider value={{
      sortMode: pref.mode,
      sortDirection: pref.direction,
      setSortMode,
      setSortDirection,
      toggleDirection,
    }}>
      {children}
    </SortContext.Provider>
  );
}

/**
 * 全局排序 Hook
 * 必须在 SortProvider 内部使用。
 * 返回当前排序模式和方向，以及修改它们的方法。
 */
export function useSorting() {
  const ctx = useContext(SortContext);
  if (!ctx) throw new Error('useSorting must be used within SortProvider');
  return ctx;
}

/**
 * 通用客户端排序函数
 * 用于需要先过滤再排序的场景（如按 subjectId + type 过滤实体后排序）。
 * - name 模式：按 name 或 title 字段 localeCompare
 * - lastAccessed 模式：按 lastAccessed 数值
 * - manual 模式：按 order 数值
 * - 二级排序回退：主值相同时按 createdAt 降序
 */
export function sortItems<T extends {
  title?: string;
  name?: string;
  lastAccessed?: number;
  order?: number;
  createdAt: number;
}>(
  items: T[],
  sortMode: SortMode,
  sortDirection: SortDirection,
): T[] {
  return [...items].sort((a, b) => {
    let valA: any, valB: any;

    if (sortMode === 'name') {
      valA = (a.title || a.name || '').toLowerCase();
      valB = (b.title || b.name || '').toLowerCase();
    } else if (sortMode === 'lastAccessed') {
      valA = a.lastAccessed || 0;
      valB = b.lastAccessed || 0;
    } else if (sortMode === 'manual') {
      valA = a.order || 0;
      valB = b.order || 0;
    }

    // 比较主排序值
    if (valA !== undefined && valB !== undefined) {
      if (typeof valA === 'string' && typeof valB === 'string') {
        const cmp = valA.localeCompare(valB);
        if (cmp !== 0) return sortDirection === 'asc' ? cmp : -cmp;
      } else {
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      }
    }

    // 二级排序：按 createdAt 降序（新的在前）
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}
