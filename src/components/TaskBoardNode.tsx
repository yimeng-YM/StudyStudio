import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Plus, X, Check, Trash2, GitBranch } from 'lucide-react';
import { generateUUID } from '@/lib/utils';

/**
 * 任务项数据结构
 */
export interface TaskItem {
  id: string;      // 唯一标识
  text: string;    // 任务内容
  completed: boolean; // 是否已完成
}

/**
 * 任务块节点数据结构
 */
export interface TaskBlockData {
  title: string;   // 任务块标题
  items: TaskItem[]; // 任务项列表
  onChange?: (data: Partial<TaskBlockData>) => void; // 数据变更回调
  onDelete?: () => void; // 删除任务块回调
  onCreateSubBoard?: (itemId: string) => void; // 为特定任务项创建子任务板的回调
}

/**
 * 任务板节点组件
 * 
 * 在 React Flow 画布中渲染一个功能丰富的任务列表块。
 * 核心功能：
 * 1. 标题编辑：支持直接在节点上修改任务块名称。
 * 2. 任务项管理：支持添加、勾选完成、删除单个任务项。
 * 3. 动态连接：
 *    - 四向通用连接点：支持整体层面的逻辑关联。
 *    - 任务级连接点：每个任务项右侧都有独立的连接点，支持从特定任务引出子任务或逻辑线。
 * 4. 交互：通过 z-index 和 pointer-events 处理，确保在画布拖拽和节点内部操作之间取得平衡。
 */
export const TaskBoardNode = memo(({ data, selected }: NodeProps<TaskBlockData>) => {
  const [newItemText, setNewItemText] = useState('');

  // 处理标题变更
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    data.onChange?.({ title: e.target.value });
  };

  // 添加新任务项
  const addItem = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newItemText.trim()) return;
    const newItem: TaskItem = { id: generateUUID(), text: newItemText, completed: false };
    data.onChange?.({ items: [...data.items, newItem] });
    setNewItemText('');
  };

  // 切换任务项完成状态
  const toggleItem = (id: string) => {
    const newItems = data.items.map(item =>
      item.id === id ? { ...item, completed: !item.completed } : item
    );
    data.onChange?.({ items: newItems });
  };

  // 删除任务项
  const deleteItem = (id: string) => {
    const newItems = data.items.filter(item => item.id !== id);
    data.onChange?.({ items: newItems });
  };

  return (
    <div className={`group/card bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-2xl shadow-xl border-2 min-w-[280px] transition-all duration-300 ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-zinc-100 dark:border-zinc-800'}`}>
      
      {/* 节点层面的四向连接点 - 默认隐藏，hover时显示 */}
      <Handle type="target" position={Position.Top} id="top" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0 opacity-0 group-hover/card:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Top} id="top-src" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0 opacity-0 group-hover/card:opacity-100 transition-opacity" />
      <Handle type="target" position={Position.Right} id="right" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0 opacity-0 group-hover/card:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Right} id="right-src" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0 opacity-0 group-hover/card:opacity-100 transition-opacity" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0 opacity-0 group-hover/card:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Bottom} id="bottom-src" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0 opacity-0 group-hover/card:opacity-100 transition-opacity" />
      <Handle type="target" position={Position.Left} id="left" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0 opacity-0 group-hover/card:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Left} id="left-src" className="w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full !border-0 opacity-0 group-hover/card:opacity-100 transition-opacity" />

      {/* 头部：标题与删除按钮 */}
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
          title="删除整个任务块"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* 主体：任务列表 */}
      <div className="p-3 space-y-2">
        <div className="space-y-1">
          {(data.items || []).map(item => (
            <div key={item.id} className="flex items-start gap-2 group relative pr-4">
              {/* 完成状态勾选框 */}
              <button
                onClick={() => toggleItem(item.id)}
                className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 nodrag nopan ${item.completed ? 'bg-primary border-primary text-primary-foreground' : 'border-zinc-300 dark:border-zinc-600 hover:border-primary'}`}
              >
                {item.completed && <Check size={12} />}
              </button>
              
              {/* 任务内容文本 */}
              <span className={`flex-1 text-sm transition-all ${item.completed ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-200'}`}>
                {item.text}
              </span>

              {/* 任务项操作栏 */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 dark:bg-zinc-800/50 backdrop-blur rounded px-1 absolute right-6 top-0">
                <button
                  onClick={() => data.onCreateSubBoard?.(item.id)}
                  className="text-zinc-400 hover:text-primary p-1 nodrag nopan"
                  title="为该项创建子任务板"
                >
                  <GitBranch size={14} />
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-zinc-400 hover:text-destructive p-1 nodrag nopan"
                  title="删除此项"
                >
                  <X size={14} />
                </button>
              </div>

              {/* 任务级独立的连接点：允许从特定任务引出逻辑线 */}
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

        {/* 添加新任务输入框 */}
        <form onSubmit={addItem} className="flex gap-2 mt-2 pt-2 border-t dark:border-zinc-700/50">
          <div className="flex-1 flex items-center bg-zinc-100 dark:bg-zinc-900/50 rounded-full px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <input
              value={newItemText}
              onChange={e => setNewItemText(e.target.value)}
              className="flex-1 bg-transparent border-none text-sm focus:outline-none nodrag nopan placeholder:text-zinc-400"
              placeholder="添加新任务..."
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
