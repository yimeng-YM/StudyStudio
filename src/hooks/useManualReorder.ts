import { useCallback } from 'react';
import type { Table } from 'dexie';
import { db } from '@/db';

/**
 * 可重新排序的条目约束
 */
interface Reorderable {
  id: string;
  order?: number;
}

/**
 * 手动排序 Hook
 * 通过交换相邻条目的 order 字段实现位置互换，在 db.transaction 中原子执行。
 *
 * @param items - 当前排序后的条目列表
 * @param table - Dexie 表实例（db.subjects 或 db.entities）
 *
 * @example
 * const { moveItem } = useManualReorder(subjects, db.subjects);
 * moveItem(subject.id, 'up');
 */
export function useManualReorder<T extends Reorderable>(
  items: T[] | undefined,
  table: Table<T>,
) {
  const moveItem = useCallback(async (id: string, direction: 'up' | 'down') => {
    if (!items) return;
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const current = items[index];
    const target = items[targetIndex];

    await db.transaction('rw', table, async () => {
      await table.update(current.id, { order: target.order } as any);
      await table.update(target.id, { order: current.order } as any);
    });
  }, [items, table]);

  return { moveItem };
}
