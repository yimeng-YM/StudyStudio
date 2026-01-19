import { useEffect, useState } from 'react';
import { useAIStore } from '@/store/useAIStore';
import { getModels } from '@/services/ai';
import { DataManager } from '@/services/dataManager';
import { useDialog } from '@/components/ui/DialogProvider';
import { Upload, Download } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { db } from '@/db';

export function Settings() {
  const { settings, loadSettings, updateSettings, isLoading } = useAIStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const { showConfirm, showAlert } = useDialog();
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSubjects, setExportSubjects] = useState<any[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());

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

  const openExportModal = async () => {
    const subjects = await db.subjects.toArray();
    setExportSubjects(subjects);
    setSelectedSubjectIds(new Set(subjects.map(s => s.id)));
    setShowExportModal(true);
  };

  const handleConfirmExport = async () => {
    try {
      const isFullExport = selectedSubjectIds.size === exportSubjects.length;
      if (isFullExport) {
        await DataManager.downloadBackup();
      } else {
        await DataManager.downloadBackup({ subjectIds: Array.from(selectedSubjectIds) });
      }
      showAlert('数据备份文件已开始下载', { title: '导出成功' });
      setShowExportModal(false);
    } catch (e) {
      showAlert('导出失败: ' + e, { title: '错误' });
    }
  };

  const toggleSubject = (id: string) => {
    const newSet = new Set(selectedSubjectIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedSubjectIds(newSet);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = await showConfirm(
      "导入操作将合并数据到当前数据库。\n\n如果遇到 ID 冲突（如已存在的笔记），系统将自动重命名导入的内容并保留原有数据。\n\n是否继续？",
      { title: "确认导入" }
    );

    if (confirmed) {
      try {
        await DataManager.importData(file);
        showAlert('数据已成功导入，页面将刷新。', { title: '导入成功' });
        setTimeout(() => window.location.reload(), 1500);
      } catch (e) {
        showAlert('导入失败: ' + e, { title: '错误' });
      }
    }

    // Reset input
    e.target.value = '';
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
                placeholder="gpt-3.5-turbo"
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

          <div className="border-t dark:border-zinc-800 pt-4 mt-4">
            <h3 className="text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">自动化配置</h3>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">对话自动命名模型 (留空则使用主模型)</label>
              <input
                className="w-full border rounded px-3 py-2 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                value={localSettings.namingModel || ''}
                onChange={e => setLocalSettings({ ...localSettings, namingModel: e.target.value })}
                placeholder="例如: gpt-3.5-turbo-0125 (推荐使用更快速便宜的模型)"
                list="model-options"
              />
            </div>
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
              <Download size={18} />
              导出数据备份
            </button>

            <label className="flex items-center gap-2 px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors cursor-pointer">
              <Upload size={18} />
              导入备份文件
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="导出数据"
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
              确认导出
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">请选择要导出的学科（默认全选）：</p>
          <div className="space-y-1 max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-700 p-2 rounded-lg">
            <label className="flex items-center gap-3 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded cursor-pointer select-none text-zinc-700 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={exportSubjects.length > 0 && selectedSubjectIds.size === exportSubjects.length}
                onChange={() => {
                  if (selectedSubjectIds.size === exportSubjects.length) setSelectedSubjectIds(new Set());
                  else setSelectedSubjectIds(new Set(exportSubjects.map(s => s.id)));
                }}
                className="rounded border-zinc-300 w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium">全选</span>
            </label>
            <div className="border-t border-zinc-100 dark:border-zinc-700 my-1"></div>
            {exportSubjects.length === 0 ? (
              <p className="text-center text-zinc-400 py-2">暂无学科数据</p>
            ) : (
              exportSubjects.map(subject => (
                <label key={subject.id} className="flex items-center gap-3 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded cursor-pointer select-none text-zinc-700 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={selectedSubjectIds.has(subject.id)}
                    onChange={() => toggleSubject(subject.id)}
                    className="rounded border-zinc-300 w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{subject.name}</span>
                </label>
              ))
            )}
          </div>
          <p className="text-xs text-zinc-400">
            注：导出将包含所选学科下的所有笔记、思维导图、关联关系以及对话记录。
          </p>
        </div>
      </Modal>
    </div>
  );
}
