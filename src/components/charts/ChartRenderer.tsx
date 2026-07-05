import { useEffect, useRef, useState, memo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { AlertTriangle } from 'lucide-react';

/**
 * 简化图表配置 DSL：AI 可直接输出此 JSON 结构。
 *
 * 支持两种模式：
 * 1. **简化模式** — 设置 type + xAxis + series，自动生成 ECharts option。
 * 2. **高级模式** — 设置 option 字段，直接透传 ECharts 完整配置。
 *
 * @example 简化模式（柱状图）
 * ```json
 * { "type": "bar", "title": "学习时长", "xAxis": ["周一","周二","周三"],
 *   "series": [{"name":"小时","data":[2,3,1.5]}] }
 * ```
 *
 * @example 高级模式
 * ```json
 * { "option": { "xAxis": {...}, "yAxis": {...}, "series": [...] } }
 * ```
 */
interface ChartConfig {
  /** 图表类型：bar / line / pie / scatter / area / radar / funnel */
  type?: string;
  /** 图表标题 */
  title?: string;
  /** 容器宽度 (CSS)，默认 100% */
  width?: string;
  /** 容器高度 (px)，默认 400 */
  height?: number;
  /** X 轴数据（简化模式） */
  xAxis?: string[] | { data: string[]; name?: string };
  /** 系列数据（简化模式） */
  series?: Array<{
    name?: string;
    data: (number | string | null)[];
    /** 饼图专用：{ name, value } 数组 */
    type?: string;
  }>;
  /** 配色方案名，默认 "default" */
  palette?: string;
  /** 高级模式：直接透传 ECharts option，优先级最高 */
  option?: Record<string, unknown>;
}

/** 内置配色方案 */
const PALETTES: Record<string, string[]> = {
  default: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'],
  warm: ['#e74c3c', '#f39c12', '#e67e22', '#1abc9c', '#3498db', '#9b59b6', '#2ecc71', '#f1c40f', '#e91e63'],
  cool: ['#3498db', '#1abc9c', '#2ecc71', '#9b59b6', '#34495e', '#16a085', '#27ae60', '#2980b9', '#8e44ad'],
  pastel: ['#fab1a0', '#a29bfe', '#81ecec', '#ffeaa7', '#55efc4', '#fd79a8', '#74b9ff', '#dfe6e9', '#00cec9'],
  dark: ['#dd6b66', '#759aa0', '#e69d87', '#8dc1a9', '#ea7e53', '#eedd78', '#73a373', '#73b9bc', '#7289ab'],
};

/**
 * 将简化 ChartConfig 翻译为 ECharts option。
 */
function buildEChartsOption(config: ChartConfig, isDark: boolean): Record<string, unknown> {
  // 高级模式：直接透传
  if (config.option) return config.option;

  const colors = PALETTES[config.palette || 'default'] || PALETTES.default;
  const textColor = isDark ? '#cdd6f4' : '#333';
  const chartType = config.type || 'bar';

  // 解析 xAxis
  let xData: string[] = [];
  let xName = '';
  if (Array.isArray(config.xAxis)) {
    xData = config.xAxis as string[];
  } else if (config.xAxis && typeof config.xAxis === 'object') {
    xData = (config.xAxis as { data: string[]; name?: string }).data || [];
    xName = (config.xAxis as { data: string[]; name?: string }).name || '';
  }

  // 解析 series
  const series: Record<string, unknown>[] = [];
  const legendData: string[] = [];
  const yAxisNames: string[] = [];

  for (const s of config.series || []) {
    const sType = chartType === 'area' ? 'line' : chartType;
    const seriesItem: Record<string, unknown> = {
      name: s.name || '',
      type: sType,
      data: s.data || [],
    };

    if (chartType === 'area') {
      seriesItem.areaStyle = {};
    }

    if (chartType === 'pie') {
      // 饼图：data 为 [{ name, value }]
      seriesItem.data = s.data;
      // 如果 data 是简单数值数组，转为 { name, value } 对象
      if (s.data.length > 0 && typeof s.data[0] === 'number') {
        seriesItem.data = (s.data as number[]).map((v, i) => {
          const name = xData[i] || `项目${i + 1}`;
          return { name, value: v };
        });
      }
    }

    series.push(seriesItem);
    if (s.name) legendData.push(s.name);
    if (s.name && chartType !== 'pie') yAxisNames.push(s.name);
  }

  // pie chart doesn't need xAxis/yAxis in the same way
  if (chartType === 'pie') {
    return {
      color: colors,
      title: config.title ? {
        text: config.title,
        left: 'center',
        textStyle: { color: textColor, fontSize: 14 },
      } : undefined,
      tooltip: { trigger: 'item' },
      legend: legendData.length > 0
        ? { bottom: 0, textStyle: { color: textColor, fontSize: 11 } }
        : undefined,
      series,
      backgroundColor: 'transparent',
    };
  }

  // 笛卡尔坐标系图表
  const baseOption: Record<string, unknown> = {
    color: colors,
    backgroundColor: 'transparent',
    title: config.title ? {
      text: config.title,
      left: 'center',
      textStyle: { color: textColor, fontSize: 14 },
    } : undefined,
    tooltip: { trigger: 'axis' },
    legend: legendData.length > 0
      ? { bottom: 0, textStyle: { color: textColor, fontSize: 11 } }
      : undefined,
    grid: {
      left: '3%',
      right: '4%',
      bottom: legendData.length > 0 ? '12%' : '3%',
      top: config.title ? '16%' : '4%',
      containLabel: true,
    },
    xAxis: {
      type: 'category' as const,
      data: xData,
      name: xName || undefined,
      axisLabel: { color: textColor, fontSize: 11 },
      axisLine: { lineStyle: { color: isDark ? '#444' : '#ccc' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: textColor, fontSize: 11 },
      splitLine: { lineStyle: { color: isDark ? '#333' : '#eee' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series,
  };

  // 雷达图特殊处理
  if (chartType === 'radar') {
    baseOption.radar = {
      indicator: xData.map((name) => ({
        name,
        max: Math.max(...(config.series?.flatMap(s => s.data as number[]) || [0])) * 1.2 || 100,
      })),
      axisName: { color: textColor, fontSize: 11 },
      splitArea: { areaStyle: { color: isDark ? ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.05)'] : ['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.04)'] } },
    };
    // Remove xAxis/yAxis for radar
    delete baseOption.xAxis;
    delete baseOption.yAxis;
    if (baseOption.grid) delete baseOption.grid;
  }

  // 漏斗图
  if (chartType === 'funnel') {
    delete baseOption.xAxis;
    delete baseOption.yAxis;
    if (baseOption.grid) delete baseOption.grid;
    baseOption.tooltip = { trigger: 'item', formatter: '{b}: {c}' };
  }

  return baseOption;
}

/**
 * ECharts 图表渲染组件。
 *
 * 支持简化 DSL 与完整 ECharts option 两种输入模式，
 * 自动响应深色/浅色主题切换，内置窗口 resize 监听。
 */
const ChartRenderer = memo(function ChartRenderer({ config }: { config: ChartConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  // 检测主题
  useEffect(() => {
    const checkDark = () => {
      if (theme === 'dark') { setIsDark(true); return; }
      if (theme === 'light') { setIsDark(false); return; }
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    };
    checkDark();
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  // 主渲染逻辑
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const echartsModule = await import('echarts');
        const echarts = (echartsModule as any).default || echartsModule;
        if (cancelled || !containerRef.current) return;

        const option = buildEChartsOption(config, isDark);

        // 销毁旧实例
        if (chartRef.current) {
          chartRef.current.dispose();
          chartRef.current = null;
        }

        const instance = echarts.init(containerRef.current, undefined, {
          renderer: 'canvas',
        });
        chartRef.current = instance;
        instance.setOption(option, true);
        setError(null);
      } catch (e: any) {
        if (!cancelled) {
          console.error('Chart render error:', e);
          setError(e.message || '图表渲染失败');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config, isDark]);

  // Resize 监听
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // 组件卸载时销毁
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, []);

  const h = config.height || 400;
  const w = config.width || '100%';

  if (error) {
    return (
      <div className="flex items-start gap-2 p-4 my-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold mb-1">图表渲染失败</div>
          <div className="text-xs font-mono whitespace-pre-wrap">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden"
      style={{ width: w, height: h, minHeight: 200 }}
    />
  );
});

export default ChartRenderer;
export type { ChartConfig };
