import { useState, useEffect, useCallback } from 'react';
import { Quote, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { getDailyQuote } from '@/data/dailyQuotes';

interface QuoteData {
  quote: string;
  author: string;
}

const API_URL = 'https://v1.hitokoto.cn/?c=d&c=i&c=k';
const CACHE_KEY = 'daily_quote_cache';

/** 从 localStorage 读取今日缓存 */
function readCache(dateStr: string): QuoteData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached.date === dateStr && cached.quote) {
      return { quote: cached.quote, author: cached.author || '' };
    }
  } catch { /* ignore corrupt cache */ }
  return null;
}

/** 写入今日缓存 */
function writeCache(dateStr: string, data: QuoteData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ date: dateStr, ...data }));
  } catch { /* ignore quota */ }
}

/**
 * 一言组件
 * 优先从 Hitokoto API 获取每日一言，失败时回退到本地名言库
 */
export function DailyQuote() {
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const fetchQuote = useCallback(async (today: string) => {
    // 1) 尝试读取今日缓存
    const cached = readCache(today);
    if (cached) {
      setQuoteData(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data: QuoteData = {
        quote: json.hitokoto || '',
        author: json.from_who || json.from || '',
      };
      writeCache(today, data);
      setQuoteData(data);
    } catch {
      // 2) API 失败，回退到本地名言库
      setQuoteData(getDailyQuote());
    } finally {
      setLoading(false);
    }
  }, []);

  /** 首次挂载时获取，以及跨天时重新获取 */
  useEffect(() => {
    fetchQuote(dateStr);
  }, [dateStr, fetchQuote]);

  /** 每分钟检查是否跨天 */
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setDateStr(prev => prev !== next ? next : prev);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="relative overflow-hidden bg-white/70 dark:bg-zinc-900/50 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-5 md:p-6 min-h-[80px]"
    >
      {/* 背景装饰 */}
      <div className="absolute -right-4 -top-4 text-zinc-100 dark:text-zinc-800">
        <Quote size={80} className="md:w-[100px] md:h-[100px]" />
      </div>

      <div className="relative z-10">
        {/* 标题行 */}
        <div className="flex items-center gap-2 mb-3">
          <Quote size={16} className="text-blue-500" />
          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            一言
          </span>
        </div>

        {loading && !quoteData ? (
          /* 加载骨架 */
          <div className="flex items-center gap-2 text-zinc-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">加载中…</span>
          </div>
        ) : (
          <>
            {/* 名言内容 */}
            <p className="text-base md:text-lg text-zinc-700 dark:text-zinc-300 leading-relaxed italic">
              「{quoteData?.quote}」
            </p>
            {/* 出处 */}
            {quoteData?.author ? (
              <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500 text-right">
                —— {quoteData.author}
              </p>
            ) : null}
          </>
        )}
      </div>
    </motion.div>
  );
}
