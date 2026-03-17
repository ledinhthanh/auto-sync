"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Database, Table2, Code, ChevronLeft, ChevronRight, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Connection {
  id: string;
  name: string;
  type: string;
  role: string;
}

interface ModelFormData {
  name: string;
  description: string;
  sourceConnId: string;
  sourceType: string;
  sourceSchema: string;
  sourceName: string;
  customSql: string;
  tags: string[];
}

interface DbObject {
  schema: string;
  name: string;
  type: string;
}

interface ModelFormProps {
  editingId: string | null;
  formData: ModelFormData;
  setFormData: (data: ModelFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitting: boolean;
}

export function ModelForm({
  editingId,
  formData,
  setFormData,
  onSubmit,
  onCancel,
  submitting,
}: ModelFormProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingConns, setLoadingConns] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [tables, setTables] = useState<DbObject[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isPreviewed, setIsPreviewed] = useState(false);
  const [openSelector, setOpenSelector] = useState(false);

  useEffect(() => {
    async function fetchConnections() {
      try {
        const res = await fetch("/api/connections");
        if (res.ok) {
          const data = await res.json();
          setConnections(data.filter((c: Connection) => c.role === "SOURCE" || c.role === "BOTH"));
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
    if (formData.sourceConnId && currentStep === 2) {
      if (formData.sourceType === "TABLE") {
        fetchTables(formData.sourceConnId);
      } else {
        fetchSchemas(formData.sourceConnId);
      }
    }
    setPreviewData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.sourceConnId, formData.sourceType, currentStep]);

  const fetchSchemas = async (connId: string) => {
    try {
      const res = await fetch(`/api/connections/${connId}/objects`);
      const data = await res.json();
      if (res.ok) {
        if (data.schemas?.length > 0 && !formData.sourceSchema) {
          handleChange("sourceSchema", data.schemas.includes("public") ? "public" : data.schemas[0]);
        }
      }
    } catch {
      toast.error("Failed to fetch schemas");
    }
  };

  const fetchTables = async (connId: string) => {
    try {
      setLoadingTables(true);
      const res = await fetch(`/api/connections/${connId}/objects`);
      const data = await res.json();
      if (res.ok) {
        setTables(data.objects || []);
      }
    } catch {
      toast.error("Failed to fetch tables");
    } finally {
      setLoadingTables(false);
    }
  };

  const handlePreview = async () => {
    try {
      setLoadingPreview(true);
      const res = await fetch("/api/models/preview", {
        method: "POST",
        body: JSON.stringify({
          connId: formData.sourceConnId,
          schema: formData.sourceSchema,
          name: formData.sourceName,
          sql: formData.sourceType === "CUSTOM_SQL" ? formData.customSql : undefined
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPreviewData(data);
        setIsPreviewed(true);
        toast.success("Preview successful!");
      } else {
        toast.error(data.error || "Preview failed");
        setIsPreviewed(false);
      }
    } catch {
      toast.error("Preview failed");
      setIsPreviewed(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleChange = <K extends keyof ModelFormData>(field: K, value: ModelFormData[K]) => {
    setFormData({ ...formData, [field]: value });
  };

   const nextStep = () => {
    if (currentStep === 1 && !formData.sourceConnId) {
      toast.error("Please select a source connection");
      return;
    }
    if (currentStep === 2) {
        if (!isPreviewed) {
            toast.error("Please preview and verify your data before continuing");
            return;
        }
    }
    setCurrentStep(prev => prev + 1);
  };

  const prevStep = () => setCurrentStep(prev => prev - 1);

  const steps = [
    { title: "Source", icon: Database },
    { title: "Definition", icon: Code },
    { title: "Finalize", icon: Check },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Progress Header */}
      <div className="flex items-center justify-between px-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center group">
            <div className={`flex flex-col items-center gap-1.5`}>
              <div 
                className={`h-8 w-8 rounded-full flex items-center justify-center border transition-all duration-300 ${
                  currentStep > i + 1 
                    ? "bg-emerald-500 border-emerald-500 text-white" 
                    : currentStep === i + 1 
                    ? "bg-slate-900 border-slate-900 text-white" 
                    : "bg-white border-slate-200 text-slate-400"
                }`}
              >
                {currentStep > i + 1 ? <Check className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${currentStep === i + 1 ? "text-slate-900" : "text-slate-400"}`}>
                {step.title}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-4 mb-4 transition-colors duration-500 ${currentStep > i + 1 ? "bg-emerald-500" : "bg-slate-100"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/30">
            <h3 className="text-sm font-semibold text-slate-900">
                {currentStep === 1 ? "Connect your data source" : currentStep === 2 ? "Define the data structure" : "Review and finalize"}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
                {currentStep === 1 
                    ? "Choose an existing infrastructure to pull data from." 
                    : currentStep === 2 
                    ? "Choose a modeling method to define your object."
                    : "Configure identity and organizational metadata."}
            </p>
        </div>

        <div className="p-8 min-h-[320px]">
          {currentStep === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {connections.length === 0 && !loadingConns ? (
                  <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                    <Database className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-500">No source connections found.</p>
                    <p className="text-xs text-slate-400 mt-1">Add a connection first in the Connections page.</p>
                  </div>
                ) : (
                  connections.map((conn) => (
                    <button
                      key={conn.id}
                      type="button"
                      onClick={() => handleChange("sourceConnId", conn.id)}
                      className={`flex flex-col items-start p-6 rounded-2xl border-2 transition-all text-left group relative ${
                        formData.sourceConnId === conn.id
                          ? "border-indigo-500 bg-indigo-50/50 shadow-lg shadow-indigo-100 ring-2 ring-indigo-200 ring-offset-2"
                          : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50 hover:shadow-md"
                      }`}
                    >
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-4 transition-all ${
                        formData.sourceConnId === conn.id ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600"
                      }`}>
                        <Database className="h-5 w-5" />
                      </div>
                      <span className={`text-sm font-black uppercase tracking-tight truncate w-full ${
                        formData.sourceConnId === conn.id ? "text-indigo-900" : "text-slate-700"
                      }`}>
                        {conn.name}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest mt-1.5 px-2 py-0.5 rounded-full border ${
                        formData.sourceConnId === conn.id ? "text-indigo-600 bg-indigo-100 border-indigo-200" : "text-slate-400 bg-slate-50 border-slate-100"
                      }`}>
                        {conn.type}
                      </span>
                      {formData.sourceConnId === conn.id && (
                        <div className="absolute top-4 right-4 h-6 w-6 bg-indigo-600 rounded-full flex items-center justify-center shadow-sm">
                          <Check className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))
                )}
                {loadingConns && Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-36 rounded-2xl border-2 border-slate-100 bg-slate-50/50 animate-pulse" />
                ))}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="space-y-4">
                <Label className="text-xs font-medium text-slate-700">Modeling Method</Label>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: "TABLE", label: "Table Selector", icon: Table2, desc: "Point & click objects" },
                    { id: "CUSTOM_SQL", label: "SQL Query", icon: Code, desc: "Write raw SQL" },
                  ].map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => handleChange("sourceType", method.id)}
                      className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all group ${
                        formData.sourceType === method.id 
                        ? "border-slate-900 bg-slate-50 shadow-sm" 
                        : "border-slate-100 text-slate-400 hover:border-slate-200"
                      }`}
                    >
                      <method.icon className={`h-6 w-6 mb-2 ${formData.sourceType === method.id ? "text-slate-900" : "text-slate-300"}`} />
                      <span className={`text-xs font-bold ${formData.sourceType === method.id ? "text-slate-900" : "text-slate-500"}`}>{method.label}</span>
                      <span className="text-[10px] mt-1 font-medium opacity-60 text-center">{method.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                {formData.sourceType !== "CUSTOM_SQL" ? (
                  <div className="space-y-5 animate-in fade-in duration-300">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="sourceName" className="text-[10px] font-bold uppercase text-slate-400">Database Object (Table/View)</Label>
                        <button 
                          type="button" 
                          onClick={() => formData.sourceConnId && fetchTables(formData.sourceConnId)}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
                        >
                          {loadingTables ? "FETCHING..." : "RELOAD LIST"}
                        </button>
                      </div>
                      
                      <Popover open={openSelector} onOpenChange={setOpenSelector}>
                        <PopoverTrigger 
                          className="flex w-full items-center justify-between h-11 border-slate-200 bg-white hover:bg-slate-50 px-4 rounded-lg shadow-sm text-sm"
                          disabled={loadingTables || !formData.sourceConnId}
                        >
                            <div className="flex items-center gap-2 truncate">
                              {formData.sourceName ? (
                                <>
                                  <Table2 className="h-4 w-4 text-slate-400" />
                                  <span className="font-mono text-sm">
                                    <span className="text-slate-400">{formData.sourceSchema}.</span>
                                    <span className="text-slate-900 font-bold">{formData.sourceName}</span>
                                  </span>
                                </>
                              ) : (
                                <span className="text-slate-400 text-sm">Search objects (e.g. public.users)...</span>
                              )}
                            </div>
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
                          <Command className="border-none">
                            <CommandInput placeholder="Search objects by schema or name..." />
                            <CommandList className="max-h-[300px]">
                              <CommandEmpty>No objects found in this connection.</CommandEmpty>
                              <CommandGroup heading="Available Tables & Views">
                                {tables.map((t) => (
                                  <CommandItem
                                    key={`${t.schema}.${t.name}`}
                                    value={`${t.schema}.${t.name}`}
                                    onSelect={(currentValue) => {
                                      const [selSchema, selName] = currentValue.split(".");
                                      setFormData({
                                        ...formData,
                                        sourceSchema: selSchema,
                                        sourceName: selName
                                      });
                                      setOpenSelector(false);
                                    }}
                                    className="py-3 px-4 flex items-center gap-3 cursor-pointer"
                                  >
                                    <Table2 className={cn("h-4 w-4", formData.sourceName === t.name && formData.sourceSchema === t.schema ? "text-slate-900" : "text-slate-300")} />
                                    <div className="flex flex-col gap-0.5 overflow-hidden">
                                      <span className="text-xs font-mono truncate">
                                        <span className="text-slate-400">{t.schema}.</span>
                                        <span className="font-bold text-slate-700">{t.name}</span>
                                      </span>
                                      <span className="text-[10px] text-slate-400 uppercase tracking-tighter">{t.type}</span>
                                    </div>
                                    <Check
                                      className={cn(
                                        "ml-auto h-4 w-4 text-emerald-500",
                                        formData.sourceName === t.name && formData.sourceSchema === t.schema
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <Label htmlFor="customSql" className="text-[10px] font-bold uppercase text-slate-400">SQL Definition</Label>
                    <div className="relative group">
                        <Textarea
                            id="customSql"
                            className="font-mono text-[11px] min-h-[220px] rounded-xl border-slate-200 bg-slate-900 text-slate-100 p-4 leading-relaxed focus:ring-0"
                            placeholder="SELECT * FROM raw_events..."
                            value={formData.customSql || ""}
                            onChange={(e) => handleChange("customSql", e.target.value)}
                        />
                        <div className="absolute top-2 right-2 text-[8px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono border border-slate-700">SQL</div>
                    </div>
                  </div>
                )}

                <div className="mt-6 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Data Validation</span>
                      <span className="text-xs text-slate-500">Preview the first 10 rows to verify the structure.</span>
                    </div>
                    <Button 
                      type="button" 
                      onClick={handlePreview}
                      disabled={loadingPreview || (formData.sourceType === "CUSTOM_SQL" ? !formData.customSql : (!formData.sourceSchema || !formData.sourceName))}
                      size="sm"
                      className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold shadow-sm"
                    >
                      {loadingPreview ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : "PREVIEW DATA"}
                    </Button>
                  </div>

                  {previewData ? (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-[10px] border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            {previewData.columns.slice(0, 5).map((col: {name: string}) => (
                              <th key={col.name} className="px-3 py-2 text-left font-bold text-slate-600 truncate">{col.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {previewData.rows.slice(0, 5).map((row: Record<string, unknown>, i: number) => (
                            <tr key={i}>
                              {previewData.columns.slice(0, 5).map((col: {name: string}) => (
                                <td key={col.name} className="px-3 py-2 text-slate-500 truncate max-w-[120px]">
                                  {String(row[col.name]) || <span className="text-slate-300 italic">null</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {previewData.rows.length === 0 && (
                        <div className="p-8 text-center text-slate-400 italic">No results found for this selection.</div>
                      )}
                    </div>
                  ) : (
                    <div className="h-24 flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-slate-400 text-[10px] font-medium italic">
                      Click preview to verify your data definition.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium text-slate-700">Display Identity</Label>
                <Input
                  id="name"
                  placeholder="e.g. Sales Transactions"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  required
                  className="h-11 rounded-lg border-slate-200 bg-white text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-xs font-medium text-slate-700">Business Context</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the purpose of this data model..."
                  value={formData.description || ""}
                  onChange={(e) => handleChange("description", e.target.value)}
                  className="min-h-[140px] rounded-lg border-slate-200 bg-white text-sm resize-none"
                />
              </div>

              <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/20">
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-emerald-800">Automatic Tagging Enabled</span>
                    <span className="text-[10px] text-emerald-600/80 mt-0.5">We&apos;ll automatically tag this model based on its source connection and structure.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Wizard Actions */}
      <div className="flex items-center justify-between pt-4">
        {currentStep === 1 ? (
          <Button 
             variant="ghost" 
             type="button" 
             onClick={onCancel} 
             disabled={submitting}
             className="text-slate-500 text-xs font-medium"
          >
            Cancel and Discard
          </Button>
        ) : (
          <Button 
             variant="outline" 
             type="button" 
             onClick={prevStep} 
             disabled={submitting}
             className="h-10 px-6 rounded-lg border-slate-200 text-xs font-medium"
          >
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        )}
        
         <div className="flex items-center gap-3">
          {currentStep < 3 ? (
            <Button 
               type="button" 
               onClick={nextStep}
               className="h-10 px-8 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium shadow-sm transition-all active:scale-95"
            >
              Continue <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button 
               onClick={(e) => {
                 // Auto-tagging before submit
                 const selectedConn = connections.find(c => c.id === formData.sourceConnId);
                 const autoTags: string[] = [];
                 if (selectedConn) {
                    autoTags.push(`src:${selectedConn.name.toLowerCase().replace(/\s+/g, '-')}`);
                    autoTags.push(`db:${selectedConn.type.toLowerCase()}`);
                 }
                 if (formData.sourceType === "CUSTOM_SQL") {
                    autoTags.push("sql");
                 } else if (formData.sourceName) {
                    autoTags.push("table");
                 }
                 
                 setFormData({ ...formData, tags: autoTags });
                 // Small timeout to ensure state update (or we could pass the tags directly to onSubmit if it was a payload)
                 // But since onSubmit likely uses formData from props, we need to be careful.
                 // Better: Pass the final payload to a wrapper or just let onSubmit use whatever formData has.
                 // In this case, onSubmit is passed from parent. Let's assume it handles it.
                 setTimeout(() => onSubmit(e as unknown as React.FormEvent), 10);
               }}
               disabled={submitting || !formData.name}
               className="h-10 px-8 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium shadow-sm transition-all active:scale-95"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {editingId ? "Update Model" : "Finalize & Launch"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
