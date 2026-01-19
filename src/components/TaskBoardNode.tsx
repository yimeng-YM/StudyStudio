import { memo, useState } from 'react';
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
    <div className={`bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-2xl shadow-xl border-2 min-w-[280px] transition-all duration-300 ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-zinc-100 dark:border-zinc-800'}`}>
      {/* 4-side Handles */}
      <Handle type="target" position={Position.Top} id="top" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0" />
      <Handle type="source" position={Position.Top} id="top-src" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0" />
      <Handle type="target" position={Position.Right} id="right" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0" />
      <Handle type="source" position={Position.Right} id="right-src" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0" />
      <Handle type="source" position={Position.Bottom} id="bottom-src" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0" />
      <Handle type="target" position={Position.Left} id="left" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0" />
      <Handle type="source" position={Position.Left} id="left-src" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0" />

      <div className="p-4 border-b border-primary/10 bg-gradient-to-r from-primary/5 to-transparent rounded-t-2xl flex justify-between items-center gap-2">
        <input
          value={data.title}
          onChange={handleTitleChange}
          className="bg-transparent font-bold text-zinc-800 dark:text-zinc-100 w-full focus:outline-none nodrag placeholder:text-zinc-400"
          placeholder="任务块标题"
        />
        <button
          onClick={data.onDelete}
          className="text-zinc-400 hover:text-destructive transition-colors p-1 nodrag hover:bg-destructive/10 rounded-full"
          title="删除任务块"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <div className="space-y-1">
          {(data.items || []).map(item => (
            <div key={item.id} className="flex items-start gap-2 group relative pr-4">
              <button
                onClick={() => toggleItem(item.id)}
                className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 nodrag nopan ${item.completed ? 'bg-primary border-primary text-primary-foreground' : 'border-zinc-300 dark:border-zinc-600 hover:border-primary'}`}
              >
                {item.completed && <Check size={12} />}
              </button>
              <span className={`flex-1 text-sm transition-all ${item.completed ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-200'}`}>
                {item.text}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 dark:bg-zinc-800/50 backdrop-blur rounded px-1 absolute right-6 top-0">
                <button
                  onClick={() => data.onCreateSubBoard?.(item.id)}
                  className="text-zinc-400 hover:text-primary p-1 nodrag nopan"
                  title="创建子集任务卡"
                >
                  <GitBranch size={14} />
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-zinc-400 hover:text-destructive p-1 nodrag nopan"
                >
                  <X size={14} />
                </button>
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={item.id}
                className="!bg-primary !w-2.5 !h-2.5 !border-2 !border-white dark:!border-zinc-800 hover:!w-3.5 hover:!h-3.5 transition-all cursor-pointer !rounded-full opacity-0 group-hover:opacity-100"
                style={{ right: -6, top: '50%' }}
              />
            </div>
          ))}
        </div>

        <form onSubmit={addItem} className="flex gap-2 mt-2 pt-2 border-t dark:border-zinc-700/50">
          <div className="flex-1 flex items-center bg-zinc-100 dark:bg-zinc-900/50 rounded-full px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <input
              value={newItemText}
              onChange={e => setNewItemText(e.target.value)}
              className="flex-1 bg-transparent border-none text-sm focus:outline-none nodrag nopan placeholder:text-zinc-400"
              placeholder="添加任务..."
            />
            <button type="submit" className="text-primary hover:scale-110 transition-transform p-0.5 nodrag nopan" disabled={!newItemText.trim()}>
              <Plus size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

TaskBoardNode.displayName = 'TaskBoardNode';
