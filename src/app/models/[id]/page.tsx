"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Code,
  Database,
  FileCode,
  Play,
  RefreshCw,
  Table2,
  Trash2,
  Plus,
  Box,
  Network,
  Search
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Model {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  sourceName: string | null;
  sourceSchema: string | null;
  customSql: string | null;
  detectedColumns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey?: boolean;
  }>;
  status: string;
  schemaStatus: string;
  lastSchemaCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceConn: {
    id: string;
    name: string;
    type: string;
  };
  syncs: Array<{
    id: string;
    name: string;
    status: string;
    destSchema: string;
    destName: string;
    destConn: {
      name: string;
    };
  }>;
  dependencies: Array<{
    id: string;
    modelId: string;
    dependentId: string;
    autoSync: boolean;
    dependent: {
      id: string;
      name: string;
      status: string;
      sourceSchema: string | null;
      sourceName: string | null;
      syncs: Array<{ id: string; status: string }>;
    };
  }>;
}

export default function ModelDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [allModels, setAllModels] = useState<Array<{ id: string; name: string; sourceSchema: string | null; sourceName: string | null }>>([]);
  const [showAddDepDialog, setShowAddDepDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [isAddingDep, setIsAddingDep] = useState(false);
  const [globalSyncLoading, setGlobalSyncLoading] = useState<Record<string, boolean>>({});

  const fetchModel = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/models/${id}`);
      if (res.status === 404) {
        setError("Model not found");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch model");
      const data = await res.json();
      setModel(data);
    } catch (err) {
      console.error(err);
      setError("An error occurred while loading the model");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchModel();
  }, [fetchModel]);

  const handleRefreshSchema = async () => {
    toast.promise(
      fetch(`/api/models/${id}/refresh`, { method: "POST" }).then(async (res) => {
        if (!res.ok) throw new Error("Failed to refresh schema");
        fetchModel();
        return res.json();
      }),
      {
        loading: "Refreshing schema...",
        success: "Schema refreshed successfully",
        error: "Failed to refresh schema",
      }
    );
  };

  useEffect(() => {
    const fetchAllModels = async () => {
      try {
        const res = await fetch("/api/models");
        if (res.ok) {
          const data = await res.json();
          setAllModels(data.filter((m: any) => m.id !== id));
        }
      } catch (err) {
        console.error("Failed to fetch all models", err);
      }
    };
    fetchAllModels();
  }, [id]);

  const handleAddDependency = async () => {
    if (selectedModelIds.length === 0) return;
    setIsAddingDep(true);
    try {
      const res = await fetch(`/api/models/${id}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependentIds: selectedModelIds, autoSync: true }),
      });
      if (!res.ok) throw new Error("Failed to add dependencies");
      toast.success(`${selectedModelIds.length} dependencies added successfully`);
      setShowAddDepDialog(false);
      setSelectedModelIds([]);
      setSearchQuery("");
      fetchModel();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsAddingDep(false);
    }
  };

  const handleDeleteDependency = async (depId: string) => {
    if (!confirm("Are you sure you want to remove this dependency?")) return;
    try {
      const res = await fetch(`/api/dependencies/${depId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove dependency");
      toast.success("Dependency removed");
      fetchModel();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleAutoSync = async (depId: string, current: boolean) => {
    try {
      const res = await fetch(`/api/dependencies/${depId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSync: !current }),
      });
      if (!res.ok) throw new Error("Failed to update auto-sync");
      fetchModel();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExecuteSync = async (syncIdToRun: string, syncName: string) => {
    setGlobalSyncLoading(prev => ({ ...prev, [syncIdToRun]: true }));
    const promise = fetch(`/api/syncs/${syncIdToRun}/run`, { method: "POST" });
    toast.promise(promise, {
      loading: `Triggering ${syncName}...`,
      success: "Job triggered successfully",
      error: "Failed to trigger job",
    });

    try {
      await promise;
      // Brief delay to let the status update in backgrounds
      setTimeout(fetchModel, 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalSyncLoading(prev => ({ ...prev, [syncIdToRun]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-pulse">
        <div className="h-8 w-64 bg-slate-100 rounded mb-4" />
        <div className="h-4 w-96 bg-slate-50 rounded" />
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-slate-300 mb-4" />
        <h2 className="text-2xl font-bold text-slate-900">{error || "Model Not Found"}</h2>
        <p className="text-slate-500 mt-2 max-w-md">The model you are looking for does not exist or has been deleted.</p>
        <Button
          className="mt-6 bg-indigo-600"
          onClick={() => router.push("/models")}
        >
          Back to Models
        </Button>
      </div>
    );
  }

  const sourceTypeIcon = {
    TABLE: Table2,
    VIEW: FileCode,
    MATVIEW: FileCode,
    CUSTOM_SQL: Code
  }[model.sourceType] || Table2;

  const SourceIcon = sourceTypeIcon;

  return (
    <div className="min-h-screen bg-slate-50/30 pb-20">
      {/* Top Navigation / Breadcrumbs */}
      <div className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/models">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-slate-100">
                <ArrowLeft className="h-4 w-4 text-slate-500" />
              </Button>
            </Link>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Models</span>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-bold text-slate-900 tracking-tight">{model.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 gap-2 shadow-sm"
              onClick={handleRefreshSchema}
            >
              <RefreshCw className="h-3 w-3" />
              Sync Schema
            </Button>
            <Link href={`/jobs/new?modelId=${model.id}`}>
              <Button size="sm" variant="outline" className="h-8 rounded-lg border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 gap-2 shadow-sm">
                New Job
              </Button>
            </Link>
            <Button 
              size="sm" 
              disabled={Object.values(globalSyncLoading).some(Boolean)}
              className="h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider shadow-md shadow-indigo-100 gap-2 px-4 transition-all active:scale-95 disabled:opacity-50"
              onClick={async () => {
                // Trigger for first sync found or all? User request said "execute sync" plural basically
                if (model.syncs.length > 0) {
                  handleExecuteSync(model.syncs[0].id, model.syncs[0].name);
                } else {
                  toast.error("No active sync jobs found for this model");
                }
              }}
            >
              {Object.values(globalSyncLoading).some(Boolean) ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3 fill-current" />
              )}
              Execute Sync
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-8 space-y-8">
        {/* Resource Header */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 px-1">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${model.status === 'ACTIVE'
                  ? 'bg-emerald-50 border-emerald-200/50 text-emerald-600'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                  <div className={`h-1.5 w-1.5 rounded-full ${model.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{model.status}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-indigo-100 bg-indigo-50 text-indigo-700 shadow-sm">
                  <SourceIcon className="h-3 w-3" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{model.sourceType}</span>
                </div>
              </div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none uppercase">
                {model.name}
              </h1>
              <p className="max-w-2xl text-sm font-medium text-slate-500 leading-relaxed">
                {model.description || "No description provided for this data model."}
              </p>
            </div>

            <div className="flex items-center gap-8 py-1">
              <div className="flex flex-col gap-1 items-end md:items-start">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Integrations</span>
                <span className="text-xl font-black text-slate-900 leading-none">{model.syncs.length} <span className="text-slate-300 text-sm font-bold">PIPELINES</span></span>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div className="flex flex-col gap-1 items-start">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Architecture</span>
                <span className="text-xl font-black text-slate-900 leading-none">{model.detectedColumns.length} <span className="text-slate-300 text-sm font-bold">FIELDS</span></span>
                {model.lastSchemaCheckedAt && (
                  <span className="text-[9px] text-slate-400 font-medium">
                    Refreshed {new Date(model.lastSchemaCheckedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-1 mt-2">
            <div className="p-4 rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm flex flex-col justify-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <Database className="h-3 w-3" /> Data Origin
              </span>
              <div className="flex items-center gap-2">
                <Link href={`/connections`} className="text-sm font-black text-slate-900 hover:text-indigo-600 transition-colors uppercase tracking-tight truncate">
                  {model.sourceConn.name}
                </Link>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wider shrink-0">{model.sourceConn.type}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm flex flex-col justify-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <Table2 className="h-3 w-3" /> Resolution Path
              </span>
              {model.sourceType !== 'CUSTOM_SQL' ? (
                <div className="flex items-center gap-1 truncate">
                  <span className="text-xs font-mono text-slate-400">{model.sourceSchema}.</span>
                  <span className="text-sm font-black text-slate-800 uppercase tracking-tight truncate">{model.sourceName}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 truncate text-indigo-600">
                  <Code className="h-3.5 w-3.5" />
                  <span className="text-xs font-mono font-bold truncate">Custom SQL Definition</span>
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm flex flex-col justify-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Created
              </span>
              <span className="text-sm font-bold text-slate-700">
                {new Date(model.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm flex flex-col justify-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3" /> Last Modified
              </span>
              <span className="text-sm font-bold text-slate-700">
                {new Date(model.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="w-full mt-8">
        <Tabs defaultValue="syncs" className="w-full">


          <div className="w-full max-w-7xl mx-auto px-4 mt-6 pb-20">


            <TabsContent value="syncs" className="mt-0 focus-visible:outline-none focus:outline-none">
              <div className="space-y-6">
                {/* Downstream Impact Analysis embedded in Syncs tab */}
                <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-6">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-600">
                        <Network className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 block">Cascading Dependencies</span>
                        <span className="text-[9px] text-slate-400 font-medium">Models to sync automatically after this one completes</span>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setShowAddDepDialog(true)}
                      className="h-7 px-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white border-slate-200 text-slate-600 hover:bg-slate-50 gap-1.5"
                    >
                      <Plus className="h-3 w-3" /> Add Dependent
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50/50">
                          <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Dependent Model</th>
                          <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Status</th>
                          <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Auto Sync</th>
                          <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {model.dependencies && model.dependencies.length > 0 ? (
                          model.dependencies.map((dep) => (
                            <tr key={dep.id} className="group hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3">
                                <Link href={`/models/${dep.dependent.id}`} className="group/link flex flex-col">
                                  <span className="text-sm font-bold text-slate-800 group-hover/link:text-indigo-600 transition-colors">{dep.dependent.name}</span>
                                  <span className="text-[10px] text-slate-400 font-mono tracking-tighter">
                                    {dep.dependent.sourceSchema}.{dep.dependent.sourceName}
                                  </span>
                                </Link>
                              </td>
                              <td className="px-4 py-3">
                                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black tracking-widest uppercase ${
                                  dep.dependent.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                                }`}>
                                  <div className={`h-1 w-1 rounded-full ${dep.dependent.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                                  {dep.dependent.status}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Checkbox 
                                  checked={dep.autoSync} 
                                  onCheckedChange={() => handleToggleAutoSync(dep.id, dep.autoSync)}
                                  className="mx-auto rounded border-slate-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteDependency(dep.id)}
                                  className="h-7 w-7 p-0 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-6 py-10 text-center">
                              <Box className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                              <p className="text-slate-600 font-bold text-sm uppercase tracking-tight">No Dependents Configured</p>
                              <p className="text-slate-400 font-medium text-xs mt-1">Cascading syncs will not be triggered for this model.</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 px-1">Sync Jobs</h3>
                  {model.syncs.length > 0 ? (
                    model.syncs.map((sync) => (
                      <div key={sync.id} className="bg-white rounded-xl border border-slate-200/60 shadow-sm px-4 py-3 flex items-center justify-between hover:border-indigo-200 hover:shadow-md transition-all group">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                            <RefreshCw className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{sync.name}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{sync.destConn.name}</span>
                              <span className="text-slate-200 text-[10px]">•</span>
                              <span className="text-[10px] font-mono text-slate-400">{sync.destSchema}.{sync.destName}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${sync.status === 'RUNNING' ? 'bg-indigo-50 text-indigo-600 animate-pulse' : 'bg-slate-50 text-slate-400'
                            }`}>
                            {sync.status}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={globalSyncLoading[sync.id]}
                            className="h-7 px-3 rounded-lg font-black text-[10px] uppercase tracking-widest gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm shadow-indigo-50 disabled:opacity-50"
                            onClick={() => handleExecuteSync(sync.id, sync.name)}
                          >
                            {globalSyncLoading[sync.id] ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3 fill-current" />
                            )}
                            Sync
                          </Button>
                          <Link href={`/jobs/${sync.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 px-3 rounded-lg font-bold text-[10px] uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">Details</Button>
                          </Link>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-10 text-center bg-white rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center">
                      <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                        <Play className="h-5 w-5 text-slate-200" />
                      </div>
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">No Active Synchronization</h4>
                      <Link href={`/jobs/new?modelId=${model.id}`} className="mt-4">
                        <Button size="sm" className="h-8 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-black uppercase tracking-widest text-[10px]">Initialize First Sync</Button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>


          </div>
        </Tabs>
      </div>
      <Dialog open={showAddDepDialog} onOpenChange={(open) => {
        setShowAddDepDialog(open);
        if (!open) {
          setSelectedModelIds([]);
          setSearchQuery("");
        }
      }}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-indigo-600 px-6 py-8 text-white relative overflow-hidden">
            <div className="relative z-10">
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Add Dependents</DialogTitle>
              <DialogDescription className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">
                Select models to trigger after {model.name}
              </DialogDescription>
            </div>
            <Network className="absolute -right-4 -bottom-4 h-32 w-32 text-white/10 rotate-12" />
          </div>

          <div className="p-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search models by name or schema..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-indigo-500 transition-all text-sm font-medium"
              />
            </div>

            <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
              <div className="max-h-[300px] overflow-y-auto px-2 py-2 thin-scrollbar">
                {allModels
                  .filter(m => 
                    m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    (m.sourceSchema && m.sourceSchema.toLowerCase().includes(searchQuery.toLowerCase()))
                  )
                  .filter(m => !model.dependencies.some(d => d.dependentId === m.id))
                  .length > 0 ? (
                  allModels
                    .filter(m => 
                      m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      (m.sourceSchema && m.sourceSchema.toLowerCase().includes(searchQuery.toLowerCase()))
                    )
                    .filter(m => !model.dependencies.some(d => d.dependentId === m.id))
                    .map((m) => {
                      const isSelected = selectedModelIds.includes(m.id);
                      return (
                        <div 
                          key={m.id}
                          onClick={() => {
                            setSelectedModelIds(prev => 
                              isSelected ? prev.filter(item => item !== m.id) : [...prev, m.id]
                            );
                          }}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all mb-1 ${
                            isSelected ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-white hover:shadow-sm border-transparent'
                          } border`}
                        >
                          <Checkbox 
                            checked={isSelected}
                            onCheckedChange={() => {}} // Handled by div onClick
                            className="rounded-md border-slate-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                          />
                          <div className="flex flex-col">
                            <span className={`text-sm font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{m.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {m.sourceSchema || 'public'}.{m.sourceName || m.name}
                            </span>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="py-12 text-center">
                    <Box className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">No matching models found</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">
                Auto-sync includes 5s delay
              </p>
              {selectedModelIds.length > 0 && (
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                  {selectedModelIds.length} models selected
                </span>
              )}
            </div>
          </div>

          <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100 gap-2 sm:gap-2">
            <Button 
              variant="ghost" 
              onClick={() => setShowAddDepDialog(false)} 
              className="h-11 rounded-xl font-bold uppercase tracking-widest text-[10px] flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddDependency} 
              disabled={selectedModelIds.length === 0 || isAddingDep}
              className="h-11 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-100 flex-1 sm:flex-none"
            >
              {isAddingDep ? "Processing..." : `Add ${selectedModelIds.length > 0 ? selectedModelIds.length : ''} Dependent${selectedModelIds.length > 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
