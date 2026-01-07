import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Plus, Trash2, FileText, GitBranchPlus, CheckSquare } from 'lucide-react';

export const CustomNode = memo(({ data, isConnectable }: NodeProps) => {
  return (
    <div className="group relative">
      <div className="px-4 py-2 shadow-md rounded-md bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-blue-500 transition-colors min-w-[100px] text-center">
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{data.label}</div>
      </div>
      
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="!bg-slate-400" />
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="!bg-slate-400" />

      {/* Action Buttons - Visible on hover */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 flex gap-1 bg-white dark:bg-slate-800 p-1 rounded-md shadow-lg border dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button 
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-blue-600"
          onClick={(e) => { e.stopPropagation(); data.onAddChild(); }}
          title="新增子节点"
        >
          <GitBranchPlus size={14} />
        </button>
        <button 
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-green-600"
          onClick={(e) => { e.stopPropagation(); data.onAddSibling(); }}
          title="新增同级节点"
        >
          <Plus size={14} />
        </button>
        <button 
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-amber-600"
          onClick={(e) => { e.stopPropagation(); data.onNote(); }}
          title="转到笔记/详细知识"
        >
          <FileText size={14} />
        </button>
        <button 
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-purple-600"
          onClick={(e) => { e.stopPropagation(); data.onTask(); }}
          title="添加到任务清单"
        >
          <CheckSquare size={14} />
        </button>
        <button 
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-red-600"
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
