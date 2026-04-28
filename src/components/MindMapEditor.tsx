import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  Panel,
  ReactFlowProvider,
  useReactFlow,
  SelectionMode
} from 'reactflow';
import 'reactflow/dist/style.css';
import { db, Entity } from '@/db';
import { Plus, Target, ArrowRight, ArrowDown, ArrowUp, ArrowLeft, GitBranch, ChevronDown, Layout as LayoutIcon } from 'lucide-react';
import { CustomNode } from './CustomNode';
import { Modal } from './ui/Modal';
import { useDialog } from '@/components/ui/DialogProvider';
import { useTheme } from '@/hooks/useTheme';
import { useAIStore } from '@/store/useAIStore';
import { ViewControls } from './ViewControls';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMindMapContext } from '@/hooks/useUIContext';
import * as dagre from 'dagre';
import { cn, generateUUID } from '@/lib/utils';

/**
 * 思维导图编辑器组件属性
 * @property {string} subjectId - 关联的学科ID
 * @property {Function} [onNavigate] - 模块间导航回调函数
 * @property {string | null} [initialSessionId] - 初始AI会话ID，用于打开指定的AI聊天
 */
interface MindMapEditorProps {
  subjectId: string;
  onNavigate?: (tab: 'mindmap' | 'notes' | 'tasks', params?: { noteId?: string }) => void;
  initialSessionId?: string | null;
}

const initialNodes: Node[] = [];

export function MindMapEditor(props: MindMapEditorProps) {
  return (
    <ReactFlowProvider>
      <MindMapInner {...props} />
    </ReactFlowProvider>
  );
}

function MindMapInner({ subjectId, onNavigate, initialSessionId }: MindMapEditorProps) {
  /** @type {[Node[], Function, Function]} 画布节点状态管理 */
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  /** @type {[Edge[], Function, Function]} 画布连线状态管理 */
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { setCenter, fitView } = useReactFlow();
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [layoutMenuPos, setLayoutMenuPos] = useState({ left: 0, bottom: 0 });
  /** @type {[string | null, Function]} 当前选中的思维导图记录ID */
  const [selectedMindMapId, setSelectedMindMapId] = useState<string | null>(null);
  const { showAlert, showConfirm, showPrompt } = useDialog();
  const { theme } = useTheme();
  const { setFloatingWindowOpen, setGlobalSessionId } = useAIStore();

  /** 获取当前学科信息 */
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId]);

  useEffect(() => {
    if (initialSessionId) {
      setGlobalSessionId(initialSessionId);
      setFloatingWindowOpen(true);
    }
  }, [initialSessionId, setFloatingWindowOpen, setGlobalSessionId]);

  /** @type {[{ nodes: Node[], edges: Edge[] }[], Function]} 撤销/重做历史记录栈 */
  const [history, setHistory] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);
  /** @type {[number, Function]} 当前所处的历史记录索引 */
  const [historyIndex, setHistoryIndex] = useState(-1);
  /** @type {[boolean, Function]} 是否开启自动保存 */
  const [autoSave] = useState(true);

  /** @type {[boolean, Function]} 转换为任务模态框显示状态 */
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  /** @type {[string, Function]} 待添加的任务标签 */
  const [taskLabelToAdd, setTaskLabelToAdd] = useState('');
  /** @type {[string[], Function]} 待添加的子任务项集合 */
  const [taskItemsToAdd, setTaskItemsToAdd] = useState<string[]>([]);
  /** @type {[Entity | null, Function]} 任务看板数据库实体对象 */
  const [taskBoardEntity, setTaskBoardEntity] = useState<Entity | null>(null);
  /** @type {[string, Function]} 选择添加到的目标任务块ID */
  const [selectedBlockId, setSelectedBlockId] = useState<string>('new');
  /** @type {[string, Function]} 新建任务清单名称 */
  const [newBlockName, setNewBlockName] = useState('新任务清单');

  const nodeTypes = useMemo(() => ({ custom: CustomNode }), []);

  const mindMaps = useLiveQuery(
    () => db.entities.where({ subjectId, type: 'mindmap' }).toArray(),
    [subjectId]
  );

  const selectedMindMap = useMemo(() => 
    mindMaps?.find((m: any) => m.id === selectedMindMapId) || null,
    [mindMaps, selectedMindMapId]
  );

  /**
   * 自动选择或初始化第一个思维导图数据
   * 若当前学科下没有思维导图记录，则自动生成一条默认记录并选中
   */
  useEffect(() => {
    if (mindMaps && mindMaps.length > 0 && !selectedMindMapId) {
      setSelectedMindMapId(mindMaps[0].id);
    } else if (mindMaps && mindMaps.length === 0) {
      const id = generateUUID();
      const now = Date.now();
      db.entities.add({
        id,
        subjectId,
        type: 'mindmap',
        title: '我的思维导图',
        content: { nodes: initialNodes, edges: [] },
        createdAt: now,
        updatedAt: now,
        lastAccessed: now,
        order: now
      }).then(() => setSelectedMindMapId(id));
    }
  }, [mindMaps, selectedMindMapId, subjectId]);

  const lastSaveTimeRef = useRef<number>(0);

  /**
   * 监听选中的思维导图数据变化并同步至本地状态
   * 只有当数据库中的更新时间大于本地最后保存时间时才会触发节点和连线状态更新，
   * 同时初始化历史记录（用于撤销/重做机制）。
   */
  useEffect(() => {
    if (selectedMindMap) {
      if (selectedMindMap.updatedAt > lastSaveTimeRef.current) {
        const content = selectedMindMap.content || { nodes: initialNodes, edges: [] };
        
        setNodes((content.nodes || []).map((n: any) => ({
          ...n,
          type: 'custom'
        })));
        setEdges(content.edges || []);
        
        if (history.length <= 1 || selectedMindMap.updatedAt > lastSaveTimeRef.current + 1000) {
          setHistory([{ nodes: content.nodes || [], edges: content.edges || [] }]);
          setHistoryIndex(0);
        }
        
        lastSaveTimeRef.current = selectedMindMap.updatedAt;
      }
    }
  }, [selectedMindMap, setNodes, setEdges]);

  /**
   * 保存当前导图快照至历史记录栈中
   * 用于实现撤销(Undo)与重做(Redo)功能
   * @param {Node[]} [newNodes] - 最新节点数组
   * @param {Edge[]} [newEdges] - 最新连线数组
   */
  const takeSnapshot = useCallback((newNodes?: Node[], newEdges?: Edge[]) => {
    setHistory(prev => {
      const currentNodes = newNodes || nodes;
      const currentEdges = newEdges || edges;
      const newHistory = prev.slice(0, historyIndex + 1);
      return [...newHistory, { nodes: currentNodes, edges: currentEdges }];
    });
    setHistoryIndex(prev => prev + 1);
  }, [nodes, edges, historyIndex]);

  /**
   * 将当前思维导图节点和连线状态持久化到数据库
   */
  const save = useCallback(async () => {
    if (selectedMindMapId) {
      const now = Date.now();
      lastSaveTimeRef.current = now;
      await db.entities.update(selectedMindMapId, {
        content: { nodes, edges },
        updatedAt: now
      });
    }
  }, [selectedMindMapId, nodes, edges]);

  // 使用 Ref 追踪最新的数据，以便在卸载时保存
  const latestDataRef = useRef({ nodes, edges });
  const isDirtyRef = useRef(false);

  useEffect(() => {
    latestDataRef.current = { nodes, edges };
    isDirtyRef.current = true;
  }, [nodes, edges]);

  useEffect(() => {
    if (!selectedMindMapId || !autoSave) return;
    const timer = setTimeout(() => {
      if (isDirtyRef.current) {
        save();
        isDirtyRef.current = false;
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [nodes, edges, save, selectedMindMapId, autoSave]);

  // 卸载时立即保存
  useEffect(() => {
    return () => {
      if (isDirtyRef.current && selectedMindMapId) {
        const { nodes: finalNodes, edges: finalEdges } = latestDataRef.current;
        const now = Date.now();
        db.entities.update(selectedMindMapId, {
          content: { nodes: finalNodes, edges: finalEdges },
          updatedAt: now
        });
      }
    };
  }, [selectedMindMapId]);

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

  /**
   * 识别思维导图的根节点集合（没有入边的节点）
   */
  const rootNodes = useMemo(() => {
    const targets = new Set(edges.map(e => e.target));
    return nodes.filter(n => !targets.has(n.id));
  }, [nodes, edges]);

  /**
   * 视口平滑移动至指定节点所在位置
   * @param {string} nodeId - 目标节点ID
   */
  const jumpToNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setCenter(node.position.x + 75, node.position.y + 25, { zoom: 1.2, duration: 800 });
    }
  }, [nodes, setCenter]);

  /**
   * 当任务面板模态框打开时，加载该学科对应的任务看板数据
   */
  useEffect(() => {
    if (isTaskModalOpen) {
      db.entities.where({ subjectId, type: 'task_board' }).first().then(ent => {
        setTaskBoardEntity(ent || null);
        setSelectedBlockId('new');
      });
    }
  }, [isTaskModalOpen, subjectId]);

  /**
   * 为指定节点添加子节点
   * @param {string} parentId - 父节点ID
   */
  const handleAddChild = useCallback((parentId: string) => {
    const parent = nodes.find(n => n.id === parentId);
    if (!parent) return;

    const id = generateUUID();
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
      sourceHandle: 'right-s',
      targetHandle: 'left-t'
    };

    const newNodes = nodes.concat(newNode);
    const newEdges = edges.concat(newEdge);

    takeSnapshot(newNodes, newEdges);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [nodes, edges, setNodes, setEdges, takeSnapshot]);

  /**
   * 为指定节点添加同级节点
   * 自动查找父节点并挂载新的同级节点，若无父节点则作为子节点处理
   * @param {string} nodeId - 当前节点ID
   */
  const handleAddSibling = useCallback((nodeId: string) => {
    const incomingEdge = edges.find(e => e.target === nodeId);
    if (!incomingEdge) {
      handleAddChild(nodeId);
      return;
    }

    const parentId = incomingEdge.source;
    const parent = nodes.find(n => n.id === parentId);
    if (!parent) return;

    const id = generateUUID();
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
      target: id,
      sourceHandle: 'right-s',
      targetHandle: 'left-t'
    };

    const newNodes = nodes.concat(newNode);
    const newEdges = edges.concat(newEdge);

    takeSnapshot(newNodes, newEdges);
    setNodes(newNodes);
    setEdges(newEdges);

  }, [nodes, edges, setNodes, setEdges, handleAddChild, takeSnapshot]);

  const handleDeleteNode = useCallback((id: string) => {
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
        noteId = generateUUID();
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

    const childEdges = edges.filter(e => e.source === nodeId);
    const childNodes = nodes.filter(n => childEdges.some(e => e.target === n.id));
    const childItems = childNodes.map(n => n.data.label);
    setTaskItemsToAdd(childItems);

    setIsTaskModalOpen(true);
  }, [nodes, edges]);

  /**
   * 确认将当前节点及子节点转换为任务清单项
   * 处理逻辑包括解析选中的分支并创建/更新对应的任务看板区块数据
   */
  const confirmAddTask = async () => {
    let entity = taskBoardEntity;
    let boardNodes = entity?.content?.nodes || [];
    let boardEdges = entity?.content?.edges || [];

    if (!entity) {
      const id = generateUUID();
      entity = {
        id,
        subjectId,
        type: 'task_board',
        title: 'Task Board',
        content: { nodes: [], edges: [] },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      boardNodes = [];
    }

    const itemsToAdd = taskItemsToAdd.length > 0
      ? taskItemsToAdd.map(t => ({ id: generateUUID(), text: t, completed: false }))
      : [{ id: generateUUID(), text: taskLabelToAdd, completed: false }];

    if (selectedBlockId === 'new') {
      const newNode = {
        id: generateUUID(),
        type: 'taskBlock',
        position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
        data: { title: newBlockName, items: itemsToAdd }
      };
      boardNodes.push(newNode);
    } else {
      const nodeIndex = boardNodes.findIndex((n: any) => n.id === selectedBlockId);
      if (nodeIndex !== -1) {
        const node = boardNodes[nodeIndex];
        const items = node.data.items || [];
        boardNodes[nodeIndex] = {
          ...node,
          data: { ...node.data, items: [...items, ...itemsToAdd] }
        };
      }
    }

    if (taskBoardEntity) {
      await db.entities.update(entity.id, {
        content: { nodes: boardNodes, edges: boardEdges },
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

  /**
   * 添加一个新的中心主题节点（根节点）
   */
  const handleAddRootNode = useCallback(async () => {
    const label = await showPrompt("输入新中心主题名称:", "中心主题");
    if (!label) return;

    const id = generateUUID();
    const newNode: Node = {
      id,
      type: 'custom',
      position: { 
        x: nodes.length > 0 ? Math.max(...nodes.map(n => n.position.x)) + 400 : 250, 
        y: 250 
      },
      data: { label },
    };
    const newNodes = nodes.concat(newNode);
    takeSnapshot(newNodes, edges);
    setNodes(newNodes);
    
    // Jump to the new node after a short delay
    setTimeout(() => jumpToNode(id), 100);
  }, [nodes, edges, setNodes, takeSnapshot, showPrompt, jumpToNode]);

  const handleEditNode = useCallback(async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
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

  const nodesWithHandlers = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onEdit: () => handleEditNode(node.id),
        onAddChild: () => handleAddChild(node.id),
        onAddSibling: () => handleAddSibling(node.id),
        onDelete: () => handleDeleteNode(node.id),
        onNote: () => handleNote(node.data.label),
        onTask: () => handleTask(node.id),
      },
    }));
  }, [nodes, handleEditNode, handleAddChild, handleAddSibling, handleDeleteNode, handleNote, handleTask]);

  /**
   * 节点连接事件处理，用户手动拖拽连线时触发
   * @param {Connection} params - 连线参数包含源节点和目标节点信息
   */
  const onConnect = useCallback((params: Connection) => {
    const newEdges = addEdge(params, edges);
    takeSnapshot(nodes, newEdges);
    setEdges(newEdges);
  }, [nodes, edges, setEdges, takeSnapshot]);

  /**
   * 双击节点修改文本标签
   */
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

  /**
   * 节点拖拽结束时保存快照，以便后续可以撤销该位置移动操作
   */
  const onNodeDragStop = useCallback(() => {
    takeSnapshot();
  }, [takeSnapshot]);

  /**
   * 自动布局核心逻辑，支持水平(LR/RL)、垂直(TB/BT)和发散(Radial)布局模式
   * 依赖 dagre 库实现自动计算节点坐标并更新视图
   * @param {'LR' | 'RL' | 'TB' | 'BT' | 'Radial'} direction - 布局方向
   * @param {string[]} [targetNodeIds] - 指定要整理的节点ID集合，若为空则整理全部
   */
  const onLayout = useCallback((direction: 'LR' | 'RL' | 'TB' | 'BT' | 'Radial', targetNodeIds?: string[]) => {
    const nodesToLayout = targetNodeIds 
      ? nodes.filter(n => targetNodeIds.includes(n.id))
      : nodes;
    const edgesToLayout = targetNodeIds
      ? edges.filter(e => targetNodeIds.includes(e.source) && targetNodeIds.includes(e.target))
      : edges;

    if (nodesToLayout.length === 0) return;

    const doDagreLayout = (targetNodes: Node[], targetEdges: Edge[], dir: 'LR' | 'RL' | 'TB' | 'BT') => {
      const g = new dagre.graphlib.Graph();
      g.setGraph({ 
        rankdir: dir, 
        nodesep: (dir === 'TB' || dir === 'BT' ? 60 : 30), 
        ranksep: (dir === 'TB' || dir === 'BT' ? 40 : 60),
        marginx: 40,
        marginy: 40
      });
      g.setDefaultEdgeLabel(() => ({}));

      targetNodes.forEach((node) => {
        const width = Math.max(120, (node.data.label?.length || 0) * 12 + 30);
        g.setNode(node.id, { width, height: 60 });
      });

      targetEdges.forEach((edge) => {
        g.setEdge(edge.source, edge.target);
      });

      dagre.layout(g);
      return g;
    };

    let newNodes: Node[] = [...nodes];
    let newEdges: Edge[] = [...edges];

    if (direction === 'Radial') {
      const roots = nodesToLayout.filter(n => !edgesToLayout.some(e => e.target === n.id));
      if (roots.length === 0) return;

      const root = roots[0];
      const childrenEdges = edgesToLayout.filter(e => e.source === root.id);
      const mid = Math.ceil(childrenEdges.length / 2);
      const rightEdges = childrenEdges.slice(0, mid);
      const leftEdges = childrenEdges.slice(mid);

      const getSubtree = (startEdges: Edge[]) => {
        const nodeIds = new Set([root.id]);
        const subtreeEdges: Edge[] = [];
        const stack = [...startEdges];
        
        while (stack.length > 0) {
          const edge = stack.pop()!;
          subtreeEdges.push(edge);
          nodeIds.add(edge.target);
          edgesToLayout.filter(e => e.source === edge.target).forEach(e => stack.push(e));
        }
        const subtreeNodes = nodesToLayout.filter(n => nodeIds.has(n.id));
        return { nodes: subtreeNodes, edges: subtreeEdges };
      };

      const right = getSubtree(rightEdges);
      const left = getSubtree(leftEdges);

      const gRight = doDagreLayout(right.nodes, right.edges, 'LR');
      const gLeft = doDagreLayout(left.nodes, left.edges, 'RL');

      const rootPosRight = gRight.node(root.id);
      const rootPosLeft = gLeft.node(root.id);

      // 合并并平移左侧布局，使其根节点重合
      const layoutedNodeMap = new Map();
      
      right.nodes.forEach(n => {
        const dNode = gRight.node(n.id);
        layoutedNodeMap.set(n.id, {
          ...n,
          position: { x: dNode.x - (dNode.width || 0) / 2, y: dNode.y - 30 }
        });
      });

      left.nodes.forEach(n => {
        if (n.id === root.id) return;
        const dNode = gLeft.node(n.id);
        // 基于右侧根节点位置平移
        layoutedNodeMap.set(n.id, {
          ...n,
          position: { 
            x: (dNode.x - (dNode.width || 0) / 2) - (rootPosLeft.x - rootPosRight.x),
            y: (dNode.y - 30) - (rootPosLeft.y - rootPosRight.y)
          }
        });
      });

      // 合并回主节点列表
      const finalNodeMap = new Map(nodes.map(n => [n.id, n]));
      layoutedNodeMap.forEach((n, id) => finalNodeMap.set(id, n));
      newNodes = Array.from(finalNodeMap.values());

      newEdges = edges.map(edge => {
        const isLeft = left.edges.some(e => e.id === edge.id);
        if (targetNodeIds && (!targetNodeIds.includes(edge.source) || !targetNodeIds.includes(edge.target))) {
          return edge;
        }
        return {
          ...edge,
          sourceHandle: isLeft ? 'left-s' : 'right-s',
          targetHandle: isLeft ? 'right-t' : 'left-t'
        };
      });

    } else {
      // 常规布局 (LR / RL / TB / BT)
      const g = doDagreLayout(nodesToLayout, edgesToLayout, direction);
      
      const layoutedNodes = nodesToLayout.map((node) => {
        const dNode = g.node(node.id);
        return {
          ...node,
          position: { x: dNode.x - (dNode.width || 0) / 2, y: dNode.y - 30 },
        };
      });

      // 如果是局部整理，保持在原位
      if (targetNodeIds && targetNodeIds.length > 0) {
        const originalNodes = nodes.filter(n => targetNodeIds.includes(n.id));
        const avgX = originalNodes.reduce((acc, n) => acc + n.position.x, 0) / originalNodes.length;
        const avgY = originalNodes.reduce((acc, n) => acc + n.position.y, 0) / originalNodes.length;
        
        const layoutAvgX = layoutedNodes.reduce((acc, n) => acc + n.position.x, 0) / layoutedNodes.length;
        const layoutAvgY = layoutedNodes.reduce((acc, n) => acc + n.position.y, 0) / layoutedNodes.length;
        
        const offsetX = avgX - layoutAvgX;
        const offsetY = avgY - layoutAvgY;
        
        layoutedNodes.forEach(n => {
          n.position.x += offsetX;
          n.position.y += offsetY;
        });
      }

      // 合并回主节点列表
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      layoutedNodes.forEach(n => nodeMap.set(n.id, n));
      newNodes = Array.from(nodeMap.values());

      newEdges = edges.map((edge) => {
        if (targetNodeIds && (!targetNodeIds.includes(edge.source) || !targetNodeIds.includes(edge.target))) {
          return edge;
        }
        return {
          ...edge,
          sourceHandle: (direction === 'LR' || direction === 'RL') ? (direction === 'LR' ? 'right-s' : 'left-s') : (direction === 'TB' ? 'bottom-s' : 'top-s'),
          targetHandle: (direction === 'LR' || direction === 'RL') ? (direction === 'LR' ? 'left-t' : 'right-t') : (direction === 'TB' ? 'top-t' : 'bottom-t')
        };
      });
    }

    setNodes(newNodes);
    setEdges(newEdges);
    takeSnapshot(newNodes, newEdges);
    
    // 如果是全局整理则适应屏幕，局部整理则不移动视角
    if (!targetNodeIds) {
      setTimeout(() => {
        fitView({ duration: 800, padding: 0.2 });
      }, 100);
    }
  }, [nodes, edges, setNodes, setEdges, takeSnapshot, fitView]);

  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    showConfirm('确定要删除这条连接线吗？', { title: '删除连接' }).then((confirmed: boolean) => {
      if (confirmed) {
        const newEdges = edges.filter(e => e.id !== edge.id);
        takeSnapshot(nodes, newEdges);
        setEdges(newEdges);
      }
    });
  }, [edges, nodes, setEdges, showConfirm, takeSnapshot]);

  const handleDeleteSelected = useCallback(() => {
    const selectedNodes = nodes.filter(n => n.selected);
    const selectedEdges = edges.filter(e => e.selected);
    
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;
    
    showConfirm(`确定要删除选中的 ${selectedNodes.length} 个节点和 ${selectedEdges.length} 条连接线吗？`, { title: '批量删除' }).then(confirmed => {
      if (confirmed) {
        const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
        const newNodes = nodes.filter(n => !selectedNodeIds.has(n.id));
        const newEdges = edges.filter(e => !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target) && !e.selected);
        
        takeSnapshot(newNodes, newEdges);
        setNodes(newNodes);
        setEdges(newEdges);
      }
    });
  }, [nodes, edges, setNodes, setEdges, takeSnapshot, showConfirm]);

  // 使用新的 useMindMapContext hook 来注册上下文
  // 注意：不传递 nodes.length 以避免频繁更新导致无限循环
  useMindMapContext(
    subjectId,
    subject?.name,
    selectedMindMapId || undefined,
    selectedMindMap?.title
  );

  return (
    <div className="flex h-full relative">
      {/* React Flow Editor */}
      <div className="flex-1 relative bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        {selectedMindMapId ? (
          <ReactFlow
            nodes={nodesWithHandlers}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDragStop={onNodeDragStop}
            onEdgeClick={handleEdgeClick}
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

            {/* Mobile: full-width toolbar */}
            <div className="md:hidden absolute top-0 left-0 right-0 z-10 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-1.5 px-2 py-1.5 overflow-x-auto scrollbar-none">
                <button onClick={handleAddRootNode} className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded-full text-xs font-medium hover:bg-blue-700 transition-colors shrink-0 whitespace-nowrap"><Plus size={14} />中心主题</button>
                <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 shrink-0" />
                <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setLayoutMenuPos({ left: r.left, bottom: r.bottom }); setShowLayoutMenu(!showLayoutMenu); }} className="flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-all border border-transparent hover:border-blue-200 shrink-0 whitespace-nowrap"><LayoutIcon size={14} className="text-blue-500" />整理<ChevronDown size={12} className={cn("transition-transform", showLayoutMenu && "rotate-180")} /></button>
                <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 shrink-0" />
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
                  {rootNodes.map(node => (
                    <button key={node.id} onClick={() => jumpToNode(node.id)} className="flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-all border border-transparent hover:border-blue-200 dark:hover:border-blue-800 shrink-0 whitespace-nowrap"><Target size={12} className="text-blue-500" />{node.data.label}</button>
                  ))}
                  {rootNodes.length === 0 && <span className="text-xs text-zinc-400 px-1 shrink-0">暂无中心主题</span>}
                </div>
              </div>
            </div>

            {/* Desktop: floating pill */}
            <Panel position="top-center" className="hidden md:block bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md rounded-full border border-zinc-200 dark:border-zinc-800 shadow-lg mt-4 overflow-visible">
              <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto scrollbar-none">
                <button onClick={handleAddRootNode} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-medium hover:bg-blue-700 transition-colors shrink-0 whitespace-nowrap"><Plus size={14} /> 新增中心主题</button>
                <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 shrink-0" />
                <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setLayoutMenuPos({ left: r.left, bottom: r.bottom }); setShowLayoutMenu(!showLayoutMenu); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-all border border-transparent hover:border-blue-200 whitespace-nowrap"><LayoutIcon size={14} className="text-blue-500" />自动整理<ChevronDown size={12} className={cn("transition-transform", showLayoutMenu && "rotate-180")} /></button>
                <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 shrink-0" />
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
                  {rootNodes.map(node => (
                    <button key={node.id} onClick={() => jumpToNode(node.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-all border border-transparent hover:border-blue-200 dark:hover:border-blue-800 shrink-0 whitespace-nowrap"><Target size={12} className="text-blue-500" />{node.data.label}</button>
                  ))}
                  {rootNodes.length === 0 && <span className="text-xs text-zinc-400 px-2 shrink-0">暂无中心主题</span>}
                </div>
              </div>
            </Panel>

            {/* View Controls - Bottom Left, above mobile nav */}
            <Panel position="bottom-left" className="mb-16 md:mb-4 ml-2 md:ml-4">
              <ViewControls
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < history.length - 1}
                isSelectionMode={isSelectionMode}
                onSelectionModeChange={setIsSelectionMode}
                onDeleteSelected={handleDeleteSelected}
                onLayoutSelected={(dir) => {
                  const selectedIds = nodes.filter(n => n.selected).map(n => n.id);
                  onLayout(dir, selectedIds);
                }}
                hasSelection={nodes.some(n => n.selected) || edges.some(e => e.selected)}
              />
            </Panel>

            {/* MiniMap - hidden on mobile, top-right on desktop */}
            <div className="hidden md:block">
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
            </div>
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm p-6 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center">
                  <Plus className="mx-auto mb-2 text-zinc-400" size={32} />
                  <p className="text-zinc-500 dark:text-zinc-400 font-medium">思维导图还是空的</p>
                  <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">点击顶部的“新增中心主题”开始</p>
                </div>
              </div>
            )}
          </ReactFlow>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
              <Plus size={32} />
            </div>
            <p>正在加载或创建思维导图...</p>
          </div>
        )}
      </div>

      {/* 整理下拉菜单 - 通过 portal 渲染到 body 以避免被 ReactFlow 容器裁切 */}
      {showLayoutMenu && createPortal(
        <div className="fixed z-[150] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl p-1 min-w-[140px] animate-in fade-in slide-in-from-top-2 duration-150"
          style={{
            left: layoutMenuPos.left,
            top: layoutMenuPos.bottom + 8,
          }}
        >
          <button onClick={() => { onLayout('LR'); setShowLayoutMenu(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"><ArrowRight size={14} />朝右整理</button>
          <button onClick={() => { onLayout('RL'); setShowLayoutMenu(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"><ArrowLeft size={14} />朝左整理</button>
          <button onClick={() => { onLayout('TB'); setShowLayoutMenu(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"><ArrowDown size={14} />朝下整理</button>
          <button onClick={() => { onLayout('BT'); setShowLayoutMenu(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"><ArrowUp size={14} />朝上整理</button>
          <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
          <button onClick={() => { onLayout('Radial'); setShowLayoutMenu(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"><GitBranch size={14} />发散整理</button>
        </div>,
        document.body
      )}

      {/* 点击遮罩关闭下拉 */}
      {showLayoutMenu && (
        <div className="fixed inset-0 z-[140]" onClick={() => setShowLayoutMenu(false)} />
      )}

      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title="添加到任务清单"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              任务列表名称
            </label>
            <input
              type="text"
              value={newBlockName}
              onChange={(e) => setNewBlockName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-zinc-900 dark:border-zinc-700"
              placeholder="例如: 重点掌握"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              选择目标清单
            </label>
            <select
              value={selectedBlockId}
              onChange={(e) => setSelectedBlockId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-zinc-900 dark:border-zinc-700"
            >
              <option value="new">+ 新建清单</option>
              {taskBoardEntity?.content?.nodes?.map((n: any) => (
                <option key={n.id} value={n.id}>{n.data.title}</option>
              ))}
            </select>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-lg border dark:border-zinc-800">
            <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-semibold">将添加以下项:</div>
            <div className="space-y-1">
              {taskItemsToAdd.length > 0 ? (
                taskItemsToAdd.map((item, idx) => (
                  <div key={idx} className="text-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    {item}
                  </div>
                ))
              ) : (
                <div className="text-sm flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {taskLabelToAdd}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setIsTaskModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={confirmAddTask}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              确认添加
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
