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
  Edge
} from 'reactflow';
import 'reactflow/dist/style.css';
import { db, Entity } from '@/db';
import { Save, Plus, SaveAll } from 'lucide-react';
import { TaskBoardNode, TaskBlockData } from './TaskBoardNode';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDialog } from '@/components/ui/DialogProvider';
import { useTheme } from '@/hooks/useTheme';
import { useAIStore } from '@/store/useAIStore';
import { ViewControls } from './ViewControls';

interface TasksModuleProps {
  subjectId: string;
  initialSessionId?: string | null;
}

const initialNodes: Node[] = [
  { id: '1', type: 'taskBlock', position: { x: 100, y: 100 }, data: { title: '待办事项', items: [] } },
];

export function TasksModule({ subjectId, initialSessionId }: TasksModuleProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [boardEntity, setBoardEntity] = useState<Entity | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const { showAlert, showConfirm } = useDialog();
  const { theme } = useTheme();
  const [autoSave, setAutoSave] = useState(true);
  const { setContext, setFloatingWindowOpen } = useAIStore();

  useEffect(() => {
    if (initialSessionId) {
      setChatSessionId(initialSessionId);
      setFloatingWindowOpen(true);
    }
  }, [initialSessionId, setFloatingWindowOpen]);

  // Context for AI
  const mindMapEntity = useLiveQuery(() => db.entities.where({ subjectId, type: 'mindmap' }).first(), [subjectId]);
  const noteEntities = useLiveQuery(() => db.entities.where({ subjectId, type: 'note' }).toArray(), [subjectId]);

  const nodeTypes = useMemo(() => ({ taskBlock: TaskBoardNode }), []);

  useEffect(() => {
    const load = async () => {
      // Try to load existing task_board
      const existing = await db.entities
        .where({ subjectId, type: 'task_board' })
        .first();

      if (existing) {
        setBoardEntity(existing);
        if (existing.content) {
          setNodes(existing.content.nodes || []);
          setEdges(existing.content.edges || []);
        }
        if (existing.content.chatSessionId) {
          setChatSessionId(existing.content.chatSessionId);
        }
      } else {
        // Migration logic: Check for old 'task' entities
        const oldTasks = await db.entities.where({ subjectId, type: 'task' }).toArray();
        let initNodes = [...initialNodes];

        if (oldTasks.length > 0) {
          initNodes[0].data.items = oldTasks.map(t => ({
            id: t.id, // preserve ID if possible or new UUID
            text: t.title,
            completed: t.content?.completed || t.content?.status === 'done' || false
          }));
        }

        const sessionId = crypto.randomUUID();
        await db.chatSessions.add({
          id: sessionId,
          title: `Task Board Chat`,
          entityId: undefined, // Will be set when entity is created
          createdAt: Date.now(),
          updatedAt: Date.now()
        });

        const newEntity: Entity = {
          id: crypto.randomUUID(),
          subjectId,
          type: 'task_board', // New type
          title: 'Task Board',
          content: { nodes: initNodes, edges: [], chatSessionId: sessionId },
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        // Update session entityId
        await db.chatSessions.update(sessionId, { entityId: newEntity.id });

        await db.entities.add(newEntity);
        setBoardEntity(newEntity);
        setNodes(initNodes);
        setChatSessionId(sessionId);
      }
    };
    load();
  }, [subjectId, setNodes, setEdges]);

  const handleSessionChange = useCallback(async (newSessionId: string) => {
    setChatSessionId(newSessionId);
    if (boardEntity) {
      const content = { ...boardEntity.content, chatSessionId: newSessionId };
      await db.entities.update(boardEntity.id, { content });
    }
  }, [boardEntity]);

  const save = useCallback(async () => {
    if (boardEntity) {
      // Strip functions from data before saving
      const cleanNodes = nodes.map(n => ({
        ...n,
        data: {
          title: n.data.title,
          items: n.data.items
        }
      }));

      await db.entities.update(boardEntity.id, {
        content: { nodes: cleanNodes, edges, chatSessionId }, // persist current chatSessionId
        updatedAt: Date.now()
      });
      console.log('Saved task board');
    }
  }, [boardEntity, nodes, edges, chatSessionId]);

  // Auto-save
  useEffect(() => {
    if (!boardEntity || !autoSave) return;
    const timer = setTimeout(save, 2000);
    return () => clearTimeout(timer);
  }, [nodes, edges, save, boardEntity, autoSave]);

  const onNodeDataChange = useCallback((id: string, dataPatch: Partial<TaskBlockData>) => {
    setNodes(nds => nds.map(node => {
      if (node.id === id) {
        return { ...node, data: { ...node.data, ...dataPatch } };
      }
      return node;
    }));
  }, [setNodes]);

  const deleteBlock = useCallback((id: string) => {
    setNodes(nds => nds.filter(n => n.id !== id));
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
  }, [setNodes, setEdges]);

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

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    showConfirm('确定要删除这条连接线吗？', { title: '删除连接' }).then(confirmed => {
      if (confirmed) {
        setEdges(eds => eds.filter(e => e.id !== edge.id));
      }
    });
  }, [setEdges, showConfirm]);

  // Auto-completion propagation
  useEffect(() => {
    let nodesChanged = false;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    edges.forEach(edge => {
      // Only propagate if edge comes from an Item (sourceHandle exists)
      if (!edge.sourceHandle) return;

      const targetNode = nodeMap.get(edge.target);
      const sourceNode = nodeMap.get(edge.source);
      const itemId = edge.sourceHandle;

      if (targetNode && sourceNode && itemId) {
        // Check if all items in target are completed
        const allCompleted = targetNode.data.items?.length > 0 && targetNode.data.items.every((i: any) => i.completed);

        const sourceItem = sourceNode.data.items?.find((i: any) => i.id === itemId);
        if (sourceItem && sourceItem.completed !== allCompleted) {
          // Update source node item
          const newItems = sourceNode.data.items.map((i: any) => i.id === itemId ? { ...i, completed: allCompleted } : i);

          // We update the node object in map, but we need to trigger setNodes at end
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


  // AI Command Handler
  const handleAICommand = useCallback(async (command: any) => {
    if (command.action === 'create_task_blocks' && Array.isArray(command.blocks)) {
      const newNodes: Node[] = command.blocks.map((block: any, i: number) => ({
        id: block.id || crypto.randomUUID(), // Allow AI to specify ID for linking
        type: 'taskBlock',
        position: { x: 100 + i * 320, y: 100 },
        data: {
          title: block.title || 'AI Generated List',
          items: Array.isArray(block.items) ? block.items.map((txt: string) => ({
            id: crypto.randomUUID(),
            text: txt,
            completed: false
          })) : []
        }
      }));

      let newEdges: Edge[] = [];
      if (Array.isArray(command.edges)) {
        newEdges = command.edges.map((e: any) => ({
          id: `e-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle
        }));
      }

      setNodes(nds => [...nds, ...newNodes]);
      setEdges(eds => [...eds, ...newEdges]);
      showAlert(`已生成 ${newNodes.length} 个任务块`, { title: '成功' });

    } else if (command.action === 'delete_task_block' && command.title) {
      // Fuzzy delete by title
      setNodes(nds => {
        const toDelete = nds.filter(n => n.data.title?.includes(command.title));
        if (toDelete.length > 0) {
          return nds.filter(n => !toDelete.includes(n));
        }
        return nds;
      });
    } else if (command.action === 'update_task_block' && command.blockTitle) {
      setNodes(nds => nds.map(n => {
        if (n.data.title?.includes(command.blockTitle)) {
          let newItems = [...(n.data.items || [])];

          if (Array.isArray(command.addItems)) {
            const itemsToAdd = command.addItems.map((txt: string) => ({
              id: crypto.randomUUID(),
              text: txt,
              completed: false
            }));
            newItems = [...newItems, ...itemsToAdd];
          }

          if (Array.isArray(command.removeItems)) {
            newItems = newItems.filter(item =>
              !command.removeItems.some((rm: string) => item.text.includes(rm))
            );
          }

          return {
            ...n,
            data: {
              ...n.data,
              items: newItems,
              title: command.newTitle || n.data.title
            }
          };
        }
        return n;
      }));
      showAlert('任务块已更新', { title: '成功' });
    }
  }, [setNodes, setEdges, showAlert]);

  // Context refs
  const nodesRef = useRef(nodes);
  const mindMapRef = useRef(mindMapEntity);
  const notesRef = useRef(noteEntities);

  useEffect(() => {
    nodesRef.current = nodes;
    mindMapRef.current = mindMapEntity;
    notesRef.current = noteEntities;
  }, [nodes, mindMapEntity, noteEntities]);

  // Register AI Context
  useEffect(() => {
    if (!boardEntity) return; // Wait for entity

    const getSystemContext = () => {
      const _nodes = nodesRef.current;
      const _mindMap = mindMapRef.current;
      const _notes = notesRef.current;

      let context = `You are a Task Management Assistant helping user organize tasks based on their study material.\n\n`;

      const currentBoard = _nodes.map(n =>
        `Block: ${n.data.title} (ID: ${n.id})\nItems: ${n.data.items?.map((i: any) => i.text + (i.completed ? '[x]' : '[ ]')).join(', ')}`
      ).join('\n\n');
      context += `Current Task Board:\n${currentBoard}\n\n`;

      if (_mindMap && _mindMap.content && _mindMap.content.nodes) {
        const mapNodes = _mindMap.content.nodes as any[];
        const structure = mapNodes.map(n => n.data.label).join(', ');
        context += `Related Mind Map Topics:\n${structure}\n\n`;
      }

      if (_notes && _notes.length > 0) {
        const notesSummary = _notes.map(n => `Note "${n.title}": ${n.content.slice(0, 100)}...`).join('\n');
        context += `Related Notes Previews:\n${notesSummary}\n\n`;
      }

      context += `
    Based on the mind map and notes, suggest tasks or study plans.
    To CREATE task blocks, respond with a JSON block:
    \`\`\`json
    {
    "action": "create_task_blocks",
    "blocks": [
        { 
        "id": "block1", "title": "Block Title", 
        "items": ["Task 1", "Task 2"] 
        },
        { "id": "block2", "title": "Sub Tasks", "items": ["Sub 1"] }
    ],
    "edges": [
        { "source": "block1", "target": "block2", "sourceHandle": "item_id_if_known", "targetHandle": "left" }
    ]
    }
    \`\`\`
    (Note: Linking to specific items requires knowing item IDs, which is hard for AI unless updating existing ones. Linking blocks genericly is fine).

    To UPDATE/DELETE:
    ... (same as before)
    `;
      return context;
    };

    setContext({
      id: boardEntity.id, // Use REAL entity ID
      sourceType: 'task',
      sessionId: chatSessionId,
      onSessionChange: handleSessionChange,
      getSystemContext,
      handleCommand: handleAICommand
    });

    return () => setContext(null);
  }, [boardEntity, chatSessionId, handleSessionChange, handleAICommand, setContext]);


  return (
    <div style={{ width: '100%', height: '100%' }} className="relative bg-zinc-50 dark:bg-black">
      <ReactFlow
        nodes={nodesWithHandlers}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
          {/* AI Button Removed */}
          <button onClick={addBlock} className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur p-2.5 rounded-xl shadow-sm border border-zinc-200/50 dark:border-zinc-800/50 hover:bg-white dark:hover:bg-zinc-800 hover:scale-105 transition-all text-zinc-700 dark:text-zinc-200" title="添加任务块">
            <Plus size={20} />
          </button>
          <button onClick={() => setAutoSave(!autoSave)} className={`bg-white/80 dark:bg-zinc-900/80 backdrop-blur p-2.5 rounded-xl shadow-sm border border-zinc-200/50 dark:border-zinc-800/50 hover:bg-white dark:hover:bg-zinc-800 hover:scale-105 transition-all ${autoSave ? 'text-green-500' : 'text-zinc-400'}`} title={autoSave ? "自动保存已开启" : "自动保存已关闭"}>
            <SaveAll size={20} />
          </button>
          <button onClick={save} className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur p-2.5 rounded-xl shadow-sm border border-zinc-200/50 dark:border-zinc-800/50 hover:bg-white dark:hover:bg-zinc-800 hover:scale-105 transition-all text-zinc-700 dark:text-zinc-200" title="手动保存">
            <Save size={20} />
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
