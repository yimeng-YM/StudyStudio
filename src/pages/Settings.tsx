import { useState, useMemo, useEffect } from 'react';
import { DataManager, StudyStudioData } from '@/services/dataManager';
import { useDialog } from '@/components/ui/DialogProvider';
import { Upload, Download, ChevronRight, ChevronDown, Folder, FileText, Database, GitBranch, Check, Type, HardDrive, Palette, ImageIcon, X, Link2, Server, SlidersHorizontal } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { db } from '@/db';
import { cn } from '@/lib/utils';
import { useFontSize, APP_FONT_OPTIONS } from '@/hooks/useFontSize';
import { FontSizeSlider } from '@/components/ui/FontSizeSlider';
import { SegmentSlider } from '@/components/ui/SegmentSlider';
import { useAccentTheme, ACCENT_THEMES } from '@/hooks/useAccentTheme';
import { useBackground, DEFAULT_BACKGROUND, BACKGROUND_COLOR_PRESETS } from '@/hooks/useBackground';
import type { BackgroundConfig, BackgroundMode } from '@/hooks/useBackground';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ProviderSettings } from '@/components/settings/ProviderSettings';
import { AdvancedSettings } from '@/components/settings/AdvancedSettings';

/**
 * 将本地图片文件缩放后转为 Data URL，便于持久化到 localStorage。
 * 超过 maxDim 的图片按比例缩小，并以 JPEG 压缩，避免存储配额溢出。
 */
async function fileToScaledDataUrl(file: File, maxDim = 1920, quality = 0.85): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('图片解码失败'));
    i.src = raw;
  });

  let width = img.naturalWidth;
  let height = img.naturalHeight;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw; // 降级：返回原图 Data URL
  ctx.drawImage(img, 0, 0, width, height);
  try {
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return raw;
  }
}

/**
 * 数据选择树组件
 * 用于在导入/导出时以树状结构展示并选择学科及其关联的实体数据（思维导图、题库、笔记等）。
 */
function DataSelectionTree({
  data,
  selectedSubjectIds,
  selectedEntityIds,
  onToggleSubject,
  onToggleEntity
}: {
  data: { subjects: any[], entities: any[] },
  selectedSubjectIds: Set<string>,
  selectedEntityIds: Set<string>,
  onToggleSubject: (id: string, entityIds: string[], checked: boolean) => void,
  onToggleEntity: (id: string, subjectId: string, checked: boolean) => void
}) {
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedSubjectIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedSubjectIds(newSet);
  };

  const toggleTypeExpand = (key: string) => {
    const newSet = new Set(expandedTypes);
    if (newSet.has(key)) newSet.delete(key);
    else newSet.add(key);
    setExpandedTypes(newSet);
  };

  const entitiesBySubject = useMemo(() => {
    const map = new Map<string, any[]>();
    data.entities.forEach(e => {
      if (!map.has(e.subjectId)) map.set(e.subjectId, []);
      map.get(e.subjectId)?.push(e);
    });
    return map;
  }, [data.entities]);

  const groupEntitiesByType = (entities: any[]) => {
    const groups: Record<string, any[]> = {
      mindmap: [],
      quiz_bank: [],
      note: [],
      task_board: []
    };
    entities.forEach(e => {
      if (groups[e.type]) groups[e.type].push(e);
      else {
        if (!groups['other']) groups['other'] = [];
        groups['other'].push(e);
      }
    });
    return groups;
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'mindmap': return <GitBranch size={14} className="text-purple-500" />;
      case 'quiz_bank': return <Database size={14} className="text-blue-500" />;
      case 'note': return <FileText size={14} className="text-slate-500" />;
      default: return <FileText size={14} className="text-slate-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'mindmap': return '思维导图';
      case 'quiz_bank': return '题库';
      case 'note': return '详细知识';
      case 'task_board': return '任务清单';
      default: return '其他';
    }
  };

  return (
    <div className="space-y-1 max-h-[60vh] overflow-y-auto border border-zinc-200 dark:border-zinc-700 p-2 rounded-lg bg-white dark:bg-zinc-950">
      {data.subjects.length === 0 ? (
        <p className="text-center text-zinc-400 py-4">暂无数据</p>
      ) : (
        data.subjects.map(subject => {
          const entities = entitiesBySubject.get(subject.id) || [];
          const isExpanded = expandedSubjectIds.has(subject.id);
          const isSelected = selectedSubjectIds.has(subject.id);
          const hasEntities = entities.length > 0;
          const groupedEntities = groupEntitiesByType(entities);

          return (
            <div key={subject.id} className="select-none">
              <div className="flex items-center gap-1 p-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded">
                <button
                  onClick={() => hasEntities && toggleExpand(subject.id)}
                  className={cn("p-1 text-zinc-400 hover:text-zinc-600 transition-colors", !hasEntities && "invisible")}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onToggleSubject(subject.id, entities.map(e => e.id), e.target.checked)}
                    className="rounded border-zinc-300 w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <Folder size={16} className="text-yellow-500" />
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{subject.name}</span>
                  <span className="text-xs text-zinc-400">({entities.length})</span>
                </label>
              </div>

              {isExpanded && hasEntities && (
                <div className="ml-8 space-y-1 border-l border-zinc-200 dark:border-zinc-800 pl-2 py-1">
                  {Object.entries(groupedEntities).map(([type, items]) => {
                    if (items.length === 0) return null;
                    const groupKey = `${subject.id}-${type}`;
                    const isTypeExpanded = expandedTypes.has(groupKey);

                    const allSelected = items.every(i => selectedEntityIds.has(i.id));
                    const someSelected = items.some(i => selectedEntityIds.has(i.id));

                    return (
                      <div key={type}>
                        <div className="flex items-center gap-1 p-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded">
                           <button
                            onClick={() => toggleTypeExpand(groupKey)}
                            className="p-1 text-zinc-400 hover:text-zinc-600 transition-colors"
                          >
                            {isTypeExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </button>
                          <label className="flex items-center gap-2 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={input => {
                                if (input) input.indeterminate = someSelected && !allSelected;
                              }}
                              onChange={(e) => {
                                items.forEach(i => onToggleEntity(i.id, subject.id, e.target.checked));
                              }}
                              className="rounded border-zinc-300 w-3.5 h-3.5 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{getTypeLabel(type)}</span>
                            <span className="text-[10px] text-zinc-400">({items.length})</span>
                          </label>
                        </div>

                        {isTypeExpanded && (
                          <div className="ml-6 space-y-0.5 border-l border-zinc-200 dark:border-zinc-800 pl-2 py-1">
                            {items.map(entity => (
                              <label key={entity.id} className="flex items-center gap-2 p-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedEntityIds.has(entity.id)}
                                  onChange={(e) => onToggleEntity(entity.id, subject.id, e.target.checked)}
                                  className="rounded border-zinc-300 w-3 h-3 text-blue-600 focus:ring-blue-500"
                                />
                                {getEntityIcon(entity.type)}
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{entity.title || '无标题'}</div>
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/** 设置分页定义 */
const PAGES = [
  { id: 'providers', label: '供应商', icon: Server },
  { id: 'advanced', label: '高级参数', icon: SlidersHorizontal },
  { id: 'display', label: '显示', icon: Type },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'data', label: '数据', icon: HardDrive },
] as const;
type PageId = typeof PAGES[number]['id'];

/**
 * 用户设置页面组件（分页式）
 *
 * 核心逻辑：
 * 1. 分页导航：左侧子导航（桌面）/ 横向标签（移动端），每类设置独占一页。
 * 2. 供应商页与高级参数页：由 ProviderSettings / AdvancedSettings 承载，管理多供应商预设与生成参数。
 * 3. 显示 / 外观 / 数据：字体大小、强调色与网页背景、数据导出导入，沿用即时持久化策略。
 *
 * @returns {JSX.Element} Settings 页面组件
 */
export function Settings() {
  const { showAlert } = useDialog();
  const isMobile = useIsMobile();
  const [page, setPage] = useState<PageId>('providers');

  // Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportData, setExportData] = useState<{ subjects: any[], entities: any[] }>({ subjects: [], entities: [] });
  const [selectedExportSubjects, setSelectedExportSubjects] = useState<Set<string>>(new Set());
  const [selectedExportEntities, setSelectedExportEntities] = useState<Set<string>>(new Set());
  const [exportChatHistory, setExportChatHistory] = useState(true);
  const [exportConfig, setExportConfig] = useState(false);

  // Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<StudyStudioData | null>(null);
  const [selectedImportSubjects, setSelectedImportSubjects] = useState<Set<string>>(new Set());
  const [selectedImportEntities, setSelectedImportEntities] = useState<Set<string>>(new Set());
  const [importChatHistory, setImportChatHistory] = useState(true);
  const [importConfig, setImportConfig] = useState(false);
  const [overwriteConfig, setOverwriteConfig] = useState(false);

  // Font Size State
  const { fontSize, setFontSize } = useFontSize();

  // Accent Theme & Background State
  const { accent, setAccent } = useAccentTheme();
  const { background, setBackground } = useBackground();
  const [imageUrlInput, setImageUrlInput] = useState(background.imageUrl);

  // 当外部背景配置变化时（如重置），同步图片 URL 输入框
  useEffect(() => {
    setImageUrlInput(background.imageUrl);
  }, [background.imageUrl]);

  /** 更新背景配置的单个字段并立即应用 */
  const updateBg = (patch: Partial<BackgroundConfig>) => {
    setBackground({ ...background, ...patch });
  };

  /** 应用图片 URL（点击/回车触发，避免逐字符重载图片造成闪烁） */
  const applyImageUrl = () => {
    const url = imageUrlInput.trim();
    updateBg({ mode: 'image', imageUrl: url });
  };

  /** 处理本地图片上传：缩放后写入背景配置（Data URL 可持久化） */
  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToScaledDataUrl(file);
      setImageUrlInput(dataUrl);
      updateBg({ mode: 'image', imageUrl: dataUrl });
    } catch (err) {
      showAlert('图片处理失败：' + (err as Error).message, { title: '错误' });
    }
    e.target.value = '';
  };

  /** 重置网页背景为默认（关闭） */
  const resetBackground = () => {
    setBackground({ ...DEFAULT_BACKGROUND });
    setImageUrlInput('');
  };

  // --- Export Logic ---

  const openExportModal = async () => {
    const subjects = await db.subjects.toArray();
    const entities = await db.entities.toArray();
    setExportData({ subjects, entities });
    setSelectedExportSubjects(new Set(subjects.map(s => s.id)));
    setSelectedExportEntities(new Set(entities.map(e => e.id)));
    setShowExportModal(true);
  };

  const handleConfirmExport = async () => {
    try {
      await DataManager.downloadBackup({
        subjectIds: Array.from(selectedExportSubjects),
        entityIds: Array.from(selectedExportEntities),
        includeChatHistory: exportChatHistory,
        includeConfig: exportConfig
      });
      showAlert('数据备份文件已开始下载', { title: '导出成功' });
      setShowExportModal(false);
    } catch (e) {
      showAlert('导出失败: ' + e, { title: '错误' });
    }
  };

  // --- Import Logic ---

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await DataManager.parseImportFile(file);
      setImportData(data);
      setSelectedImportSubjects(new Set(data.subjects.map(s => s.id)));
      setSelectedImportEntities(new Set(data.entities.map(e => e.id)));
      setImportChatHistory(data.chatSessions?.length > 0);
      setImportConfig(false);
      setOverwriteConfig(false);
      setShowImportModal(true);
    } catch (e) {
      showAlert('文件解析失败: ' + e, { title: '错误' });
    }
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!importData) return;
    try {
      await DataManager.importStudyData(importData, {
        subjectIds: Array.from(selectedImportSubjects),
        entityIds: Array.from(selectedImportEntities),
        includeChatHistory: importChatHistory,
        includeConfig: importConfig,
        overwriteConfig
      });
      showAlert('数据已成功导入，页面将刷新。', { title: '导入成功' });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      showAlert('导入失败: ' + e, { title: '错误' });
    }
  };

  // --- Shared Tree Logic ---

  const handleToggleSubject = (mode: 'export' | 'import') => (id: string, entityIds: string[], checked: boolean) => {
    const setSubjects = mode === 'export' ? setSelectedExportSubjects : setSelectedImportSubjects;
    const setEntities = mode === 'export' ? setSelectedExportEntities : setSelectedImportEntities;

    setSubjects(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

    setEntities(prev => {
      const next = new Set(prev);
      entityIds.forEach(eid => {
        if (checked) next.add(eid);
        else next.delete(eid);
      });
      return next;
    });
  };

  const handleToggleEntity = (mode: 'export' | 'import') => (id: string, subjectId: string, checked: boolean) => {
    const setSubjects = mode === 'export' ? setSelectedExportSubjects : setSelectedImportSubjects;
    const setEntities = mode === 'export' ? setSelectedExportEntities : setSelectedImportEntities;

    setEntities(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

    if (checked) {
      setSubjects(prev => {
        const next = new Set(prev);
        next.add(subjectId);
        return next;
      });
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 md:px-8 md:py-10 pb-24 md:pb-10">
        {/* ===== 页头 ===== */}
        <div className="space-y-1 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            设置
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            管理 AI 供应商、生成参数、显示偏好与数据备份
          </p>
        </div>

        {/* 移动端横向标签 */}
        {isMobile && (
          <div className="flex gap-1.5 overflow-x-auto pb-3 mb-2 -mx-1 px-1 scrollbar-thin">
            {PAGES.map(p => {
              const Icon = p.icon;
              const active = page === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPage(p.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white/70 dark:bg-zinc-900/70 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800'
                  )}
                >
                  <Icon size={13} />
                  {p.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-6">
          {/* 桌面端左侧子导航 */}
          {!isMobile && (
            <nav className="w-44 shrink-0">
              <div className="sticky top-6 space-y-1">
                {PAGES.map(p => {
                  const Icon = p.icon;
                  const active = page === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPage(p.id)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        active
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100'
                      )}
                    >
                      <Icon size={16} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </nav>
          )}

          {/* ===== 分页内容 ===== */}
          <div className="flex-1 min-w-0 space-y-8">
            {/* 供应商页 */}
            {page === 'providers' && <ProviderSettings />}

            {/* 高级参数页 */}
            {page === 'advanced' && <AdvancedSettings />}

            {/* 显示页 */}
            {page === 'display' && (
              <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/80 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <Type size={16} className="text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">显示设置</h2>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">调整全局字体大小，内容与对话即刻生效</p>
                  </div>
                </div>

                <div className="p-5 space-y-6">
                  <FontSizeSlider
                    label="全局字体大小"
                    description="笔记、文档、题库及 AI 对话窗口的文字大小"
                    options={APP_FONT_OPTIONS}
                    value={fontSize}
                    onChange={setFontSize}
                  />

                  {/* 内容字体实时预览 */}
                  <div
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 p-4 space-y-2"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wide">内容字体预览</p>
                    <h3 className="text-[1.5em] font-bold text-zinc-800 dark:text-zinc-200">
                      这是标题文本 Heading
                    </h3>
                    <p className="leading-relaxed text-zinc-700 dark:text-zinc-300">
                      这是正文段落。The quick brown fox jumps over the lazy dog.
                      窗前明月光，疑是地上霜。举头望明月，低头思故乡。
                    </p>
                    <p className="text-[0.875em] text-zinc-500 dark:text-zinc-400">
                      这是小字注释：调整上方滑块可实时预览字体大小变化。
                    </p>
                  </div>

                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-5">
                    {/* 对话框字体实时预览 */}
                    <div
                      className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 p-4 space-y-2"
                      style={{ fontSize: `${fontSize}px` }}
                    >
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wide">对话框字体预览</p>
                      <div className="flex gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-500 shrink-0 mt-0.5" />
                        <div className="space-y-1.5">
                          <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed">
                            AI 助手回复消息示例：已为您生成学习笔记，涵盖核心知识点与重点难点解析。
                          </p>
                          <p className="text-[0.85em] text-zinc-400 dark:text-zinc-500">
                            工具调用 · 搜索了 3 个来源 · 耗时 1.2s
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* 外观页 */}
            {page === 'appearance' && (
              <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/80 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-900/30">
                    <Palette size={16} className="text-pink-600 dark:text-pink-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">外观主题</h2>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">选择强调色与自定义网页背景</p>
                  </div>
                </div>

                <div className="p-5 space-y-6">
                  {/* 主题配色 */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-zinc-700 dark:text-zinc-300">
                      主题配色
                    </label>
                    <p className="text-[10px] text-zinc-400 mb-3">应用于按钮、选中态、图标等强调色元素</p>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {ACCENT_THEMES.map(t => {
                        const active = accent === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setAccent(t.id)}
                            title={t.name}
                            className={cn(
                              'relative flex flex-col items-center gap-1.5 py-2.5 rounded-lg border transition-all',
                              active
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                            )}
                          >
                            <span
                              className="w-6 h-6 rounded-full border border-black/10 dark:border-white/15"
                              style={{ backgroundColor: t.swatch }}
                            />
                            <span className={cn(
                              'text-[11px]',
                              active ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-zinc-500 dark:text-zinc-400'
                            )}>
                              {t.name}
                            </span>
                            {active && (
                              <span className="absolute top-1 right-1.5">
                                <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 网页背景 */}
                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-5">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        网页背景
                      </label>
                      {background.mode !== 'none' && (
                        <button
                          onClick={resetBackground}
                          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                        >
                          <X size={12} />
                          重置
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-400 mb-3">为整个应用设置纯色或图片背景，将在卡片间隙与毛玻璃侧边栏中显现</p>

                    {/* 模式切换 */}
                    <div className="inline-flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg mb-4">
                      {([
                        { id: 'none', label: '关闭' },
                        { id: 'color', label: '纯色' },
                        { id: 'image', label: '图片' },
                      ] as { id: BackgroundMode; label: string }[]).map(m => (
                        <button
                          key={m.id}
                          onClick={() => updateBg({ mode: m.id })}
                          className={cn(
                            'px-4 py-1.5 text-xs font-medium rounded-md transition-all',
                            background.mode === m.id
                              ? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 shadow-sm'
                              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {/* 纯色模式 */}
                    {background.mode === 'color' && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={background.color}
                            onChange={e => updateBg({ color: e.target.value })}
                            className="w-10 h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer bg-transparent p-0"
                          />
                          <input
                            type="text"
                            value={background.color}
                            onChange={e => updateBg({ color: e.target.value })}
                            className="flex-1 border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            placeholder="#RRGGBB"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {BACKGROUND_COLOR_PRESETS.map(c => (
                            <button
                              key={c}
                              onClick={() => updateBg({ color: c })}
                              title={c}
                              className={cn(
                                'w-7 h-7 rounded-md border transition-transform hover:scale-110',
                                background.color.toLowerCase() === c.toLowerCase()
                                  ? 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950 ring-blue-500 border-transparent'
                                  : 'border-zinc-200 dark:border-zinc-700'
                              )}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 图片模式 */}
                    {background.mode === 'image' && (
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                            <input
                              type="text"
                              value={imageUrlInput}
                              onChange={e => setImageUrlInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') applyImageUrl(); }}
                              placeholder="粘贴图片 URL..."
                              className="w-full pl-8 pr-3 py-2 border rounded-lg bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                          </div>
                          <button
                            onClick={applyImageUrl}
                            className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-colors whitespace-nowrap"
                          >
                            应用
                          </button>
                        </div>

                        {/* 本地图片上传 */}
                        <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer">
                          <Upload size={14} />
                          上传本地图片
                          <input type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
                        </label>

                        {background.imageUrl && (
                          <p className="text-[10px] text-zinc-400 flex items-center gap-1 truncate">
                            <ImageIcon size={11} className="shrink-0" />
                            <span className="truncate">
                              {background.imageUrl.startsWith('data:') ? '本地图片' : background.imageUrl}
                            </span>
                          </p>
                        )}

                        {/* 背景模糊 */}
                        <SegmentSlider
                          label="背景模糊"
                          description="柔化背景图片，减少细节干扰"
                          options={[0, 2, 4, 8, 12, 16, 20]}
                          value={background.blur}
                          onChange={(v) => updateBg({ blur: v })}
                          unit="px"
                          formatValue={(v) => v === 0 ? '无' : `${v}px`}
                        />

                        {/* 遮罩强度 */}
                        <SegmentSlider
                          label="遮罩强度"
                          description="叠加半透明白/黑遮罩以增强内容可读性"
                          options={[0, 15, 30, 45, 60, 75]}
                          value={background.overlay}
                          onChange={(v) => updateBg({ overlay: v })}
                          unit="%"
                          formatValue={(v) => `${v}%`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 数据页 */}
            {page === 'data' && (
              <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/80 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <HardDrive size={16} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">数据管理</h2>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">备份与恢复学习数据</p>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    您可以将所有学科、笔记和设置导出为本地文件进行备份，或从备份文件中恢复数据。
                  </p>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={openExportModal}
                      className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-200 dark:border-zinc-700"
                    >
                      <Upload size={16} />
                      导出数据
                    </button>

                    <label className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer text-sm font-medium border border-zinc-200 dark:border-zinc-700">
                      <Download size={16} />
                      导入数据
                      <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
                    </label>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Export Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="选择导出内容"
        footer={
          <div className="flex gap-2">
            <button
              onClick={() => setShowExportModal(false)}
              className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 rounded-lg transition-colors text-sm"
            >
              取消
            </button>
            <button
              onClick={handleConfirmExport}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              确认导出 ({selectedExportEntities.size} 项)
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">请勾选需要导出的学科及内容：</p>
          <DataSelectionTree
            data={exportData}
            selectedSubjectIds={selectedExportSubjects}
            selectedEntityIds={selectedExportEntities}
            onToggleSubject={handleToggleSubject('export')}
            onToggleEntity={handleToggleEntity('export')}
          />
          <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3 space-y-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">其他内容</p>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={exportChatHistory}
                onChange={e => setExportChatHistory(e.target.checked)}
                className="rounded border-zinc-300 w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-200">对话记录</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={exportConfig}
                onChange={e => setExportConfig(e.target.checked)}
                className="rounded border-zinc-300 w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-200">AI 配置</span>
              <span className="text-xs text-zinc-400">（含供应商、API Key，请谨慎共享）</span>
            </label>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="选择导入内容"
        footer={
          <div className="flex gap-2">
            <button
              onClick={() => setShowImportModal(false)}
              className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 rounded-lg transition-colors text-sm"
            >
              取消
            </button>
            <button
              onClick={handleConfirmImport}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              确认导入 ({selectedImportEntities.size} 项)
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">解析成功，请勾选需要导入的内容：</p>
          {importData && (
            <DataSelectionTree
              data={importData}
              selectedSubjectIds={selectedImportSubjects}
              selectedEntityIds={selectedImportEntities}
              onToggleSubject={handleToggleSubject('import')}
              onToggleEntity={handleToggleEntity('import')}
            />
          )}
          {importData && ((importData.chatSessions?.length > 0) || (importData.config && importData.config.length > 0) || (importData.providers && importData.providers.length > 0)) && (
            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3 space-y-2">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">其他内容</p>
              {importData.chatSessions?.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={importChatHistory}
                    onChange={e => setImportChatHistory(e.target.checked)}
                    className="rounded border-zinc-300 w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-200">对话记录</span>
                  <span className="text-xs text-zinc-400">({importData.chatSessions.length} 条会话)</span>
                </label>
              )}
              {((importData.config?.length ?? 0) > 0 || (importData.providers?.length ?? 0) > 0) && (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={importConfig}
                      onChange={e => { setImportConfig(e.target.checked); if (!e.target.checked) setOverwriteConfig(false); }}
                      className="rounded border-zinc-300 w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-200">AI 配置</span>
                    <span className="text-xs text-zinc-400">（含供应商预设与密钥）</span>
                  </label>
                  {importConfig && (
                    <label className="flex items-center gap-2 cursor-pointer select-none ml-6">
                      <input
                        type="checkbox"
                        checked={overwriteConfig}
                        onChange={e => setOverwriteConfig(e.target.checked)}
                        className="rounded border-zinc-300 w-3.5 h-3.5 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-zinc-600 dark:text-zinc-300">覆盖现有配置</span>
                      <span className="text-xs text-zinc-400">（不勾选则仅在无配置时写入）</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-zinc-400">
            注：导入操作会自动处理 ID 冲突，创建副本并重命名，不会覆盖现有数据。
          </p>
        </div>
      </Modal>
    </div>
  );
}