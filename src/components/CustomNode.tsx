import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Plus, Trash2, FileText, GitBranchPlus, CheckSquare } from 'lucide-react';

export const CustomNode = memo(({ data, isConnectable }: NodeProps) => {
  return (
    <div className="group relative">
      <div className="px-4 py-2 shadow-md rounded-md bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 hover:border-blue-500 transition-colors min-w-[100px] text-center">
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{data.label}</div>
      </div>

      {/* 四向连接点 (双向支持，强制完全重合以解决对齐问题) - 默认隐藏，hover时显示 */}
      {/* Top */}
      <Handle type="target" position={Position.Top} id="top-t" isConnectable={isConnectable}
        style={{ left: '50%', transform: 'translateX(-50%)', top: -4 }}
        className="!bg-zinc-400 w-2 h-2 border-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Top} id="top-s" isConnectable={isConnectable}
        style={{ left: '50%', transform: 'translateX(-50%)', top: -4 }}
        className="w-2 h-2 border-none opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {/* Bottom */}
      <Handle type="target" position={Position.Bottom} id="bottom-t" isConnectable={isConnectable}
        style={{ left: '50%', transform: 'translateX(-50%)', bottom: -4 }}
        className="!bg-zinc-400 w-2 h-2 border-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Bottom} id="bottom-s" isConnectable={isConnectable}
        style={{ left: '50%', transform: 'translateX(-50%)', bottom: -4 }}
        className="w-2 h-2 border-none opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {/* Left */}
      <Handle type="target" position={Position.Left} id="left-t" isConnectable={isConnectable}
        style={{ top: '50%', transform: 'translateY(-50%)', left: -4 }}
        className="!bg-zinc-400 w-2 h-2 border-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Left} id="left-s" isConnectable={isConnectable}
        style={{ top: '50%', transform: 'translateY(-50%)', left: -4 }}
        className="w-2 h-2 border-none opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {/* Right */}
      <Handle type="target" position={Position.Right} id="right-t" isConnectable={isConnectable}
        style={{ top: '50%', transform: 'translateY(-50%)', right: -4 }}
        className="!bg-zinc-400 w-2 h-2 border-none opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Right} id="right-s" isConnectable={isConnectable}
        style={{ top: '50%', transform: 'translateY(-50%)', right: -4 }}
        className="w-2 h-2 border-none opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Action Buttons - Visible on hover */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 flex gap-1 bg-white dark:bg-zinc-800 p-1 rounded-md shadow-lg border dark:border-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-blue-600"
          onClick={(e) => { e.stopPropagation(); data.onAddChild(); }}
          title="新增子节点"
        >
          <GitBranchPlus size={14} />
        </button>
        <button
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-green-600"
          onClick={(e) => { e.stopPropagation(); data.onAddSibling(); }}
          title="新增同级节点"
        >
          <Plus size={14} />
        </button>
        <button
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-amber-600"
          onClick={(e) => { e.stopPropagation(); data.onNote(); }}
          title="转到笔记/详细知识"
        >
          <FileText size={14} />
        </button>
        <button
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-purple-600"
          onClick={(e) => { e.stopPropagation(); data.onTask(); }}
          title="添加到任务清单"
        >
          <CheckSquare size={14} />
        </button>
        <button
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-red-600"
          onClick={(e) => { e.stopPropagation(); data.onDelete(); }}
          title="删除"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
