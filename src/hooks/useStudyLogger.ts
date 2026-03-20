import { useEffect, useRef } from 'react';
import { db } from '@/db';

export function useStudyLogger() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const logStudyTime = async () => {
      // 只在页面可见时记录时间
      if (document.visibilityState !== 'visible') {
        return;
      }

      const today = new Date();
      // Format as YYYY-MM-DD local time
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
        // Record study time every minute
        intervalRef.current = setInterval(logStudyTime, 60000); // 1 minute
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

    // 初始检查页面可见性
    if (document.visibilityState === 'visible') {
      startInterval();
    }

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
