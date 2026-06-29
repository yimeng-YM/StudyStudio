import { useEffect, useState, useMemo, useRef } from 'react';
import { useAIStore } from '@/store/useAIStore';
import { getModels } from '@/services/ai';
import { DataManager, StudyStudioData } from '@/services/dataManager';
import { useDialog } from '@/components/ui/DialogProvider';
import { Upload, Download, ChevronRight, ChevronDown, Folder, FileText, Database, GitBranch, RefreshCw, Check, Search, Type, Settings2, HardDrive, Palette, ImageIcon, X, Link2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { db } from '@/db';
import { cn } from '@/lib/utils';
import { useFontSize, APP_FONT_OPTIONS } from '@/hooks/useFontSize';
import { FontSizeSlider } from '@/components/ui/FontSizeSlider';
import { SegmentSlider } from '@/components/ui/SegmentSlider';
import { DEFAULT_MAX_TOKENS } from '@/services/promptConfig';
import { useAccentTheme, ACCENT_THEMES } from '@/hooks/useAccentTheme';
import { useBackground, DEFAULT_BACKGROUND, BACKGROUND_COLOR_PRESETS } from '@/hooks/useBackground';
import type { BackgroundConfig, BackgroundMode } from '@/hooks/useBackground';

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

/**
 * 用户设置页面组件
 *
 * 核心逻辑：
 * 1. 用户偏好设置：管理 AI 服务提供商、接口地址 (Base URL)、API Key 以及模型选择。支持高级参数（Max Tokens, Temperature）配置。
 * 2. 数据导出与备份：集成 DataManager，支持按学科和实体粒度选择数据并导出为 JSON 备份文件。
 * 3. 数据导入与恢复：支持解析备份文件并覆盖或合并至本地数据库，包含导入前的预览与选择逻辑。
 * 4. 环境变量覆盖机制：应用配置优先从本地数据库读取，若数据库为空则使用系统默认预设值。
 *
 * @returns {JSX.Element} Settings 页面组件
 */
export function Settings() {
  const settings = useAIStore(s => s.settings);
  const isLoading = useAIStore(s => s.isLoading);
  const loadSettings = useAIStore(s => s.loadSettings);
  const updateSettings = useAIStore(s => s.updateSettings);
  const [localSettings, setLocalSettings] = useState(settings);
  const { showAlert } = useDialog();
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const namingModelDropdownRef = useRef<HTMLDivElement>(null);
  const [showNamingModelDropdown, setShowNamingModelDropdown] = useState(false);
  const [namingModelSearch, setNamingModelSearch] = useState('');

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

  // Advanced Settings State
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
      if (settings.modelList && settings.modelList.length > 0) {
        setModels(settings.modelList);
      }
    }
  }, [settings]);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
      if (namingModelDropdownRef.current && !namingModelDropdownRef.current.contains(event.target as Node)) {
        setShowNamingModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async () => {
    if (localSettings) {
      const settingsToSave = {
        ...localSettings,
        modelList: models,
        modelListUpdatedAt: Date.now()
      };
      await updateSettings(settingsToSave);
      showAlert('设置已保存', { title: '成功' });
    }
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

  const fetchModels = async () => {
    if (!localSettings) return;
    setLoadingModels(true);
    try {
      const modelList = await getModels(localSettings);
      const modelIds = modelList.map((m: any) => m.id);
      setModels(modelIds);
      const settingsToSave = {
        ...localSettings,
        modelList: modelIds,
        modelListUpdatedAt: Date.now()
      };
      await updateSettings(settingsToSave);
      setLocalSettings(settingsToSave);
      showAlert(`成功获取并缓存 ${modelList.length} 个模型`, { title: '成功' });
    } catch (e) {
      showAlert('获取模型失败: ' + e, { title: '错误' });
    } finally {
      setLoadingModels(false);
    }
  };

  // 过滤模型列表
  const filteredModels = useMemo(() => {
    if (!modelSearch) return models;
    return models.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()));
  }, [models, modelSearch]);

  const filteredNamingModels = useMemo(() => {
    if (!namingModelSearch) return models;
    return models.filter(m => m.toLowerCase().includes(namingModelSearch.toLowerCase()));
  }, [models, namingModelSearch]);

  const selectModel = (model: string) => {
    if (localSettings) {
      setLocalSettings({ ...localSettings, model });
    }
    setShowModelDropdown(false);
    setModelSearch('');
  };

  const selectNamingModel = (model: string) => {
    if (localSettings) {
      setLocalSettings({ ...localSettings, namingModel: model });
    }
    setShowNamingModelDropdown(false);
    setNamingModelSearch('');
  };

  // 格式化缓存时间
  const formatCacheTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `缓存于 ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };

  if (isLoading || !localSettings) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex items-center gap-2 text-zinc-400">
        <div className="w-4 h-4 border-2 border-zinc-300 border-t-blue-500 rounded-full animate-spin" />
        加载中...
      </div>
    </div>
  );

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 md:px-8 md:py-10 pb-24 md:pb-10 space-y-8">
        {/* ===== 页头 ===== */}
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            设置
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            管理 AI 连接、显示偏好与数据备份
          </p>
        </div>

        {/* ===== AI 配置 ===== */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/80 overflow-hidden">
          {/* 节头 */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Settings2 size={16} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">AI 配置</h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">配置 API 连接与模型参数</p>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* 提供商 */}
            <div>
              <label className="block text-sm font-medium mb-1.5 text-zinc-700 dark:text-zinc-300">
                提供商
              </label>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
                value={localSettings.provider}
                onChange={e => setLocalSettings({ ...localSettings, provider: e.target.value as any })}
              >
                <option value="openai">OpenAI</option>
                <option value="custom">Custom (OpenAI 兼容)</option>
              </select>
            </div>

            {/* Base URL */}
            <div>
              <label className="block text-sm font-medium mb-1.5 text-zinc-700 dark:text-zinc-300">
                接口地址 (Base URL)
              </label>
              <input
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow font-mono"
                value={localSettings.baseUrl}
                onChange={e => setLocalSettings({ ...localSettings, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm font-medium mb-1.5 text-zinc-700 dark:text-zinc-300">
                API Key
              </label>
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow font-mono"
                value={localSettings.apiKey}
                onChange={e => setLocalSettings({ ...localSettings, apiKey: e.target.value })}
              />
            </div>

            {/* 模型选择 */}
            <div>
              <label className="block text-sm font-medium mb-1.5 text-zinc-700 dark:text-zinc-300">
                模型
              </label>
              <div className="flex gap-2">
                <div ref={modelDropdownRef} className="flex-1 relative">
                  <div
                    className="flex items-center border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                  >
                    <input
                      className="flex-1 bg-transparent border-0 outline-none text-zinc-900 dark:text-zinc-100 text-sm cursor-pointer"
                      value={showModelDropdown ? modelSearch : localSettings.model}
                      onChange={e => {
                        setModelSearch(e.target.value);
                        if (!showModelDropdown) setShowModelDropdown(true);
                      }}
                      onFocus={() => setShowModelDropdown(true)}
                      placeholder="选择或输入模型名称..."
                    />
                    <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform duration-200", showModelDropdown && "rotate-180")} />
                  </div>

                  {showModelDropdown && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-60 overflow-hidden">
                      <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                          <input
                            className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                            placeholder="搜索模型..."
                            value={modelSearch}
                            onChange={e => setModelSearch(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto max-h-48">
                        {filteredModels.length === 0 ? (
                          <div className="p-3 text-center text-zinc-400 text-sm">
                            {models.length === 0 ? '点击右侧按钮获取模型列表' : '未找到匹配的模型'}
                          </div>
                        ) : (
                          filteredModels.map(m => (
                            <div
                              key={m}
                              className={cn(
                                "px-3 py-2 cursor-pointer flex items-center justify-between text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                                localSettings.model === m && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                              )}
                              onClick={() => selectModel(m)}
                            >
                              <span className="truncate">{m}</span>
                              {localSettings.model === m && <Check className="w-4 h-4 shrink-0" />}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={fetchModels}
                  disabled={loadingModels}
                  className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-700 dark:text-zinc-300 disabled:opacity-50 border border-zinc-200 dark:border-zinc-700"
                  title="刷新模型列表"
                >
                  <RefreshCw className={cn("w-4 h-4", loadingModels && "animate-spin")} />
                  <span className="hidden sm:inline">{loadingModels ? '获取中' : '刷新'}</span>
                </button>
              </div>
              {localSettings.modelListUpdatedAt && models.length > 0 && (
                <p className="text-xs text-zinc-400 mt-1.5">{formatCacheTime(localSettings.modelListUpdatedAt)} · 共 {models.length} 个模型</p>
              )}
            </div>

            {/* 高级设置 */}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-5">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group"
              >
                <span className={cn(
                  "transition-transform duration-200",
                  showAdvanced && "rotate-90"
                )}>
                  <ChevronRight size={14} />
                </span>
                高级设置
                <span className="text-xs text-zinc-400 font-normal">(Max Tokens · Temperature · 命名模型)</span>
              </button>

              <div className={cn(
                "grid transition-all duration-300 ease-out",
                showAdvanced ? "grid-rows-[1fr] opacity-100 mt-4" : "grid-rows-[0fr] opacity-0 mt-0"
              )}>
                <div className="overflow-hidden">
                  <div className="space-y-5 pl-6 border-l-2 border-zinc-100 dark:border-zinc-800">
                    {/* Max Tokens */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-zinc-700 dark:text-zinc-300">
                        回复长度 (Max Tokens)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          className="flex-1 border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
                          value={localSettings.maxTokens || DEFAULT_MAX_TOKENS}
                          onChange={e => setLocalSettings({ ...localSettings, maxTokens: parseInt(e.target.value) || 0 })}
                          placeholder={String(DEFAULT_MAX_TOKENS)}
                        />
                        <button
                          type="button"
                          onClick={() => setLocalSettings({ ...localSettings, maxTokens: DEFAULT_MAX_TOKENS })}
                          className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-colors whitespace-nowrap"
                          title="重置为默认值"
                        >
                          默认
                        </button>
                      </div>
                      {/* 快捷预设 */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {[4096, 8192, DEFAULT_MAX_TOKENS, 16384, 32768].map(preset => {
                          const active = (localSettings.maxTokens || DEFAULT_MAX_TOKENS) === preset;
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setLocalSettings({ ...localSettings, maxTokens: preset })}
                              className={cn(
                                'px-2.5 py-1 rounded-full text-[11px] font-medium tabular-nums border transition-colors',
                                active
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                              )}
                            >
                              {preset >= 1024 ? `${(preset / 1024).toFixed(preset % 1024 === 0 ? 0 : 1)}K` : preset}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1.5">控制 AI 回复的最大长度，默认 {(DEFAULT_MAX_TOKENS / 1024).toFixed(0)}K，建议 4K - 32K</p>
                    </div>

                    {/* Temperature */}
                    <SegmentSlider
                      label="回复温度 (Temperature)"
                      description="控制 AI 回复的随机性与创造性，0 为最精准，2 为最创意。"
                      options={[0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]}
                      value={localSettings.temperature ?? 0.7}
                      onChange={(v) => setLocalSettings({ ...localSettings, temperature: v })}
                      accent="amber"
                      startLabel="精准"
                      endLabel="创意"
                      formatValue={(v) => Number(v.toFixed(2)).toString()}
                    />

                    {/* 命名模型 */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-zinc-700 dark:text-zinc-300">
                        对话自动命名模型
                      </label>
                      <p className="text-[10px] text-zinc-400 mb-1.5">留空则使用主模型——推荐使用更快速便宜的模型</p>
                      <div ref={namingModelDropdownRef}>
                        {/* 触发器：展示当前值，点击展开/收起内联面板 */}
                        <div
                          className="flex items-center border rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                          onClick={() => {
                            setShowNamingModelDropdown(!showNamingModelDropdown);
                            setNamingModelSearch('');
                          }}
                        >
                          <span className={cn(
                            "flex-1 text-sm truncate",
                            localSettings.namingModel ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"
                          )}>
                            {localSettings.namingModel || '推荐使用更快速便宜的模型（留空则使用主模型）'}
                          </span>
                          <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0", showNamingModelDropdown && "rotate-180")} />
                        </div>

                        {/* 内联展开面板（文档流内，不会被父级 overflow-hidden 裁切） */}
                        {showNamingModelDropdown && (
                          <div className="mt-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm overflow-hidden">
                            <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                              <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
                                  placeholder="搜索模型..."
                                  value={namingModelSearch}
                                  onChange={e => setNamingModelSearch(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="overflow-y-auto max-h-52">
                              <div
                                className={cn(
                                  "px-3 py-2 cursor-pointer flex items-center justify-between text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-500",
                                  !localSettings.namingModel && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                                )}
                                onClick={() => selectNamingModel('')}
                              >
                                <span>使用主模型（留空）</span>
                                {!localSettings.namingModel && <Check className="w-4 h-4 shrink-0" />}
                              </div>
                              {filteredNamingModels.length === 0 ? (
                                <div className="p-3 text-center text-zinc-400 text-sm">
                                  {models.length === 0 ? '请先获取模型列表' : '未找到匹配的模型'}
                                </div>
                              ) : (
                                filteredNamingModels.map(m => (
                                  <div
                                    key={m}
                                    className={cn(
                                      "px-3 py-2 cursor-pointer flex items-center justify-between text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors",
                                      localSettings.namingModel === m && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                                    )}
                                    onClick={() => selectNamingModel(m)}
                                  >
                                    <span className="truncate">{m}</span>
                                    {localSettings.namingModel === m && <Check className="w-4 h-4 shrink-0" />}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== 显示设置 ===== */}
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

        {/* ===== 外观主题 ===== */}
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

        {/* ===== 数据管理 ===== */}
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

        {/* ===== 保存按钮 ===== */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm font-medium shadow-sm shadow-blue-500/20"
          >
            <Check size={16} />
            保存设置
          </button>
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
              <span className="text-xs text-zinc-400">（含 API Key，请谨慎共享）</span>
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
          {importData && ((importData.chatSessions?.length > 0) || (importData.config && importData.config.length > 0)) && (
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
              {importData.config && importData.config.length > 0 && (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={importConfig}
                      onChange={e => { setImportConfig(e.target.checked); if (!e.target.checked) setOverwriteConfig(false); }}
                      className="rounded border-zinc-300 w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-zinc-700 dark:text-zinc-200">AI 配置</span>
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
