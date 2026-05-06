import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNavigate } from 'react-router-dom';
import { UsersIcon, UserIcon } from 'lucide-react';
import { fetchCrossNucleusPersons, type CrossNucleusPerson } from '../lib/db/reports';

const NucleusNode = ({ data }: NodeProps) => (
  <div className="px-4 py-3 shadow-lg rounded-2xl bg-white border-2 border-indigo-500 min-w-[160px] text-center">
    <Handle type="target" position={Position.Top} className="opacity-0" />
    <Handle type="source" position={Position.Bottom} className="opacity-0" />
    <Handle type="target" position={Position.Left} className="opacity-0" />
    <Handle type="source" position={Position.Right} className="opacity-0" />
    <div className="flex flex-col items-center gap-1">
      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mb-1">
        <UsersIcon className="w-4 h-4 text-indigo-600" />
      </div>
      <div className="font-bold text-gray-900 text-sm">{data.label as string}</div>
      <div className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
        {data.peopleCount as number} people
      </div>
    </div>
  </div>
);

const IndividualNode = ({ data }: NodeProps) => (
  <div className="px-3 py-2 shadow-md rounded-xl bg-white border border-emerald-300 min-w-[120px] text-center">
    <Handle type="target" position={Position.Top} className="opacity-0" />
    <Handle type="source" position={Position.Bottom} className="opacity-0" />
    <Handle type="target" position={Position.Left} className="opacity-0" />
    <Handle type="source" position={Position.Right} className="opacity-0" />
    <div className="flex flex-col items-center gap-1">
      <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center">
        <UserIcon className="w-3 h-3 text-emerald-600" />
      </div>
      <div className="font-semibold text-gray-800 text-xs">{data.label as string}</div>
    </div>
  </div>
);

const nodeTypes = { nucleus: NucleusNode, individual: IndividualNode };

interface NucleusShape {
  id: string;
  name: string;
  engagementCounts: { coordinating: number; supporting: number; participating: number; aware: number };
}

interface NetworkViewProps {
  nuclei: NucleusShape[];
  clusterId: string | null;
}

export function NetworkView({ nuclei, clusterId }: NetworkViewProps) {
  const navigate = useNavigate();
  const [crossPeople, setCrossPeople] = useState<CrossNucleusPerson[]>([]);

  useEffect(() => {
    const ids = nuclei.map(n => n.id);
    if (ids.length === 0) { setCrossPeople([]); return; }
    fetchCrossNucleusPersons(ids)
      .then(setCrossPeople)
      .catch(err => console.error('Failed to load cross-nucleus persons:', err));
  }, [nuclei]);

  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const validNucleusIds = new Set(nuclei.map(n => n.id));

    const radius = Math.max(360, nuclei.length * 70);
    const centerX = 500;
    const centerY = 500;
    const nucleusPositions = new Map<string, { x: number; y: number }>();

    nuclei.forEach((nucleus, index) => {
      const angle = (index / nuclei.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      nucleusPositions.set(nucleus.id, { x, y });
      const totalPeople = Object.values(nucleus.engagementCounts).reduce((a, b) => a + b, 0);
      nodes.push({
        id: nucleus.id,
        type: 'nucleus',
        position: { x, y },
        data: { label: nucleus.name, peopleCount: totalPeople, isNucleus: true },
      });
    });

    // Group cross-people by the exact set of nuclei they bridge so we can
    // lay each group out without overlap.
    const groups = new Map<string, { nucleiIds: string[]; people: CrossNucleusPerson[] }>();
    crossPeople.forEach(person => {
      const connectedNuclei = person.nucleiIds
        .filter(nId => validNucleusIds.has(nId))
        .slice()
        .sort();
      if (connectedNuclei.length < 2) return;
      const key = connectedNuclei.join('|');
      let group = groups.get(key);
      if (!group) {
        group = { nucleiIds: connectedNuclei, people: [] };
        groups.set(key, group);
      }
      group.people.push(person);
    });

    const PERSON_SPACING = 110; // px between adjacent person nodes

    groups.forEach(({ nucleiIds, people }) => {
      const positions = nucleiIds
        .map(nId => nucleusPositions.get(nId))
        .filter((p): p is { x: number; y: number } => !!p);
      const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
      const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;

      // Stable order so positions don't jump between renders.
      people.sort((a, b) => (a.id < b.id ? -1 : 1));

      people.forEach((person, i) => {
        let x: number;
        let y: number;
        if (positions.length === 2) {
          // Distribute along the perpendicular bisector of the line between
          // the two nuclei — keeps every person on a clear, non-overlapping
          // path between them.
          const [a, b] = positions;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const px = -dy / len;
          const py = dx / len;
          const offset = (i - (people.length - 1) / 2) * PERSON_SPACING;
          x = cx + px * offset;
          y = cy + py * offset;
        } else {
          // 3+ nuclei: arrange around the centroid in a ring sized to fit them.
          const ringR = Math.max(70, (people.length * PERSON_SPACING) / (2 * Math.PI));
          const angle = (i / people.length) * 2 * Math.PI;
          x = cx + ringR * Math.cos(angle);
          y = cy + ringR * Math.sin(angle);
        }

        nodes.push({
          id: person.id,
          type: 'individual',
          position: { x, y },
          data: { label: person.name, isIndividual: true },
        });
        nucleiIds.forEach(nId => {
          edges.push({
            id: `e-${person.id}-${nId}`,
            source: person.id,
            target: nId,
            type: 'default',
            animated: true,
            style: { stroke: '#94a3b8', strokeWidth: 2, opacity: 0.6 },
          });
        });
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [nuclei, crossPeople]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.data.isNucleus) navigate(`/nucleus/${node.id}`);
      else if (node.data.isIndividual) navigate(`/individual/${node.id}`);
    },
    [navigate]
  );

  return (
    <div className="w-full h-full bg-slate-50/50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={1.5}
      >
        <Background color="#cbd5e1" gap={16} size={2} />
        <Controls className="bg-white shadow-md border border-gray-200 rounded-lg overflow-hidden" />
      </ReactFlow>
    </div>
  );
}
