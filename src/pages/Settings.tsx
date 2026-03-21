import { useEffect, useState, useMemo } from 'react';
import { useAIStore } from '@/store/useAIStore';
import { getModels } from '@/services/ai';
import { DataManager, StudyStudioData } from '@/services/dataManager';
import { useDialog } from '@/components/ui/DialogProvider';
import { Upload, Download, ChevronRight, ChevronDown, Folder, FileText, Database, GitBranch } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { db } from '@/db';
import { cn } from '@/lib/utils';

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
        // Fallback for unknown types or group 'other'
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
                    
                    // Check if all items in group are selected
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
  const { settings, loadSettings, updateSettings, isLoading } = useAIStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const { showAlert } = useDialog();
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportData, setExportData] = useState<{ subjects: any[], entities: any[] }>({ subjects: [], entities: [] });
  const [selectedExportSubjects, setSelectedExportSubjects] = useState<Set<string>>(new Set());
  const [selectedExportEntities, setSelectedExportEntities] = useState<Set<string>>(new Set());

  // Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<StudyStudioData | null>(null);
  const [selectedImportSubjects, setSelectedImportSubjects] = useState<Set<string>>(new Set());
  const [selectedImportEntities, setSelectedImportEntities] = useState<Set<string>>(new Set());

  // Advanced Settings State
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    if (localSettings) {
      await updateSettings(localSettings);
      showAlert('设置已保存', { title: '成功' });
    }
  };

  // --- Export Logic ---

  const openExportModal = async () => {
    const subjects = await db.subjects.toArray();
    const entities = await db.entities.toArray();
    setExportData({ subjects, entities });
    
    // Default select all
    setSelectedExportSubjects(new Set(subjects.map(s => s.id)));
    setSelectedExportEntities(new Set(entities.map(e => e.id)));
    
    setShowExportModal(true);
  };

  const handleConfirmExport = async () => {
    try {
      await DataManager.downloadBackup({ 
        subjectIds: Array.from(selectedExportSubjects),
        entityIds: Array.from(selectedExportEntities)
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
      
      // Default select all
      setSelectedImportSubjects(new Set(data.subjects.map(s => s.id)));
      setSelectedImportEntities(new Set(data.entities.map(e => e.id)));
      
      setShowImportModal(true);
    } catch (e) {
      showAlert('文件解析失败: ' + e, { title: '错误' });
    }
    e.target.value = ''; // Reset
  };

  const handleConfirmImport = async () => {
    if (!importData) return;
    try {
      await DataManager.importStudyData(importData, {
        subjectIds: Array.from(selectedImportSubjects),
        entityIds: Array.from(selectedImportEntities)
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
    const currentSubjects = mode === 'export' ? selectedExportSubjects : selectedImportSubjects;
    const currentEntities = mode === 'export' ? selectedExportEntities : selectedImportEntities;

    // Toggle Subject
    const newSubjects = new Set(currentSubjects);
    if (checked) newSubjects.add(id);
    else newSubjects.delete(id);
    setSubjects(newSubjects);

    // Toggle All Children Entities
    const newEntities = new Set(currentEntities);
    entityIds.forEach(eid => {
      if (checked) newEntities.add(eid);
      else newEntities.delete(eid);
    });
    setEntities(newEntities);
  };

  const handleToggleEntity = (mode: 'export' | 'import') => (id: string, subjectId: string, checked: boolean) => {
    const setSubjects = mode === 'export' ? setSelectedExportSubjects : setSelectedImportSubjects;
    const setEntities = mode === 'export' ? setSelectedExportEntities : setSelectedImportEntities;
    const currentSubjects = mode === 'export' ? selectedExportSubjects : selectedImportSubjects;
    const currentEntities = mode === 'export' ? selectedExportEntities : selectedImportEntities;

    // Toggle Entity
    const newEntities = new Set(currentEntities);
    if (checked) newEntities.add(id);
    else newEntities.delete(id);
    setEntities(newEntities);

    // If Entity Checked -> Ensure Subject Checked
    if (checked) {
      const newSubjects = new Set(currentSubjects);
      newSubjects.add(subjectId);
      setSubjects(newSubjects);
    }
    // If Entity Unchecked -> We keep subject checked (optional choice)
  };

  const fetchModels = async () => {
    if (!localSettings) return;
    setLoadingModels(true);
    try {
      const modelList = await getModels(localSettings);
      setModels(modelList.map((m: any) => m.id));
      showAlert(`成功获取 ${modelList.length} 个模型`, { title: '成功' });
    } catch (e) {
      showAlert('获取模型失败: ' + e, { title: '错误' });
    } finally {
      setLoadingModels(false);
    }
  };

  if (isLoading || !localSettings) return <div className="p-8">加载中...</div>;

  return (
    <div className="h-full w-full overflow-y-auto p-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold mb-6 text-zinc-900 dark:text-zinc-100">设置</h1>
        <div className="space-y-6 border p-6 rounded-lg bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800">
          <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">AI 配置</h2>

          <div>
            <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">提供商</label>
            <select
              className="w-full border rounded px-3 py-2 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
              value={localSettings.provider}
              onChange={e => setLocalSettings({ ...localSettings, provider: e.target.value as any })}
            >
              <option value="openai">OpenAI</option>
              <option value="custom">Custom (OpenAI 兼容)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">接口地址 (Base URL)</label>
            <input
              className="w-full border rounded px-3 py-2 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
              value={localSettings.baseUrl}
              onChange={e => setLocalSettings({ ...localSettings, baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">API Key</label>
            <input
              type="password"
              className="w-full border rounded px-3 py-2 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
              value={localSettings.apiKey}
              onChange={e => setLocalSettings({ ...localSettings, apiKey: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-zinc-700 dark:text-zinc-300">模型</label>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded px-3 py-2 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                value={localSettings.model}
                onChange={e => setLocalSettings({ ...localSettings, model: e.target.value })}
                list="model-options"
                placeholder="请输入模型名称..."
              />
              <datalist id="model-options">
                {models.map(m => <option key={m} value={m} />)}
              </datalist>
              <button
                onClick={fetchModels}
                disabled={loadingModels}
                className="bg-zinc-200 dark:bg-zinc-700 px-3 py-2 rounded text-sm hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors text-zinc-800 dark:text-zinc-200"
              >
                {loadingModels ? '...' : '获取模型列表'}
              </button>
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <div className="border-t dark:border-zinc-800 pt-4 mt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-blue-600 transition-colors"
            >
              {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              高级设置 (Advanced Settings)
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 pl-4 border-l-2 border-zinc-200 dark:border-zinc-800 animate-in fade-in slide-in-from-top-2 duration-200">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">回复长度 (Max Tokens)</label>
                  <input
                    type="number"
                    className="w-full border rounded px-3 py-2 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                    value={localSettings.maxTokens || 4096}
                    onChange={e => setLocalSettings({ ...localSettings, maxTokens: parseInt(e.target.value) || 0 })}
                    placeholder="4096"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">控制 AI 回复的最大长度，建议 1024 - 8192</p>
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">回复温度 (Temperature: {localSettings.temperature ?? 0.7})</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    value={localSettings.temperature ?? 0.7}
                    onChange={e => setLocalSettings({ ...localSettings, temperature: parseFloat(e.target.value) })}
                  />
                  <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                    <span>精准 (0.0)</span>
                    <span>创意 (1.0)</span>
                    <span>极致创意 (2.0)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 mb-1">对话自动命名模型 (留空则使用主模型)</label>
                  <input
                    className="w-full border rounded px-3 py-2 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                    value={localSettings.namingModel || ''}
                    onChange={e => setLocalSettings({ ...localSettings, namingModel: e.target.value })}
                    placeholder="请输入模型名称...(推荐使用更快速便宜的模型)"
                    list="model-options"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            保存设置
          </button>
        </div>

        <div className="mt-8 space-y-6 border p-6 rounded-lg bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800">
          <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">数据管理</h2>
          <p className="text-sm text-zinc-500">您可以将所有学科、笔记和设置导出为本地文件进行备份，或从备份文件中恢复数据。</p>

          <div className="flex gap-4">
            <button
              onClick={openExportModal}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
            >
              <Upload size={18} />
              导出数据
            </button>

            <label className="flex items-center gap-2 px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors cursor-pointer">
              <Download size={18} />
              导入数据
              <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
            </label>
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
              className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 rounded transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirmExport}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
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
              className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 rounded transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirmImport}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
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
          <p className="text-xs text-zinc-400">
            注：导入操作会自动处理 ID 冲突，创建副本并重命名，不会覆盖现有数据。
          </p>
        </div>
      </Modal>
    </div>
  );
}
