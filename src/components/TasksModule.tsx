import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  BackgroundVariant,
  Panel,
  Edge,
  ReactFlowProvider,
  useReactFlow,
  SelectionMode
} from 'reactflow';
import 'reactflow/dist/style.css';
import { db, Entity } from '@/db';
import { Plus, Target } from 'lucide-react';
import { TaskBoardNode, TaskBlockData } from './TaskBoardNode';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDialog } from '@/components/ui/DialogProvider';
import { useTheme } from '@/hooks/useTheme';
import { useAIStore } from '@/store/useAIStore';
import { ViewControls } from './ViewControls';
import { useUIContext } from '@/hooks/useUIContext';

/**
 * 任务模块组件属性
 * @property {string} subjectId - 关联的学科ID
 * @property {string | null} [initialSessionId] - 初始AI会话ID
 */
interface TasksModuleProps {
  subjectId: string;
  initialSessionId?: string | null;
}

export function TasksModule({ subjectId, initialSessionId }: TasksModuleProps) {
  return (
    <ReactFlowProvider>
      <TasksModuleInner subjectId={subjectId} initialSessionId={initialSessionId} />
    </ReactFlowProvider>
  );
}

function TasksModuleInner({ subjectId, initialSessionId }: TasksModuleProps) {
  /** @type {[Node[], Function, Function]} 画布节点状态（任务清单块） */
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  /** @type {[Edge[], Function, Function]} 画布连线状态（任务依赖关系） */
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  /** @type {[Entity | null, Function]} 任务看板数据库实体对象 */
  const [boardEntity, setBoardEntity] = useState<Entity | null>(null);
  const { showConfirm } = useDialog();
  const { theme } = useTheme();
  const { setFloatingWindowOpen, setGlobalSessionId } = useAIStore();
  const { setCenter, getNode } = useReactFlow();
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  /** 获取当前学科信息 */
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId]);

  /** 注册任务模块上下文信息，供 AI 助手理解当前界面 */
  const getCustomContext = useMemo(() => {
    return () => `用户正在查看任务看板。可以使用工具来更新任务。`;
  }, []);
  
  useUIContext({
    location: 'tasks_module',
    subjectId,
    subjectName: subject?.name,
    contextId: `tasks-module-${subjectId}`,
    getCustomContext
  });

  useEffect(() => {
    if (initialSessionId) {
      setGlobalSessionId(initialSessionId);
      setFloatingWindowOpen(true);
    }
  }, [initialSessionId, setFloatingWindowOpen, setGlobalSessionId]);

  // Context for AI
  const nodeTypes = useMemo(() => ({ taskBlock: TaskBoardNode }), []);

  const liveEntity = useLiveQuery(
    () => db.entities.where({ subjectId, type: 'task_board' }).first(),
    [subjectId]
  );

  const lastSaveTimeRef = useRef<number>(0);

  /**
   * 监听看板数据实体变化并同步至画布状态
   * 包含从旧版本 'task' 类型数据迁移至新版看板格式的逻辑
   */
  useEffect(() => {
    if (liveEntity) {
      setBoardEntity(liveEntity);
      if (liveEntity.updatedAt > lastSaveTimeRef.current) {
        if (liveEntity.content) {
          setNodes(liveEntity.content.nodes || []);
          setEdges(liveEntity.content.edges || []);
        }
        lastSaveTimeRef.current = liveEntity.updatedAt;
      }
    } else {
      // 迁移逻辑：检查旧的 'task' 实体并合并到新的看板区块中
      db.entities.where({ subjectId, type: 'task' }).toArray().then(oldTasks => {
        if (oldTasks.length > 0) {
          const initNodes = [{
            id: '1',
            type: 'taskBlock',
            position: { x: 100, y: 100 },
            data: {
              title: '待办事项',
              items: oldTasks.map(t => ({
                id: t.id,
                text: t.title,
                completed: t.content?.completed || t.content?.status === 'done' || false
              }))
            }
          }];

          const newEntity: Entity = {
            id: crypto.randomUUID(),
            subjectId,
            type: 'task_board',
            title: 'Task Board',
            content: { nodes: initNodes, edges: [] },
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          db.entities.add(newEntity).then(() => {
            setBoardEntity(newEntity);
            setNodes(initNodes);
          });
        }
      });
    }
  }, [liveEntity, subjectId, setNodes, setEdges]);

  /**
   * 将当前看板节点（任务块）和连线持久化到数据库
   */
  const save = useCallback(async (currentNodes = nodes, currentEdges = edges) => {
    const now = Date.now();
    
    // 移除保存时的函数引用，仅持久化纯数据对象
    const cleanNodes = currentNodes.map(n => ({
      ...n,
      data: {
        title: n.data.title,
        items: n.data.items
      }
    }));

    if (boardEntity) {
      lastSaveTimeRef.current = now;
      await db.entities.update(boardEntity.id, {
        content: { nodes: cleanNodes, edges: currentEdges },
        updatedAt: now
      });
    } else if (currentNodes.length > 0) {
      // 如果不存在看板实体且已有节点，则创建新实体
      const newEntity: Entity = {
        id: crypto.randomUUID(),
        subjectId,
        type: 'task_board',
        title: 'Task Board',
        content: { nodes: cleanNodes, edges: currentEdges },
        createdAt: now,
        updatedAt: now
      };
      await db.entities.add(newEntity);
      setBoardEntity(newEntity);
      lastSaveTimeRef.current = now;
    }
  }, [boardEntity, nodes, edges, subjectId]);

  // 使用 Ref 追踪最新的数据，以便在卸载时保存
  const latestDataRef = useRef({ nodes, edges });
  const isDirtyRef = useRef(false);

  useEffect(() => {
    latestDataRef.current = { nodes, edges };
    isDirtyRef.current = true;
  }, [nodes, edges]);

  /** 自动保存机制，2秒防抖执行 */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isDirtyRef.current) {
        save();
        isDirtyRef.current = false;
      }
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  }, [nodes, edges, save]);

  // 卸载时立即保存
  useEffect(() => {
    return () => {
      // 检查是否有未保存的更改
      if (isDirtyRef.current) {
        const { nodes: finalNodes, edges: finalEdges } = latestDataRef.current;
        const now = Date.now();
        const cleanNodes = finalNodes.map(n => ({
          ...n,
          data: { title: n.data.title, items: n.data.items }
        }));

        db.entities.where({ subjectId, type: 'task_board' }).first().then(entity => {
          if (entity) {
            db.entities.update(entity.id, {
              content: { nodes: cleanNodes, edges: finalEdges },
              updatedAt: now
            });
          } else if (cleanNodes.length > 0) {
            db.entities.add({
              id: crypto.randomUUID(),
              subjectId,
              type: 'task_board',
              title: 'Task Board',
              content: { nodes: cleanNodes, edges: finalEdges },
              createdAt: now,
              updatedAt: now
            });
          }
        });
      }
    };
  }, [subjectId]);

  /**
   * 处理任务块内部数据（如标题、任务项）变更
   * @param {string} id - 任务块节点ID
   * @param {Partial<TaskBlockData>} dataPatch - 需要更新的数据片段
   */
  const onNodeDataChange = useCallback((id: string, dataPatch: Partial<TaskBlockData>) => {
    setNodes(nds => nds.map(node => {
      if (node.id === id) {
        return { ...node, data: { ...node.data, ...dataPatch } };
      }
      return node;
    }));
  }, [setNodes]);

  /** 删除指定任务块及其关联连线 */
  const deleteBlock = useCallback((id: string) => {
    setNodes(nds => nds.filter(n => n.id !== id));
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
  }, [setNodes, setEdges]);

  /** 在画布随机位置添加一个新的任务清单块 */
  const addBlock = useCallback(() => {
    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type: 'taskBlock',
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { title: '新任务清单', items: [] }
    };
    setNodes(nds => nds.concat(newNode));
  }, [setNodes]);

  /**
   * 为指定的任务项创建一个子任务清单块并建立逻辑连接
   * @param {string} parentNodeId - 父任务块ID
   * @param {string} itemId - 触发创建的子任务项ID
   */
  const createSubBoard = useCallback((parentNodeId: string, itemId: string) => {
    const parentNode = nodes.find(n => n.id === parentNodeId);
    if (!parentNode) return;

    const item = parentNode.data.items?.find((i: any) => i.id === itemId);
    const title = item ? `${item.text} - 子任务` : '子任务清单';

    const newNodeId = crypto.randomUUID();
    const newNode: Node = {
      id: newNodeId,
      type: 'taskBlock',
      position: { x: parentNode.position.x + 350, y: parentNode.position.y },
      data: { title, items: [] }
    };

    const newEdge: Edge = {
      id: `e-${itemId}-${newNodeId}`,
      source: parentNodeId,
      target: newNodeId,
      sourceHandle: itemId,
      targetHandle: 'left'
    };

    setNodes(nds => nds.concat(newNode));
    setEdges(eds => eds.concat(newEdge));
  }, [nodes, setNodes, setEdges]);

  /** 将业务操作方法注入到节点数据中，供自定义节点组件调用 */
  const nodesWithHandlers = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onChange: (patch: Partial<TaskBlockData>) => onNodeDataChange(node.id, patch),
        onDelete: () => deleteBlock(node.id),
        onCreateSubBoard: (itemId: string) => createSubBoard(node.id, itemId)
      }
    }));
  }, [nodes, onNodeDataChange, deleteBlock, createSubBoard]);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  /** 视口平滑移动至指定的任务块位置 */
  const jumpToNode = useCallback((nodeId: string) => {
    const node = getNode(nodeId);
    if (node) {
      setCenter(node.position.x + 150, node.position.y + 100, { zoom: 1, duration: 800 });
    }
  }, [getNode, setCenter]);

  /** 处理连线点击事件（弹出确认框后删除连接） */
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    showConfirm('确定要删除这条连接线吗？', { title: '删除连接' }).then(confirmed => {
      if (confirmed) {
        setEdges(eds => eds.filter(e => e.id !== edge.id));
      }
    });
  }, [setEdges, showConfirm]);

  const handleDeleteSelected = useCallback(() => {
    const selectedNodes = nodes.filter(n => n.selected);
    const selectedEdges = edges.filter(e => e.selected);
    
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;
    
    showConfirm(`确定要删除选中的 ${selectedNodes.length} 个任务块和 ${selectedEdges.length} 条连接线吗？`, { title: '批量删除' }).then(confirmed => {
      if (confirmed) {
        const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
        setNodes(nds => nds.filter(n => !selectedNodeIds.has(n.id)));
        setEdges(eds => eds.filter(e => !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target) && !e.selected));
      }
    });
  }, [nodes, edges, setNodes, setEdges, showConfirm]);

  /**
   * 任务完成状态的递归向下传播逻辑
   * 当某个子任务清单块中所有任务都标记为已完成时，自动将父级对应的任务项标记为已完成
   */
  useEffect(() => {
    let nodesChanged = false;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    edges.forEach(edge => {
      // 仅处理从特定任务项出发的连线
      if (!edge.sourceHandle) return;

      const targetNode = nodeMap.get(edge.target);
      const sourceNode = nodeMap.get(edge.source);
      const itemId = edge.sourceHandle;

      if (targetNode && sourceNode && itemId) {
        // 检查目标块（子看板）是否全员完成
        const allCompleted = targetNode.data.items?.length > 0 && targetNode.data.items.every((i: any) => i.completed);

        const sourceItem = sourceNode.data.items?.find((i: any) => i.id === itemId);
        if (sourceItem && sourceItem.completed !== allCompleted) {
          const newItems = sourceNode.data.items.map((i: any) => i.id === itemId ? { ...i, completed: allCompleted } : i);

          nodeMap.set(sourceNode.id, {
            ...sourceNode,
            data: { ...sourceNode.data, items: newItems }
          });
          nodesChanged = true;
        }
      }
    });

    if (nodesChanged) {
      setNodes(Array.from(nodeMap.values()));
    }
  }, [nodes, edges, setNodes]);


  return (
    <div className="flex h-full relative">
      <div className="flex-1 relative bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        <ReactFlow
          nodes={nodesWithHandlers}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          nodeTypes={nodeTypes}
          panOnDrag={!isSelectionMode}
          selectionOnDrag={isSelectionMode}
          selectionMode={SelectionMode.Partial}
          panOnScroll={isSelectionMode}
          zoomOnScroll={!isSelectionMode}
          minZoom={0.05}
          maxZoom={4}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          
          {/* Top Navigation Bar */}
          <Panel position="top-center" className="flex items-center gap-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 shadow-lg mt-4 max-w-[80vw] overflow-x-auto no-scrollbar">
            <button
              onClick={addBlock}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-medium hover:bg-blue-700 transition-colors shrink-0"
            >
              <Plus size={14} /> 添加任务块
            </button>
            
            {nodes.length > 0 && (
              <>
                <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 shrink-0" />
                
                {nodes.map(node => (
                  <button
                    key={node.id}
                    onClick={() => jumpToNode(node.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-all shrink-0 border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
                  >
                    <Target size={12} className="text-blue-500" />
                    {node.data.title || '未命名'}
                  </button>
                ))}
              </>
            )}
            
            {nodes.length === 0 && (
              <span className="text-xs text-zinc-400 px-2">暂无任务块</span>
            )}
          </Panel>

          {/* View Controls - Bottom Left */}
          <Panel position="bottom-left" className="mb-4 ml-4">
            <ViewControls 
              isSelectionMode={isSelectionMode} 
              onSelectionModeChange={setIsSelectionMode}
              onDeleteSelected={handleDeleteSelected}
              hasSelection={nodes.some(n => n.selected) || edges.some(e => e.selected)}
            />
          </Panel>

          <MiniMap
            nodeColor={() => {
              if (theme === 'dark') return '#555';
              return '#eee';
            }}
            maskColor={theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(240, 240, 240, 0.6)'}
            style={{
              borderRadius: '12px',
              overflow: 'hidden',
              border: theme === 'dark' ? '1px solid #333' : '1px solid #e2e2e2',
              backgroundColor: theme === 'dark' ? '#1a1a1a' : '#fff'
            }}
            className="shadow-lg"
          />
          
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm p-6 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center">
                <Plus className="mx-auto mb-2 text-zinc-400" size={32} />
                <p className="text-zinc-500 dark:text-zinc-400 font-medium">任务看板还是空的</p>
                <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">点击顶部的"添加任务块"开始，或让AI为你生成任务计划</p>
              </div>
            </div>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}
