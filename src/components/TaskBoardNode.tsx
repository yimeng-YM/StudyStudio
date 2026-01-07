import { memo, useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Plus, X, Check, Trash2 } from 'lucide-react';

export interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
}

import { GitBranch } from 'lucide-react';

export interface TaskBlockData {
  title: string;
  items: TaskItem[];
  onChange?: (data: Partial<TaskBlockData>) => void;
  onDelete?: () => void;
  onCreateSubBoard?: (itemId: string) => void;
}

export const TaskBoardNode = memo(({ data, selected }: NodeProps<TaskBlockData>) => {
  const [newItemText, setNewItemText] = useState('');

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    data.onChange?.({ title: e.target.value });
  };

  const addItem = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newItemText.trim()) return;
    const newItem: TaskItem = { id: crypto.randomUUID(), text: newItemText, completed: false };
    data.onChange?.({ items: [...data.items, newItem] });
    setNewItemText('');
  };

  const toggleItem = (id: string) => {
    const newItems = data.items.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    );
    data.onChange?.({ items: newItems });
  };

  const deleteItem = (id: string) => {
    const newItems = data.items.filter(item => item.id !== id);
    data.onChange?.({ items: newItems });
  };

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-lg border-2 min-w-[280px] transition-colors ${selected ? 'border-blue-500' : 'border-slate-200 dark:border-slate-700'}`}>
      {/* 4-side Handles */}
      <Handle type="target" position={Position.Top} id="top" className="w-3 h-3 bg-slate-400" />
      <Handle type="source" position={Position.Top} id="top-src" className="w-3 h-3 bg-slate-400" />
      <Handle type="target" position={Position.Right} id="right" className="w-3 h-3 bg-slate-400" />
      <Handle type="source" position={Position.Right} id="right-src" className="w-3 h-3 bg-slate-400" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="w-3 h-3 bg-slate-400" />
      <Handle type="source" position={Position.Bottom} id="bottom-src" className="w-3 h-3 bg-slate-400" />
      <Handle type="target" position={Position.Left} id="left" className="w-3 h-3 bg-slate-400" />
      <Handle type="source" position={Position.Left} id="left-src" className="w-3 h-3 bg-slate-400" />
      
      <div className="p-3 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-t-xl flex justify-between items-center gap-2">
        <input 
          value={data.title}
          onChange={handleTitleChange}
          className="bg-transparent font-bold text-slate-800 dark:text-slate-200 w-full focus:outline-none nodrag"
          placeholder="任务块标题"
        />
        <button 
            onClick={data.onDelete}
            className="text-slate-400 hover:text-red-500 transition-colors p-1 nodrag"
            title="删除任务块"
        >
            <Trash2 size={16} />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <div className="space-y-1">
          {data.items.map(item => (
            <div key={item.id} className="flex items-start gap-2 group relative pr-4">
              <button 
                onClick={() => toggleItem(item.id)}
                className={`mt-1 w-4 h-4 rounded border flex items-center justify-center transition-colors nodrag nopan ${item.completed ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 dark:border-slate-600'}`}
              >
                {item.completed && <Check size={10} />}
              </button>
              <span className={`flex-1 text-sm ${item.completed ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300'}`}>
                {item.text}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={() => data.onCreateSubBoard?.(item.id)}
                    className="text-slate-400 hover:text-blue-500 nodrag nopan"
                    title="创建子集任务卡"
                >
                    <GitBranch size={14} />
                </button>
                <button 
                    onClick={() => deleteItem(item.id)}
                    className="text-slate-400 hover:text-red-500 nodrag nopan"
                >
                    <X size={14} />
                </button>
              </div>
              <Handle 
                type="source" 
                position={Position.Right} 
                id={item.id} 
                className="!bg-blue-400 !w-3 !h-3 !border-2 !border-white dark:!border-slate-800 hover:!w-4 hover:!h-4 transition-all cursor-pointer" 
                style={{ right: 0, top: '50%' }}
              />
            </div>
          ))}
        </div>

        <form onSubmit={addItem} className="flex gap-2 mt-2 pt-2 border-t dark:border-slate-700/50">
          <input 
            value={newItemText}
            onChange={e => setNewItemText(e.target.value)}
            className="flex-1 bg-slate-100 dark:bg-slate-900 border-none rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 nodrag nopan"
            placeholder="添加任务..."
          />
          <button type="submit" className="text-blue-500 hover:text-blue-600 p-1 nodrag nopan">
            <Plus size={18} />
          </button>
        </form>
      </div>
    </div>
  );
});

TaskBoardNode.displayName = 'TaskBoardNode';
