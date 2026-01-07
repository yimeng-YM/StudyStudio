import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { processFile } from '@/lib/fileProcessor';
import { Folder, Upload, FileText, Trash2, Eye, File as FileIcon } from 'lucide-react';
import { useDialog } from '@/components/ui/DialogProvider';
import { Modal } from '@/components/ui/Modal';

export function Resources() {
  const files = useLiveQuery(() => 
    db.entities
      .where({ type: 'file', subjectId: 'resource_library' })
      .reverse()
      .toArray()
  );

  const [uploading, setUploading] = useState(false);
  const [viewFile, setViewFile] = useState<any>(null);
  const { showConfirm, showAlert } = useDialog();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      setUploading(true);
      try {
          for (let i = 0; i < fileList.length; i++) {
              const file = fileList[i];
              const processed = await processFile(file);
              
              await db.entities.add({
                  id: crypto.randomUUID(),
                  type: 'file',
                  subjectId: 'resource_library',
                  title: file.name,
                  content: {
                      fileName: file.name,
                      size: file.size,
                      mimeType: file.type,
                      textContent: processed.text,
                  },
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  lastAccessed: Date.now()
              });
          }
          showAlert('文件上传并处理成功', { title: '成功' });
      } catch (err) {
          console.error(err);
          showAlert('上传失败: ' + err, { title: '错误' });
      } finally {
          setUploading(false);
          // Clear input
          e.target.value = '';
      }
  };

  const deleteFile = async (id: string) => {
      const confirmed = await showConfirm("确定要删除此文件吗？", { title: "删除文件" });
      if (confirmed) {
          await db.entities.delete(id);
      }
  };

  const formatSize = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
                <Folder className="text-blue-500" size={32} />
                资料库
            </h1>
            <p className="text-slate-500 mt-1">上传文档资料，AI 助手将可以读取并引用这些内容。</p>
        </div>
        
        <label className={`
            flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm
            ${uploading ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}
        `}>
            <Upload size={20} />
            {uploading ? '处理中...' : '上传资料'}
            <input 
                type="file" 
                multiple 
                className="hidden" 
                onChange={handleFileUpload}
                accept=".txt,.md,.pdf,.docx,.csv,.json,.js,.ts,.tsx"
                disabled={uploading}
            />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-max">
        {files?.map(file => (
            <div key={file.id} className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between group">
                <div className="flex items-start gap-3">
                    <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
                        <FileIcon size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-slate-900 dark:text-slate-100 truncate" title={file.title}>
                            {file.title}
                        </h3>
                        <div className="text-xs text-slate-500 mt-1 flex gap-2">
                            <span>{formatSize(file.content.size)}</span>
                            <span>•</span>
                            <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-end gap-2 mt-4 pt-3 border-t dark:border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={() => setViewFile(file)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                        title="查看内容"
                    >
                        <Eye size={16} />
                    </button>
                    <button 
                        onClick={() => deleteFile(file.id)}
                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                        title="删除"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
        ))}
        
        {(!files || files.length === 0) && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <Folder size={48} className="mb-4 opacity-50" />
                <p>暂无资料，点击右上角上传</p>
            </div>
        )}
      </div>

      {/* File Preview Modal */}
      <Modal
        isOpen={!!viewFile}
        onClose={() => setViewFile(null)}
        title={viewFile?.title || '文件预览'}
      >
        <div className="space-y-4">
            <div className="text-xs text-slate-500 border-b dark:border-slate-800 pb-2">
                系统提取的文本内容（用于 AI 上下文）：
            </div>
            <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-4 rounded-lg max-h-[60vh] overflow-y-auto font-mono">
                {viewFile?.content?.textContent || '(无文本内容)'}
            </pre>
        </div>
      </Modal>
    </div>
  );
}
