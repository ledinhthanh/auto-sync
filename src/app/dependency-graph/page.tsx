"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BoxSelect, Filter, Network, Server } from "lucide-react";
import { memo, useCallback, useState } from "react";
import ReactFlow, {
    Background,
    Controls,
    Handle,
    MarkerType,
    Position,
    useEdgesState,
    useNodesState
} from "reactflow";
import "reactflow/dist/style.css";

// Custom Node Component
const DataNode = memo(({ data, selected }: { data: { ownershipPath?: string, ownership: string, type: string, name: string, schema: string }, selected: boolean }) => {
    const isManaged = data.ownership === 'MANAGED';

    const getColors = () => {
        if (data.type === 'table') return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', icon: 'text-blue-600' };
        if (data.type === 'view') return { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-900', icon: 'text-indigo-600' };
        return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', icon: 'text-amber-600' };
    };

    const colors = getColors();

    return (
        <div className={`px-4 py-3 rounded-xl shadow-sm border-2 bg-white min-w-[200px] transition-all
      ${selected ? 'ring-4 ring-indigo-500/20 border-indigo-500 shadow-md' : 'border-slate-200'}
    `}>
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400 border-2 border-white" />
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                    <div className={`p-1.5 rounded ${colors.bg}`}>
                        {data.type === 'table' ? <Server className={`h-4 w-4 ${colors.icon}`} /> : <BoxSelect className={`h-4 w-4 ${colors.icon}`} />}
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800 tracking-tight leading-none">{data.name}</h3>
                        <p className="text-[10px] text-slate-500 font-mono mt-1">{data.schema}</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between mt-3">
                <Badge variant="secondary" className="text-[9px] h-4 px-1 absolute -top-2.5 right-2 tracking-wider">
                    {data.type.toUpperCase()}
                </Badge>
                {isManaged ? (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-medium border-emerald-200 text-emerald-700 bg-emerald-50 rounded shadow-none uppercase">Managed</Badge>
                ) : (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-medium border-amber-200 text-amber-700 bg-amber-50 rounded shadow-none uppercase">User Created</Badge>
                )}
            </div>
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-indigo-500 border-2 border-white" />
        </div>
    );
});
DataNode.displayName = 'DataNode';

const nodeTypes = { custom: DataNode };

const initialNodes = [
    { id: '1', type: 'custom', position: { x: 250, y: 50 }, data: { name: 'users', schema: 'public', type: 'table', ownership: 'MANAGED' } },
    { id: '2', type: 'custom', position: { x: 100, y: 200 }, data: { name: 'active_users', schema: 'reporting', type: 'view', ownership: 'USER_CREATED' } },
    { id: '3', type: 'custom', position: { x: 400, y: 200 }, data: { name: 'user_profiles', schema: 'public', type: 'view', ownership: 'USER_CREATED' } },
    { id: '4', type: 'custom', position: { x: 250, y: 350 }, data: { name: 'daily_metrics', schema: 'dashboard', type: 'matview', ownership: 'USER_CREATED' } },
];

const initialEdges = [
    { id: 'e1-2', source: '1', target: '2', type: 'smoothstep', animated: false, style: { stroke: '#94a3b8', strokeWidth: 2 } },
    { id: 'e1-3', source: '1', target: '3', type: 'smoothstep', animated: false, style: { stroke: '#94a3b8', strokeWidth: 2 } },
    { id: 'e2-4', source: '2', target: '4', type: 'smoothstep', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }, style: { stroke: '#6366f1', strokeWidth: 2 } },
    { id: 'e3-4', source: '3', target: '4', type: 'smoothstep', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }, style: { stroke: '#6366f1', strokeWidth: 2 } },
];

export default function DependencyGraphPage() {
    const [nodes, , onNodesChange] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState(initialEdges);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selectedNode, setSelectedNode] = useState<any>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onNodeClick = useCallback((_event: React.MouseEvent, node: any) => {
        setSelectedNode(node);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
    }, []);

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">
            <div className="flex items-center justify-between pb-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center">
                        <Network className="mr-3 h-6 w-6 text-indigo-600" /> Output Dependencies
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Visualize how objects depend on the auto-synced tables in your destination database.</p>
                </div>
                <div className="flex items-center space-x-2">
                    <Input placeholder="Search nodes..." className="w-64 bg-white" />
                    <Button variant="outline"><Filter className="mr-2 h-4 w-4" /> Filter</Button>
                </div>
            </div>

            <div className="flex flex-1 border rounded-xl overflow-hidden shadow-sm bg-slate-50">
                <div className="flex-1 relative">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        nodeTypes={nodeTypes}
                        fitView
                        attributionPosition="bottom-left"
                    >
                        <Background color="#cbd5e1" gap={16} />
                        <Controls className="bg-white border-slate-200 shadow-sm rounded-lg overflow-hidden" showInteractive={false} />
                    </ReactFlow>

                    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur p-3 rounded-lg shadow-sm border border-slate-200 text-xs text-slate-600 flex flex-col space-y-2 pointer-events-none">
                        <div className="font-semibold text-slate-900 mb-1">Legend</div>
                        <div className="flex items-center"><div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded mr-2"></div> Table</div>
                        <div className="flex items-center"><div className="w-3 h-3 bg-indigo-100 border border-indigo-300 rounded mr-2"></div> View</div>
                        <div className="flex items-center"><div className="w-3 h-3 bg-amber-100 border border-amber-300 rounded mr-2"></div> Materialized View</div>
                        <div className="mt-2 pt-2 border-t flex items-center"><div className="w-3 h-0.5 bg-indigo-500 mr-2"></div> Dependency path</div>
                    </div>
                </div>

                {/* Side Panel */}
                {selectedNode && (
                    <div className="w-80 border-l bg-white flex flex-col shadow-[-4px_0_12px_rgba(0,0,0,0.03)] z-10 animate-in slide-in-from-right-8 duration-200">
                        <div className="p-4 border-b flex items-start space-x-3 bg-slate-50/50">
                            <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                                {selectedNode.data.type === 'table' ? <Server className="h-5 w-5" /> : <BoxSelect className="h-5 w-5" />}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-base font-bold text-slate-900 break-all">{selectedNode.data.name}</h3>
                                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedNode.data.schema}</p>
                                <div className="mt-2 flex space-x-1">
                                    <Badge variant="secondary" className="text-[10px] h-4 uppercase">{selectedNode.data.type}</Badge>
                                    <Badge variant="outline" className={`text-[10px] h-4 uppercase shadow-none bg-white ${selectedNode.data.ownership === 'MANAGED' ? 'text-emerald-700 border-emerald-200' : 'text-amber-700 border-amber-200'}`}>
                                        {selectedNode.data.ownership.replace('_', ' ')}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {selectedNode.data.ownership === 'USER_CREATED' && (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">DDL Definition</h4>
                                    <div className="bg-slate-900 rounded-md p-3 max-h-[200px] overflow-y-auto shadow-inner text-slate-300">
                                        <pre className="text-[11px] font-mono whitespace-pre-wrap">
                                            {`CREATE OR REPLACE VIEW ${selectedNode.data.schema}.${selectedNode.data.name} AS\nSELECT\n  id,\n  email,\n  created_at\nFROM public.users\nWHERE active = true;`}
                                        </pre>
                                    </div>
                                </div>
                            )}

                            {selectedNode.data.ownership === 'MANAGED' && (
                                <div className="space-y-3">
                                    <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Sync Details</h4>
                                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                                        <div className="text-slate-500">Source DB</div>
                                        <div className="font-medium text-slate-900 text-right">ERP Production</div>
                                        <div className="text-slate-500">Source Object</div>
                                        <div className="font-mono text-[11px] text-indigo-700 text-right">public.users</div>
                                        <div className="text-slate-500">Last Synced</div>
                                        <div className="font-medium text-slate-900 text-right">2 hours ago</div>
                                        <div className="text-slate-500">Rows</div>
                                        <div className="font-medium text-slate-900 text-right">1.2M</div>
                                    </div>
                                    <Button className="w-full mt-2" variant="outline" size="sm">Go to Sync Job</Button>
                                </div>
                            )}

                            <div className="space-y-3">
                                <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Impact Analysis</h4>
                                <div className="bg-amber-50 rounded-lg border border-amber-100 p-3">
                                    <p className="text-xs text-amber-800">
                                        If this object is modified, <span className="font-bold">{edges.filter(e => e.source === selectedNode.id).length}</span> objects will need to be recreated/refreshed.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
