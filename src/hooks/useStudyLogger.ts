import { useEffect, useRef } from 'react';
import { db } from '@/db';

/**
 * 学习时长日志记录 Hook
 * 用于监控并统计用户的有效学习时间。利用页面可见性 API (Page Visibility API)
 * 确保只有在用户当前浏览该页面时才累加学习时长。数据会被持久化到 IndexedDB。
 */
export function useStudyLogger() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const logStudyTime = async () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const today = new Date();
      const dateStr = today.getFullYear() + '-' +
                      String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(today.getDate()).padStart(2, '0');
      
      try {
        await db.transaction('rw', db.studyRecords, async () => {
          const record = await db.studyRecords.get(dateStr);
          if (record) {
            await db.studyRecords.update(dateStr, {
              duration: record.duration + 1,
              lastActive: Date.now()
            });
          } else {
            await db.studyRecords.add({
              date: dateStr,
              duration: 1,
              lastActive: Date.now()
            });
          }
        });
      } catch (err) {
        console.error('Failed to log study time:', err);
      }
    };

    const startInterval = () => {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(logStudyTime, 60000);
      }
    };

    const stopInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startInterval();
      } else {
        stopInterval();
      }
    };

    if (document.visibilityState === 'visible') {
      startInterval();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
