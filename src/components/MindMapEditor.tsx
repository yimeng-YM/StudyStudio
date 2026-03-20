import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  BackgroundVariant,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import { db, Entity } from '@/db';
import { Save, Plus, Undo, Redo, SaveAll } from 'lucide-react';
import { CustomNode } from './CustomNode';
import { Modal } from './ui/Modal';
import { useDialog } from '@/components/ui/DialogProvider';
import { useTheme } from '@/hooks/useTheme';
import { useAIStore } from '@/store/useAIStore';
import { ViewControls } from './ViewControls';

interface MindMapEditorProps {
  subjectId: string;
  onNavigate?: (tab: 'mindmap' | 'notes' | 'tasks', params?: { noteId?: string }) => void;
  initialSessionId?: string | null;
}

const initialNodes: Node[] = [
  { id: '1', position: { x: 250, y: 250 }, data: { label: '中心主题' }, type: 'custom' },
];

export function MindMapEditor({ subjectId, onNavigate, initialSessionId }: MindMapEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [mindMapEntity, setMindMapEntity] = useState<Entity | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const { showAlert, showConfirm, showPrompt } = useDialog();
  const { theme } = useTheme();
  const { setContext, setFloatingWindowOpen } = useAIStore();

  useEffect(() => {
    if (initialSessionId) {
      setChatSessionId(initialSessionId);
      setFloatingWindowOpen(true);
    }
  }, [initialSessionId, setFloatingWindowOpen]);

  // History & AutoSave
  const [history, setHistory] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [autoSave, setAutoSave] = useState(true);

  // Task Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskLabelToAdd, setTaskLabelToAdd] = useState('');
  const [taskItemsToAdd, setTaskItemsToAdd] = useState<string[]>([]);
  const [taskBoardEntity, setTaskBoardEntity] = useState<Entity | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string>('new');
  const [newBlockName, setNewBlockName] = useState('新任务清单');

  // Custom Node Types
  const nodeTypes = useMemo(() => ({ custom: CustomNode }), []);

  // Refs for AI Context
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  // Snapshot helper
  const takeSnapshot = useCallback((newNodes?: Node[], newEdges?: Edge[]) => {
    setHistory(prev => {
      const currentNodes = newNodes || nodes;
      const currentEdges = newEdges || edges;
      const newHistory = prev.slice(0, historyIndex + 1);
      return [...newHistory, { nodes: currentNodes, edges: currentEdges }];
    });
    setHistoryIndex(prev => prev + 1);
  }, [nodes, edges, historyIndex]);

  // Initial Snapshot
  useEffect(() => {
    if (history.length === 0 && nodes.length > 0) {
      setHistory([{ nodes, edges }]);
      setHistoryIndex(0);
    }
  }, [nodes, edges, history.length]);

  const loadingRef = useRef(false);

  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const load = async () => {
      try {
        const existing = await db.entities
          .where({ subjectId, type: 'mindmap' })
          .first();

        if (existing) {
          setMindMapEntity(existing);
          if (existing.content.chatSessionId) {
            setChatSessionId(existing.content.chatSessionId);
          }

          if (existing.content) {
            const loadedNodes = (existing.content.nodes || initialNodes).map((n: any) => ({
              ...n,
              type: 'custom'
            }));
            setNodes(loadedNodes);
            setEdges(existing.content.edges || []);
          }
        } else {
          // Double check
          const checkAgain = await db.entities.where({ subjectId, type: 'mindmap' }).first();
          if (checkAgain) {
             setMindMapEntity(checkAgain);
             // Load logic...
             if (checkAgain.content) {
               setNodes((checkAgain.content.nodes || initialNodes).map((n: any) => ({ ...n, type: 'custom' })));
               setEdges(checkAgain.content.edges || []);
             }
             return;
          }

          const newEntity: Entity = {
            id: crypto.randomUUID(),
            subjectId,
            type: 'mindmap',
            title: 'Main Map',
            content: { nodes: initialNodes, edges: [] },
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          await db.entities.add(newEntity);
          setMindMapEntity(newEntity);
          setNodes(initialNodes);
        }
      } finally {
        loadingRef.current = false;
      }
    };
    load();
  }, [subjectId, setNodes, setEdges]);

  // Load task board when modal opens
  useEffect(() => {
    if (isTaskModalOpen) {
      db.entities.where({ subjectId, type: 'task_board' }).first().then(ent => {
        setTaskBoardEntity(ent || null);
        setSelectedBlockId('new');
      });
    }
  }, [isTaskModalOpen, subjectId]);

  const handleSessionChange = useCallback(async (newSessionId: string) => {
    setChatSessionId(newSessionId);
    if (mindMapEntity) {
      const content = { ...mindMapEntity.content, chatSessionId: newSessionId };
      await db.entities.update(mindMapEntity.id, { content });
    }
  }, [mindMapEntity]);

  const save = useCallback(async () => {
    if (mindMapEntity) {
      await db.entities.update(mindMapEntity.id, {
        content: { nodes, edges },
        updatedAt: Date.now()
      });
      console.log('Saved mindmap');
    }
  }, [mindMapEntity, nodes, edges]);

  // Auto-save
  useEffect(() => {
    if (!mindMapEntity || !autoSave) return;
    const timer = setTimeout(save, 2000);
    return () => clearTimeout(timer);
  }, [nodes, edges, save, mindMapEntity, autoSave]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setNodes(prev.nodes);
      setEdges(prev.edges);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setNodes(next.nodes);
      setEdges(next.edges);
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex, setNodes, setEdges]);

  // --- Node Actions ---

  const handleAddChild = useCallback((parentId: string) => {
    const parent = nodes.find(n => n.id === parentId);
    if (!parent) return;

    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type: 'custom',
      position: {
        x: parent.position.x + 200,
        y: parent.position.y + (Math.random() - 0.5) * 100
      },
      data: { label: '新节点' },
    };

    const newEdge: Edge = {
      id: `e${parentId}-${id}`,
      source: parentId,
      target: id,
    };

    const newNodes = nodes.concat(newNode);
    const newEdges = edges.concat(newEdge);

    takeSnapshot(newNodes, newEdges);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [nodes, edges, setNodes, setEdges, takeSnapshot]);

  const handleAddSibling = useCallback((nodeId: string) => {
    const incomingEdge = edges.find(e => e.target === nodeId);
    if (!incomingEdge) {
      handleAddChild(nodeId);
      return;
    }

    const parentId = incomingEdge.source;
    const parent = nodes.find(n => n.id === parentId);
    if (!parent) return;

    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type: 'custom',
      position: {
        x: parent.position.x + 200,
        y: parent.position.y + (Math.random() - 0.5) * 200
      },
      data: { label: '同级节点' }
    };
    const newEdge: Edge = {
      id: `e${parentId}-${id}`,
      source: parentId,
      target: id
    };

    const newNodes = nodes.concat(newNode);
    const newEdges = edges.concat(newEdge);

    takeSnapshot(newNodes, newEdges);
    setNodes(newNodes);
    setEdges(newEdges);

  }, [nodes, edges, setNodes, setEdges, handleAddChild, takeSnapshot]);

  const handleDelete = useCallback((id: string) => {
    const newNodes = nodes.filter((n) => n.id !== id);
    const newEdges = edges.filter((e) => e.source !== id && e.target !== id);
    takeSnapshot(newNodes, newEdges);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [nodes, edges, setNodes, setEdges, takeSnapshot]);

  const handleNote = useCallback(async (label: string) => {
    const exist = await db.entities
      .where({ subjectId, type: 'note', title: label })
      .first();

    let noteId = exist?.id;

    if (!exist) {
      const confirmed = await showConfirm(`是否为 "${label}" 创建详细知识笔记？`, { title: '新建笔记' });
      if (confirmed) {
        noteId = crypto.randomUUID();
        await db.entities.add({
          id: noteId,
          subjectId,
          type: 'note',
          title: label,
          content: '',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      } else {
        return;
      }
    }

    if (onNavigate && noteId) onNavigate('notes', { noteId });
  }, [subjectId, onNavigate, showConfirm]);

  const handleTask = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    setTaskLabelToAdd(node.data.label);
    setNewBlockName(node.data.label);

    // Find children to populate items
    const childEdges = edges.filter(e => e.source === nodeId);
    const childNodes = nodes.filter(n => childEdges.some(e => e.target === n.id));
    const childItems = childNodes.map(n => n.data.label);
    setTaskItemsToAdd(childItems);

    setIsTaskModalOpen(true);
  }, [nodes, edges]);

  const confirmAddTask = async () => {
    let entity = taskBoardEntity;
    let nodes = entity?.content?.nodes || [];
    let edges = entity?.content?.edges || [];
    let chatSessionId = entity?.content?.chatSessionId;

    if (!entity) {
      const id = crypto.randomUUID();
      chatSessionId = crypto.randomUUID();
      await db.chatSessions.add({
        id: chatSessionId,
        title: `Task Board Chat`,
        entityId: id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      entity = {
        id,
        subjectId,
        type: 'task_board',
        title: 'Task Board',
        content: { nodes: [], edges: [], chatSessionId },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      nodes = [];
    }

    const itemsToAdd = taskItemsToAdd.length > 0
      ? taskItemsToAdd.map(t => ({ id: crypto.randomUUID(), text: t, completed: false }))
      : [{ id: crypto.randomUUID(), text: taskLabelToAdd, completed: false }];

    if (selectedBlockId === 'new') {
      const newNode = {
        id: crypto.randomUUID(),
        type: 'taskBlock',
        position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
        data: { title: newBlockName, items: itemsToAdd }
      };
      nodes.push(newNode);
    } else {
      const nodeIndex = nodes.findIndex((n: any) => n.id === selectedBlockId);
      if (nodeIndex !== -1) {
        const node = nodes[nodeIndex];
        const items = node.data.items || [];
        nodes[nodeIndex] = {
          ...node,
          data: { ...node.data, items: [...items, ...itemsToAdd] }
        };
      }
    }

    if (taskBoardEntity) {
      await db.entities.update(entity.id, {
        content: { nodes, edges, chatSessionId: entity.content?.chatSessionId || chatSessionId },
        updatedAt: Date.now()
      });
    } else {
      await db.entities.add(entity);
    }

    setIsTaskModalOpen(false);
    setTaskLabelToAdd('');
    setTaskItemsToAdd([]);
    showAlert('已添加到任务清单', { title: '成功' });
  };

  const handleAddRootNode = useCallback(() => {
    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type: 'custom',
      position: { x: window.innerWidth / 2 - 75, y: window.innerHeight / 2 - 25 },
      data: { label: '中心主题' },
    };
    const newNodes = nodes.concat(newNode);
    takeSnapshot(newNodes, edges);
    setNodes(newNodes);
  }, [nodes, edges, setNodes, takeSnapshot]);

  // Inject handlers into node data
  const nodesWithHandlers = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onAddChild: () => handleAddChild(node.id),
        onAddSibling: () => handleAddSibling(node.id),
        onDelete: () => handleDelete(node.id),
        onNote: () => handleNote(node.data.label),
        onTask: () => handleTask(node.id),
      },
    }));
  }, [nodes, handleAddChild, handleAddSibling, handleDelete, handleNote, handleTask]);


  const onConnect = useCallback((params: Connection) => {
    const newEdges = addEdge(params, edges);
    takeSnapshot(nodes, newEdges);
    setEdges(newEdges);
  }, [nodes, edges, setEdges, takeSnapshot]);

  const onNodeDoubleClick = useCallback(async (_: React.MouseEvent, node: Node) => {
    const label = await showPrompt("输入新标签:", node.data.label, { title: "编辑节点" });
    if (label !== null) {
      const newNodes = nodes.map((n) => {
        if (n.id === node.id) {
          return { ...n, data: { ...n.data, label } };
        }
        return n;
      });
      takeSnapshot(newNodes, edges);
      setNodes(newNodes);
    }
  }, [nodes, edges, setNodes, showPrompt, takeSnapshot]);

  const onNodeDragStop = useCallback(() => {
    takeSnapshot(); // Use current state as drag is already applied
  }, [takeSnapshot]);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    showConfirm('确定要删除这条连接线吗？', { title: '删除连接' }).then(confirmed => {
      if (confirmed) {
        const newEdges = edges.filter(e => e.id !== edge.id);
        takeSnapshot(nodes, newEdges);
        setEdges(newEdges);
      }
    });
  }, [edges, nodes, setEdges, showConfirm, takeSnapshot]);



  const handleAICommand = useCallback(async (command: any) => {
    if (command.action === 'update_map' && Array.isArray(command.nodes) && Array.isArray(command.edges)) {
      const newNodes = command.nodes.map((n: any) => ({ ...n, type: 'custom' }));
      const newEdges = command.edges;
      takeSnapshot(newNodes, newEdges);
      setNodes(newNodes);
      setEdges(newEdges);
      showAlert('思维导图已更新', { title: '成功' });
    }
  }, [setNodes, setEdges, showAlert, takeSnapshot]);

  // Register AI Context
  useEffect(() => {
    if (!mindMapEntity) return; // Wait for entity

    const getSystemContext = () => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const structure = currentNodes.map(n => {
        const children = currentEdges.filter(e => e.source === n.id).map(e => e.target);
        return `${n.data.label} (ID: ${n.id}) -> Children: [${children.join(', ')}]`;
      }).join('\n');

      return `Current Mind Map Structure:\n${structure}\n
You are a Mind Map Assistant. You can modify the mind map.
To update the mind map, respond with a JSON block in the following format:
\`\`\`json
{
  "action": "update_map",
  "nodes": [ { "id": "...", "type": "custom", "position": { "x": 0, "y": 0 }, "data": { "label": "..." } } ],
  "edges": [ { "id": "...", "source": "...", "target": "..." } ]
}
\`\`\`
Ensure specific positions for nodes so they don't overlap.
Do NOT include any comments (like // or /* */) inside the JSON block.
If user asks to generate a new map, provide a complete new structure.
If user asks to modify, provide the updated full structure (nodes + edges).
`;
    };

    setContext({
      id: mindMapEntity.id, // Use REAL entity ID
      sourceType: 'mindmap',
      sessionId: chatSessionId,
      onSessionChange: handleSessionChange,
      getSystemContext,
      handleCommand: handleAICommand
    });

    return () => setContext(null);
  }, [mindMapEntity, chatSessionId, handleSessionChange, handleAICommand, setContext]);

  return (
    <div style={{ width: '100%', height: '100%' }} className="relative">
      <ReactFlow
        nodes={nodesWithHandlers}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <ViewControls />
        <MiniMap
          nodeColor={theme === 'dark' ? '#27272a' : '#e2e8f0'}
          maskColor={theme === 'dark' ? 'rgba(9, 9, 11, 0.7)' : 'rgba(240, 242, 245, 0.7)'}
          style={{ backgroundColor: theme === 'dark' ? '#000000' : '#fff' }}
        />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Panel position="top-right" className="flex gap-2">
          <button onClick={handleUndo} disabled={historyIndex <= 0} className="bg-white dark:bg-zinc-800 p-2 rounded shadow hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 disabled:opacity-50" title="撤销">
            <Undo size={20} />
          </button>
          <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="bg-white dark:bg-zinc-800 p-2 rounded shadow hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 disabled:opacity-50" title="恢复">
            <Redo size={20} />
          </button>
          <div className="w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />
          <button onClick={handleAddRootNode} className="bg-white dark:bg-zinc-800 p-2 rounded shadow hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200" title="添加根节点">
            <Plus size={20} />
          </button>
          <button onClick={() => setAutoSave(!autoSave)} className={`bg-white dark:bg-zinc-800 p-2 rounded shadow hover:bg-zinc-50 dark:hover:bg-zinc-700 ${autoSave ? 'text-green-600' : 'text-zinc-400'}`} title={autoSave ? "自动保存已开启" : "自动保存已关闭"}>
            <SaveAll size={20} />
          </button>
          <button onClick={save} className="bg-white dark:bg-zinc-800 p-2 rounded shadow hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200" title="手动保存">
            <Save size={20} />
          </button>
        </Panel>
      </ReactFlow>

      {/* Task Selection Modal */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title="添加到任务清单"
        footer={
          <>
            <button onClick={() => setIsTaskModalOpen(false)} className="px-4 py-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors">取消</button>
            <button onClick={confirmAddTask} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">确定</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">选中节点</label>
            <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-800 dark:text-zinc-200 border dark:border-zinc-700">
              {taskLabelToAdd}
            </div>
            {taskItemsToAdd.length > 0 && (
              <div className="mt-2 text-xs text-zinc-500">
                包含 {taskItemsToAdd.length} 个子节点，将自动添加为子任务。
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">选择任务块</label>
            <select
              className="w-full border rounded p-2 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
              value={selectedBlockId}
              onChange={(e) => setSelectedBlockId(e.target.value)}
            >
              <option value="new">-- 新建任务块 --</option>
              {taskBoardEntity?.content?.nodes?.map((node: any) => (
                <option key={node.id} value={node.id}>{node.data.title || '未命名任务块'}</option>
              ))}
            </select>
          </div>

          {selectedBlockId === 'new' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">新任务块名称</label>
              <input
                className="w-full border rounded p-2 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newBlockName}
                onChange={(e) => setNewBlockName(e.target.value)}
                placeholder="例如：待办事项"
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
