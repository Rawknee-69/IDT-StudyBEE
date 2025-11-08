import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  Position,
  NodeProps,
  Handle,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MindMapNode {
  id: string;
  title: string;
  children?: MindMapNode[];
}

interface MindMapData {
  nodes: MindMapNode;
}

interface MindMapCanvasProps {
  data: MindMapData;
}

interface CollapsibleNodeData {
  label: string;
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const nodeWidth = 220;
const nodeHeight = 60;

const CollapsibleNode = ({ data }: NodeProps<CollapsibleNodeData>) => {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div className="flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-md min-w-[220px] hover-elevate">
        {data.hasChildren && (
          <button
            onClick={data.onToggleCollapse}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center hover:bg-accent rounded data-testid-collapse-button"
            data-testid="button-collapse-toggle"
          >
            {data.isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        )}
        <span className="text-sm font-medium flex-1 text-foreground">
          {data.label}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
};

const nodeTypes = {
  collapsible: CollapsibleNode,
};

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ 
    rankdir: 'LR',
    nodesep: 80,
    ranksep: 150,
    edgesep: 50,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

const transformToReactFlow = (
  rootNode: MindMapNode,
  collapsedNodes: Set<string>,
  onToggleCollapse: (nodeId: string) => void,
  parentId: string | null = null
): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const traverse = (node: MindMapNode, parent: string | null, level: number = 0) => {
    const nodeId = node.id;
    const isCollapsed = collapsedNodes.has(nodeId);
    const hasChildren = node.children && node.children.length > 0;

    nodes.push({
      id: nodeId,
      type: 'collapsible',
      data: {
        label: node.title,
        hasChildren: !!hasChildren,
        isCollapsed,
        onToggleCollapse: () => onToggleCollapse(nodeId),
      },
      position: { x: 0, y: 0 },
    });

    if (parent) {
      edges.push({
        id: `${parent}-${nodeId}`,
        source: parent,
        target: nodeId,
        type: 'smoothstep',
        style: { stroke: 'hsl(var(--border))', strokeWidth: 2 },
        animated: false,
      });
    }

    if (hasChildren && !isCollapsed) {
      node.children!.forEach((child) => traverse(child, nodeId, level + 1));
    }
  };

  traverse(rootNode, parentId);
  return { nodes, edges };
};

export function MindMapCanvas({ data }: MindMapCanvasProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const handleToggleCollapse = useCallback((nodeId: string) => {
    setCollapsedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  useEffect(() => {
    if (!data?.nodes) return;

    const { nodes: flowNodes, edges: flowEdges } = transformToReactFlow(
      data.nodes,
      collapsedNodes,
      handleToggleCollapse
    );

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      flowNodes,
      flowEdges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [data, collapsedNodes, handleToggleCollapse, setNodes, setEdges]);

  const handleFitView = useCallback(() => {
    const reactFlowInstance = (window as any).__reactFlowInstance;
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
    }
  }, []);

  const handleExpandAll = useCallback(() => {
    setCollapsedNodes(new Set());
  }, []);

  const handleCollapseAll = useCallback(() => {
    if (!data?.nodes) return;
    const allNodeIds = new Set<string>();
    const traverse = (node: MindMapNode) => {
      if (node.children && node.children.length > 0) {
        allNodeIds.add(node.id);
        node.children.forEach(traverse);
      }
    };
    traverse(data.nodes);
    setCollapsedNodes(allNodeIds);
  }, [data]);

  return (
    <div className="w-full h-[600px] bg-background border border-border rounded-lg overflow-hidden">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={handleFitView}
          data-testid="button-fit-view"
        >
          Fit View
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleExpandAll}
          data-testid="button-expand-all"
        >
          Expand All
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleCollapseAll}
          data-testid="button-collapse-all"
        >
          Collapse All
        </Button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
        onInit={(instance) => {
          (window as any).__reactFlowInstance = instance;
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="bg-background" />
        <Controls className="bg-card border border-border" />
      </ReactFlow>
    </div>
  );
}
