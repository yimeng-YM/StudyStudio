import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Plus, Trash2, FileText, GitBranchPlus, CheckSquare, Pencil } from 'lucide-react';

/**
 * 自定义思维导图节点组件
 *
 * 为 React Flow 提供定制化的节点 UI。
 * 桌面端：hover 显示连接点 + 操作工具栏
 * 移动端：点击节点显示工具栏，连接点始终可操作（透明度降低但可点击）
 */
export const CustomNode = memo(({ data, isConnectable }: NodeProps) => {
  const [showToolbar, setShowToolbar] = useState(false);

  return (
    <div
      className="group relative"
      onTouchStart={() => {
        setShowToolbar(prev => !prev);
      }}
    >
      {/* 节点主体容器 */}
      <div className="px-4 py-2 shadow-md rounded-md bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 hover:border-blue-500 transition-colors min-w-[100px] text-center">
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{data.label}</div>
      </div>

      {/* 四向连接点 */}
      {/* 顶部 */}
      <Handle type="target" position={Position.Top} id="top-t" isConnectable={isConnectable}
        style={{ left: '50%', transform: 'translateX(-50%)', top: -4 }}
        className="!bg-zinc-400 w-2.5 h-2.5 border-2 border-white dark:border-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Top} id="top-s" isConnectable={isConnectable}
        style={{ left: '50%', transform: 'translateX(-50%)', top: -4 }}
        className="w-2.5 h-2.5 border-2 border-white dark:border-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* 底部 */}
      <Handle type="target" position={Position.Bottom} id="bottom-t" isConnectable={isConnectable}
        style={{ left: '50%', transform: 'translateX(-50%)', bottom: -4 }}
        className="!bg-zinc-400 w-2.5 h-2.5 border-2 border-white dark:border-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Bottom} id="bottom-s" isConnectable={isConnectable}
        style={{ left: '50%', transform: 'translateX(-50%)', bottom: -4 }}
        className="w-2.5 h-2.5 border-2 border-white dark:border-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* 左侧 */}
      <Handle type="target" position={Position.Left} id="left-t" isConnectable={isConnectable}
        style={{ top: '50%', transform: 'translateY(-50%)', left: -4 }}
        className="!bg-zinc-400 w-2.5 h-2.5 border-2 border-white dark:border-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Left} id="left-s" isConnectable={isConnectable}
        style={{ top: '50%', transform: 'translateY(-50%)', left: -4 }}
        className="w-2.5 h-2.5 border-2 border-white dark:border-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* 右侧 */}
      <Handle type="target" position={Position.Right} id="right-t" isConnectable={isConnectable}
        style={{ top: '50%', transform: 'translateY(-50%)', right: -4 }}
        className="!bg-zinc-400 w-2.5 h-2.5 border-2 border-white dark:border-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Right} id="right-s" isConnectable={isConnectable}
        style={{ top: '50%', transform: 'translateY(-50%)', right: -4 }}
        className="w-2.5 h-2.5 border-2 border-white dark:border-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* 操作工具栏 - 桌面端 hover 显示，移动端点击显示 */}
      <div
        className={`
          absolute top-full left-1/2 -translate-x-1/2 mt-2 flex gap-1 bg-white dark:bg-zinc-800 p-1 rounded-md shadow-lg border dark:border-zinc-700 z-10
          transition-all duration-150
          opacity-0 group-hover:opacity-100
          ${showToolbar ? '!opacity-100' : ''}
        `}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-blue-600"
          onClick={(e) => { e.stopPropagation(); setShowToolbar(false); data.onEdit?.(); }}
          title="编辑节点"
        >
          <Pencil size={14} />
        </button>
        <button
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-blue-600"
          onClick={(e) => { e.stopPropagation(); setShowToolbar(false); data.onAddChild(); }}
          title="新增子节点"
        >
          <GitBranchPlus size={14} />
        </button>
        <button
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-green-600"
          onClick={(e) => { e.stopPropagation(); setShowToolbar(false); data.onAddSibling(); }}
          title="新增同级节点"
        >
          <Plus size={14} />
        </button>
        <button
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-amber-600"
          onClick={(e) => { e.stopPropagation(); setShowToolbar(false); data.onNote(); }}
          title="查看/关联笔记"
        >
          <FileText size={14} />
        </button>
        <button
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-purple-600"
          onClick={(e) => { e.stopPropagation(); setShowToolbar(false); data.onTask(); }}
          title="添加到任务清单"
        >
          <CheckSquare size={14} />
        </button>
        <button
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-red-600"
          onClick={(e) => { e.stopPropagation(); setShowToolbar(false); data.onDelete(); }}
          title="删除节点"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
