"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Database, Table2, Check, ChevronLeft, ChevronRight, Search, Zap, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface Connection {
  id: string;
  name: string;
  type: string;
  role: string;
  host?: string;
  database?: string;
}

interface DbObject {
  schema: string;
  name: string;
  type: string;
}

interface Model {
  sourceConnId: string;
  sourceSchema: string;
  sourceName: string;
}

interface BulkModelFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function BulkModelForm({ onSuccess, onCancel }: BulkModelFormProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingConns, setLoadingConns] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedConnId, setSelectedConnId] = useState<string>("");
  const [destConnections, setDestConnections] = useState<Connection[]>([]);
  const [selectedDestConnId, setSelectedDestConnId] = useState<string>("");
  const [dbObjects, setDbObjects] = useState<DbObject[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  const [existingObjects, setExistingObjects] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [autoCreateSyncJob, setAutoCreateSyncJob] = useState(true);

  useEffect(() => {
    async function fetchConnections() {
      try {
        const res = await fetch("/api/connections");
        if (res.ok) {
          const data = await res.json();
          setConnections(data.filter((c: Connection) => c.role === "SOURCE" || c.role === "BOTH"));
          const dests = data.filter((c: Connection) => c.role === "DESTINATION" || c.role === "BOTH");
          setDestConnections(dests);
          if (dests.length > 0) {
            setSelectedDestConnId(dests[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch connections:", error);
        toast.error("Failed to load connections");
      } finally {
        setLoadingConns(false);
      }
    }
    fetchConnections();
  }, []);

  useEffect(() => {
    if (selectedConnId && currentStep === 2) {
      fetchObjects(selectedConnId);
    }
  }, [selectedConnId, currentStep]);

  useEffect(() => {
    async function fetchExistingModels() {
      if (!selectedConnId) return;
      try {
        const res = await fetch("/api/models");
        if (res.ok) {
          const data = await res.json();
          const filtered = data.filter((m: Model) => m.sourceConnId === selectedConnId);
          setExistingObjects(new Set(filtered.map((m: Model) => `${m.sourceSchema}.${m.sourceName}`)));
        }
      } catch (error) {
        console.error("Failed to fetch existing models:", error);
      }
    }
    if (selectedConnId && currentStep === 2) {
      fetchExistingModels();
    }
  }, [selectedConnId, currentStep]);

  const fetchObjects = async (connId: string) => {
    try {
      setLoadingObjects(true);
      const res = await fetch(`/api/connections/${connId}/objects`);
      const data = await res.json();
      if (res.ok) {
        setDbObjects(data.objects || []);
      }
    } catch {
      toast.error("Failed to fetch objects");
    } finally {
      setLoadingObjects(false);
    }
  };

  const filteredObjects = dbObjects.filter(obj =>
    `${obj.schema}.${obj.name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleObject = (id: string) => {
    if (existingObjects.has(id)) return;
    const next = new Set(selectedObjects);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedObjects(next);
  };

  const toggleAll = () => {
    const importableObjects = filteredObjects.filter(obj => !existingObjects.has(`${obj.schema}.${obj.name}`));
    if (selectedObjects.size === importableObjects.length) {
      setSelectedObjects(new Set());
    } else {
      setSelectedObjects(new Set(importableObjects.map(obj => `${obj.schema}.${obj.name}`)));
    }
  };

  const handleSubmit = async () => {
    if (selectedObjects.size === 0) {
      toast.error("Please select at least one object");
      return;
    }

    setSubmitting(true);
    try {
      const objects = Array.from(selectedObjects).map(id => {
        const [schema, name] = id.split(".");
        const dbObj = dbObjects.find(o => o.schema === schema && o.name === name);
        return { schema, name, type: dbObj?.type };
      });

      const res = await fetch("/api/models/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceConnId: selectedConnId,
          objects,
          autoCreateSyncJob,
          destConnId: autoCreateSyncJob ? selectedDestConnId : undefined,
        }),
      });

      if (res.ok) {
        toast.success(`Successfully created ${selectedObjects.size} models`);
        onSuccess();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to create models");
      }
    } catch (error) {
      console.error("Bulk creation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create models");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedConn = connections.find(c => c.id === selectedConnId);
  const importableCount = Array.from(selectedObjects).filter(id => !existingObjects.has(id)).length;

  const steps = [
    { title: "Source", icon: Database },
    { title: "Selection", icon: Table2 },
    { title: "Review", icon: Check },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Step Header */}
      <div className="flex items-center px-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                  currentStep > i + 1
                    ? "bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-100"
                    : currentStep === i + 1
                    ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-200"
                    : "bg-white border-slate-200 text-slate-400"
                )}
              >
                {currentStep > i + 1 ? <Check className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
              </div>
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest whitespace-nowrap",
                currentStep === i + 1 ? "text-slate-900" : currentStep > i + 1 ? "text-emerald-600" : "text-slate-400"
              )}>
                {step.title}
              </span>
            </div>
            {i < 2 && (
              <div className={cn(
                "flex-1 h-0.5 mx-4 mb-4 rounded-full transition-all duration-500",
                currentStep > i + 1 ? "bg-emerald-400" : "bg-slate-100"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Source Selection */}
      {currentStep === 1 && (
        <div className="animate-in slide-in-from-right-4 duration-300">
          <div className="mb-6">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Select Source Connection</h2>
            <p className="text-sm text-slate-500 mt-1">Choose the database connection to import objects from.</p>
          </div>
          {loadingConns ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-36 rounded-2xl border-2 border-slate-100 bg-slate-50/50 animate-pulse" />
              ))}
            </div>
          ) : connections.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-2xl">
              <Database className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-500">No source connections found.</p>
              <p className="text-xs text-slate-400 mt-1">Add a connection first in the Connections page.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {connections.map((conn) => (
                <button
                  key={conn.id}
                  type="button"
                  onClick={() => setSelectedConnId(conn.id)}
                  className={cn(
                    "flex flex-col items-start p-6 rounded-2xl border-2 transition-all text-left relative group",
                    selectedConnId === conn.id
                      ? "border-indigo-500 bg-indigo-50/50 shadow-lg shadow-indigo-100 ring-2 ring-indigo-200 ring-offset-2"
                      : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50 hover:shadow-md"
                  )}
                >
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center mb-4 transition-all",
                    selectedConnId === conn.id ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600"
                  )}>
                    <Database className="h-5 w-5" />
                  </div>
                  <span className={cn(
                    "text-sm font-black uppercase tracking-tight truncate w-full",
                    selectedConnId === conn.id ? "text-indigo-900" : "text-slate-700"
                  )}>
                    {conn.name}
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-widest mt-1.5 px-2 py-0.5 rounded-full border",
                    selectedConnId === conn.id ? "text-indigo-600 bg-indigo-100 border-indigo-200" : "text-slate-400 bg-slate-50 border-slate-100"
                  )}>
                    {conn.type}
                  </span>
                  {selectedConnId === conn.id && (
                    <div className="absolute top-4 right-4 h-6 w-6 bg-indigo-600 rounded-full flex items-center justify-center shadow-sm">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Object Selection */}
      {currentStep === 2 && (
        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Select Tables & Views</h2>
              <p className="text-sm text-slate-500 mt-1">
                {loadingObjects ? "Scanning connection..." : `Found ${dbObjects.length} objects. Pick those you want to model.`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs font-bold gap-2 border-slate-200"
              onClick={() => fetchObjects(selectedConnId)}
              disabled={loadingObjects}
            >
              <RefreshCw className={cn("h-3 w-3", loadingObjects && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search tables..."
                className="pl-9 h-10 text-sm border-slate-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 text-xs font-bold border-slate-200 whitespace-nowrap"
              onClick={toggleAll}
            >
              {selectedObjects.size === filteredObjects.filter(o => !existingObjects.has(`${o.schema}.${o.name}`)).length && selectedObjects.size > 0 ? "DESELECT ALL" : "SELECT ALL"}
            </Button>
          </div>

          <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="min-h-[300px] max-h-[520px] overflow-y-auto">
              {loadingObjects ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                  <span className="text-xs text-slate-400 font-medium">Scanning connection...</span>
                </div>
              ) : filteredObjects.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-xs italic">
                  No tables found matching your search.
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100">
                      <th className="w-12 pl-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400"></th>
                      <th className="py-2.5 pr-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Object</th>
                      <th className="py-2.5 pr-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Type</th>
                      <th className="py-2.5 pr-4 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredObjects.map((obj) => {
                      const id = `${obj.schema}.${obj.name}`;
                      const isImported = existingObjects.has(id);
                      const isSelected = selectedObjects.has(id);
                      return (
                        <tr
                          key={id}
                          className={cn(
                            "transition-colors",
                            isImported ? "bg-slate-50/30 cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-indigo-50/30",
                            isSelected && "bg-indigo-50/40"
                          )}
                          onClick={() => !isImported && toggleObject(id)}
                        >
                          <td className="w-12 pl-4 py-3">
                            <Checkbox
                              checked={isSelected || isImported}
                              disabled={isImported}
                              onCheckedChange={() => !isImported && toggleObject(id)}
                              className={isSelected ? "border-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600" : ""}
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <Table2 className="h-4 w-4 text-slate-300 shrink-0" />
                              <span className="text-xs font-mono">
                                <span className="text-slate-400">{obj.schema}.</span>
                                <span className="font-bold text-slate-800">{obj.name}</span>
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{obj.type}</span>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {isImported && (
                              <Badge variant="outline" className="text-[9px] h-5 bg-emerald-50 text-emerald-600 border-emerald-100 font-black uppercase tracking-wider">
                                IMPORTED
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {!loadingObjects && (
              <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {selectedObjects.size} selected
                </span>
                <span className="text-[10px] text-slate-400">
                  {existingObjects.size} already imported
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Review & Confirm */}
      {currentStep === 3 && (
        <div className="animate-in slide-in-from-right-4 duration-300 space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Confirm Bulk Import</h2>
            <p className="text-sm text-slate-500 mt-1">Review your selections before creating the models.</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Database className="h-3 w-3" /> Connection
              </span>
              <div>
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">{selectedConn?.name}</p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase tracking-wider">{selectedConn?.type}</span>
              </div>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Table2 className="h-3 w-3" /> Models to create
              </span>
              <p className="text-3xl font-black text-slate-900">{importableCount} <span className="text-sm font-bold text-slate-400">objects</span></p>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Zap className="h-3 w-3" /> Auto Sync Jobs
              </span>
              <p className="text-sm font-bold text-slate-700">{autoCreateSyncJob ? "Will be created" : "Skip for now"}</p>
            </div>
          </div>

          {/* Auto-create sync job toggle */}
          <div
            className={cn(
              "flex items-start gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all",
              autoCreateSyncJob
                ? "bg-indigo-50/50 border-indigo-200 shadow-sm"
                : "bg-white border-slate-200 hover:border-slate-300"
            )}
            onClick={() => setAutoCreateSyncJob(!autoCreateSyncJob)}
          >
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-all",
              autoCreateSyncJob ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "bg-slate-100 text-slate-400"
            )}>
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Auto-create Sync Jobs</p>
                <Checkbox
                  checked={autoCreateSyncJob}
                  onCheckedChange={(v) => setAutoCreateSyncJob(!!v)}
                  onClick={(e) => e.stopPropagation()}
                  className={autoCreateSyncJob ? "border-indigo-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600" : ""}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Automatically generate a sync job for each new model. You can configure destinations later.
              </p>
            </div>
          </div>

          {/* Destination Connection Selector */}
          {autoCreateSyncJob && (
            <div className="animate-in slide-in-from-top-2 duration-300">
               <div className="flex flex-col gap-3">
                 <div className="flex items-center gap-2">
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Select Destination Database</span>
                   <div className="flex-1 h-px bg-slate-100" />
                 </div>
                 
                 {destConnections.length === 0 ? (
                   <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center gap-3">
                     <AlertCircle className="h-4 w-4 text-amber-500" />
                     <p className="text-xs text-slate-500 font-medium">No destination connections found. Please add one first.</p>
                   </div>
                 ) : (
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                     {destConnections.map((conn) => (
                       <button
                         key={conn.id}
                         type="button"
                         onClick={() => setSelectedDestConnId(conn.id)}
                         className={cn(
                           "flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left",
                           selectedDestConnId === conn.id
                             ? "border-indigo-500 bg-indigo-50/30 shadow-sm"
                             : "border-slate-100 bg-white hover:border-slate-200"
                         )}
                       >
                         <div className={cn(
                           "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                           selectedDestConnId === conn.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                         )}>
                           <Database className="h-4 w-4" />
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className={cn(
                             "text-[11px] font-black uppercase tracking-tight truncate",
                             selectedDestConnId === conn.id ? "text-indigo-900" : "text-slate-700"
                           )}>
                             {conn.name}
                           </p>
                           <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{conn.type}</p>
                         </div>
                         {selectedDestConnId === conn.id && (
                           <Check className="h-4 w-4 text-indigo-600 shrink-0" />
                         )}
                       </button>
                     ))}
                   </div>
                 )}
               </div>
            </div>
          )}

          {/* Preview list of objects */}
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Objects to import</span>
              <span className="text-[10px] font-bold text-slate-400">{importableCount} total</span>
            </div>
            <div className="flex flex-wrap gap-2 p-4 max-h-[200px] overflow-y-auto">
              {Array.from(selectedObjects).map(id => (
                <span key={id} className="text-[10px] font-mono px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors">
                  {id}
                </span>
              ))}
            </div>
          </div>

          {/* Warning note */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 font-medium">
              Schema detection will run automatically after creation. This may take a few seconds per model.
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        {currentStep === 1 ? (
          <Button variant="ghost" onClick={onCancel} className="text-slate-500 text-xs font-medium">
            Cancel
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setCurrentStep(prev => prev - 1)} className="h-10 px-6 rounded-xl text-xs font-bold border-slate-200 gap-2">
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
        )}

        {currentStep < 3 ? (
          <Button
            onClick={() => {
              if (currentStep === 1 && !selectedConnId) {
                toast.error("Please select a connection");
                return;
              }
              if (currentStep === 2 && selectedObjects.size === 0) {
                toast.error("Please select at least one table");
                return;
              }
              setCurrentStep(prev => prev + 1);
            }}
            className="h-10 px-8 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-sm gap-2"
          >
            Continue <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 px-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all active:scale-95 gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {submitting ? "Creating..." : "Start Bulk Import"}
          </Button>
        )}
      </div>
    </div>
  );
}
