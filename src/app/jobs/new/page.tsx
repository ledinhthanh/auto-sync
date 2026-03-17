"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowLeft, Database, Table2, Loader2, Workflow, Code, ShieldCheck, ShieldAlert, ShieldX, Info, ChevronsUpDown, Check } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { SchedulePicker } from "@/components/SchedulePicker";

interface Model {
  id: string;
  name: string;
  sourceType: string;
  sourceSchema: string;
  sourceName: string;
  sourceConn: {
    name: string;
    type: string;
  };
}

interface Connection {
  id: string;
  name: string;
  type: string;
}

function NewJobForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialModelId = searchParams.get('modelId');

    const [models, setModels] = useState<Model[]>([]);
    const [destConnections, setDestConnections] = useState<Connection[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [isFixingSchema, setIsFixingSchema] = useState(false);
    
    // Combobox state
    const [modelOpen, setModelOpen] = useState(false);
    
    // Dest Tables
    const [destObjects, setDestObjects] = useState<{name: string, type: string}[]>([]);
    const [loadingDestObjects, setLoadingDestObjects] = useState(false);
    const [useExistingTable, setUseExistingTable] = useState(false);
    const [tableOpen, setTableOpen] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        modelId: initialModelId || "",
        destConnId: "",
        destSchema: "public",
        destName: "",
        syncMode: "FULL_REFRESH",
        fullRefreshStrategy: "TRUNCATE",
        scheduleEnabled: false,
        schedule: "0 0 * * *",
    });

    const [validation, setValidation] = useState<{
        status: 'IDLE' | 'LOADING' | 'MATCH' | 'MISMATCH' | 'MISSING_DEST_TABLE' | 'ERROR';
        errors: { column: string, type: string, expected?: string, actual?: string }[];
        warnings: string[];
    }>({ status: 'IDLE', errors: [], warnings: [] });

    const [isValidating, setIsValidating] = useState(false);

    useEffect(() => {
        async function loadData() {
            setLoadingData(true);
            try {
                const [modelsRes, connsRes] = await Promise.all([
                    fetch("/api/models"),
                    fetch("/api/connections")
                ]);
                
                if (modelsRes.ok && connsRes.ok) {
                    const modelsData = await modelsRes.json();
                    const connsData = await connsRes.json();
                    
                    setModels(modelsData);
                    const dests = connsData.filter((c: Connection & { role?: string }) => c.role === 'DESTINATION' || c.role === 'BOTH');
                    setDestConnections(dests);

                    // Auto-fill destination connection if not set
                    setFormData(prev => {
                        let newDestConnId = prev.destConnId;
                        let newDestName = prev.destName;

                        if (dests.length > 0 && !newDestConnId) {
                            newDestConnId = dests[0].id;
                        }

                        // Auto-fill destination table name if modelId was provided
                        if (initialModelId) {
                            const selectedModel = modelsData.find((m: Model) => m.id === initialModelId);
                            if (selectedModel) {
                                newDestName = selectedModel.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                            }
                        }

                        return { ...prev, destConnId: newDestConnId, destName: newDestName };
                    });
                }
            } catch {
                toast.error("Failed to load Required Data");
            } finally {
                setLoadingData(false);
            }
        }
        loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialModelId]);

    // Fetch Destination Objects when connection or schema changes
    useEffect(() => {
        if (!formData.destConnId || !formData.destSchema || !useExistingTable) {
            setDestObjects([]);
            return;
        }

        async function loadDestObjects() {
            setLoadingDestObjects(true);
            try {
                const res = await fetch(`/api/connections/${formData.destConnId}/objects?schema=${encodeURIComponent(formData.destSchema)}`);
                if (res.ok) {
                    const data = await res.json();
                    setDestObjects(data.objects || []);
                } else {
                    setDestObjects([]);
                }
            } catch (error) {
                console.error("Failed to load objects", error);
                setDestObjects([]);
            } finally {
                setLoadingDestObjects(false);
            }
        }

        const timer = setTimeout(() => {
            loadDestObjects();
        }, 500);

        return () => clearTimeout(timer);
    }, [formData.destConnId, formData.destSchema, useExistingTable]);

    // Validation Effect
    useEffect(() => {
        const runValidation = async () => {
            setIsValidating(true);
            try {
                const res = await fetch("/api/syncs/validate-schema", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        modelId: formData.modelId,
                        destConnId: formData.destConnId,
                        destSchema: formData.destSchema,
                        destName: formData.destName
                    }),
                });
                if (res.ok) {
                    const result = await res.json();
                    setValidation(result);
                } else {
                    setValidation({ status: 'ERROR', errors: [], warnings: ['Failed to validate schema'] });
                }
            } catch {
                setValidation({ status: 'ERROR', errors: [], warnings: ['Connection error during validation'] });
            } finally {
                setIsValidating(false);
            }
        };
        // Expose runValidation to handleFixSchema
        (window as any).__runValidation = runValidation;

        const timer = setTimeout(() => {
            if (formData.modelId && formData.destConnId && formData.destName && formData.syncMode === 'FULL_REFRESH' && formData.fullRefreshStrategy === 'TRUNCATE') {
                runValidation();
            } else {
                setValidation({ status: 'IDLE', errors: [], warnings: [] });
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [formData.modelId, formData.destConnId, formData.destName, formData.destSchema, formData.syncMode, formData.fullRefreshStrategy]);



    const handleModelChange = (modelId: string) => {
        const selectedModel = models.find(m => m.id === modelId);
        if (selectedModel) {
            const sanitizedName = selectedModel.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            setFormData({ ...formData, modelId, destName: sanitizedName });
        } else {
            setFormData({ ...formData, modelId });
        }
    };

    const handleFixSchema = async () => {
        setIsFixingSchema(true);
        try {
            const res = await fetch("/api/syncs/fix-schema", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    modelId: formData.modelId,
                    destConnId: formData.destConnId,
                    destSchema: formData.destSchema,
                    destName: formData.destName
                }),
            });
            const result = await res.json();
            
            if (!res.ok || !result.success) {
                toast.error(result.error || "Failed to fix schema automatically");
            } else {
                toast.success("Schema fixed successfully! Re-validating...");
                if ((window as any).__runValidation) {
                    (window as any).__runValidation();
                }
            }
        } catch (error) {
            console.error("Fix schema error:", error);
            toast.error("Failed to connect to the server to fix schema");
        } finally {
            setIsFixingSchema(false);
        }
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.modelId || !formData.destConnId || !formData.destName) {
            toast.error("Please fill in all required fields");
            return;
        }

        if (formData.fullRefreshStrategy === 'TRUNCATE' && validation.status !== 'MATCH' && validation.status !== 'IDLE') {
            if (validation.status === 'MISMATCH') {
                toast.error("Schema mismatch detected. Please fix the destination table schema before continuing.");
                return;
            }
            if (validation.status === 'MISSING_DEST_TABLE') {
                toast.error("Destination table does not exist. Please create it first or use DROP strategy.");
                return;
            }
        }

        setSubmitting(true);
        try {
            const res = await fetch("/api/syncs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || "Failed to create Sync Job");
            }

            toast.success("Sync Job created successfully");
            router.push("/jobs");
        } catch (error) {
            console.error("Submit error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to create job");
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingData) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50/50">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    const selectedModel = models.find(m => m.id === formData.modelId);

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-24 px-4 sm:px-6">
            <div className="flex items-center space-x-4 py-8 border-b border-slate-100">
                <Link href="/jobs">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border border-slate-200">
                        <ArrowLeft className="h-4 w-4 text-slate-600" />
                    </Button>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Configure Sync Job</h2>
                    <p className="text-sm text-slate-500 mt-1">Define data movement from your modeled source to a destination.</p>
                </div>
            </div>

            <div className="grid gap-8">
                {/* Section 1: Source */}
                <Card className="shadow-sm border-slate-200 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                        <CardTitle className="text-sm font-bold flex items-center text-slate-800">
                            <span className="bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs mr-3">1</span>
                            Source Model Configuration
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-4 max-w-2xl">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Select Model</Label>
                            <Popover open={modelOpen} onOpenChange={setModelOpen}>
                                <PopoverTrigger
                                    className="flex w-full items-center justify-between h-12 bg-white text-left font-normal border border-slate-200 rounded-md px-3 text-sm shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-900"
                                >
                                    <span className="truncate">
                                        {formData.modelId
                                            ? models.find((model) => model.id === formData.modelId)?.name
                                            : "Select an existing data model..."}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </PopoverTrigger>
                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Search model name or table..." />
                                        <CommandList>
                                            <CommandEmpty>No model found.</CommandEmpty>
                                            <CommandGroup>
                                                {models.map((model) => (
                                                    <CommandItem
                                                        key={model.id}
                                                        value={model.name}
                                                        onSelect={() => {
                                                            handleModelChange(model.id);
                                                            setModelOpen(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                formData.modelId === model.id ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        <div className="flex items-center gap-3 py-1 flex-1">
                                                            <div className="h-6 w-6 rounded bg-slate-100 flex items-center justify-center">
                                                                {model.sourceType === 'CUSTOM_SQL' ? <Code className="h-3 w-3 text-slate-500" /> : <Table2 className="h-3 w-3 text-slate-500" />}
                                                            </div>
                                                            <div className="flex flex-col text-left">
                                                                <span className="font-semibold text-slate-900">{model.name}</span>
                                                                <span className="text-[10px] text-slate-400 font-mono">
                                                                    {model.sourceConn.name} • {model.sourceType === 'CUSTOM_SQL' ? 'Query' : `${model.sourceSchema}.${model.sourceName}`}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            
                            {!models.length && !loadingData && (
                                <p className="text-xs text-amber-600 font-medium">No models found. <Link href="/models" className="underline hover:text-amber-800">Create a model first.</Link></p>
                            )}

                            {selectedModel && (
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 mt-4 flex items-center gap-4">
                                    <div className="h-10 w-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center shrink-0">
                                        <Database className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Source Details</span>
                                        <span className="text-sm font-semibold text-slate-900 truncate">{selectedModel.name}</span>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 rounded text-slate-500 bg-white">{selectedModel.sourceConn.type}</Badge>
                                            <span className="text-xs text-slate-500 font-mono truncate">{selectedModel.sourceType === 'CUSTOM_SQL' ? 'Custom SQL' : `${selectedModel.sourceSchema}.${selectedModel.sourceName}`}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Section 2: Destination */}
                <Card className="shadow-sm border-slate-200 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                        <CardTitle className="text-sm font-bold flex items-center text-slate-800">
                            <span className="bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs mr-3">2</span>
                            Destination Configuration
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Target Connection</Label>
                                <Select value={formData.destConnId} onValueChange={(v) => v && setFormData({...formData, destConnId: v})}>
                                    <SelectTrigger className="bg-white h-11">
                                        <SelectValue placeholder="Select destination..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {destConnections.map(conn => (
                                            <SelectItem key={conn.id} value={conn.id}>{conn.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Target Schema</Label>
                                <Input 
                                    value={formData.destSchema} 
                                    onChange={(e) => setFormData({...formData, destSchema: e.target.value})} 
                                    className="bg-white h-11 font-mono text-sm" 
                                />
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-none">Target Table Name</Label>
                                    <div className="flex items-center space-x-2">
                                        <Switch 
                                            id="use-existing" 
                                            checked={useExistingTable} 
                                            onCheckedChange={(checked) => {
                                                setUseExistingTable(checked);
                                                if (checked && formData.destName) {
                                                    // optionally clear it if you want to force selection
                                                }
                                            }}
                                            className="data-[state=checked]:bg-indigo-600 scale-75 origin-right"
                                        />
                                        <Label htmlFor="use-existing" className="text-[10px] uppercase font-bold text-slate-500 cursor-pointer">
                                            Select Existing
                                        </Label>
                                    </div>
                                </div>
                                
                                {useExistingTable ? (
                                    <Popover open={tableOpen} onOpenChange={setTableOpen}>
                                        <PopoverTrigger
                                            className="flex w-full items-center justify-between h-11 bg-white font-mono text-sm shadow-sm border border-slate-200 rounded-md px-3 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                            disabled={loadingDestObjects}
                                        >
                                            <span className="truncate">
                                                {loadingDestObjects ? (
                                                    <span className="flex items-center text-slate-500"><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin"/> Loading...</span>
                                                ) : formData.destName ? (
                                                    formData.destName
                                                ) : (
                                                    <span className="text-slate-400">Select table...</span>
                                                )}
                                            </span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search tables..." className="h-9" />
                                                <CommandList>
                                                    <CommandEmpty>No table found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {destObjects.map((obj) => (
                                                            <CommandItem
                                                                key={obj.name}
                                                                value={obj.name}
                                                                onSelect={(val) => {
                                                                    setFormData({ ...formData, destName: val === formData.destName ? "" : val });
                                                                    setTableOpen(false);
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        formData.destName === obj.name ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                <Table2 className="mr-2 h-3.5 w-3.5 text-slate-400" />
                                                                <span className="font-mono">{obj.name}</span>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                ) : (
                                    <Input 
                                        value={formData.destName} 
                                        onChange={(e) => setFormData({...formData, destName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')})} 
                                        className="bg-white h-11 font-mono text-sm shadow-sm" 
                                        placeholder="e.g. users_synced"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="p-4 mt-6 bg-amber-50/50 border border-amber-200/60 rounded-xl flex items-start space-x-3 max-w-4xl">
                            <Database className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                            <div>
                                <h4 className="text-sm font-bold text-amber-900">Table Structure Management</h4>
                                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                                    The system will automatically create the table <span className="font-mono font-bold bg-amber-100 px-1 rounded">{formData.destSchema}.{formData.destName || 'table_name'}</span> 
                                    at the destination. If the sync mode requires, the table may be dropped and recreated to match the source schema exactly.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Section 3: Settings & Schedule */}
                <Card className="shadow-sm border-slate-200 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                        <CardTitle className="text-sm font-bold flex items-center text-slate-800">
                            <span className="bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs mr-3">3</span>
                            Sync Settings
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Job Name</Label>
                                <Input 
                                    value={formData.name} 
                                    onChange={(e) => setFormData({...formData, name: e.target.value})} 
                                    placeholder="e.g. Hourly Users Sync" 
                                    className="bg-white h-11" 
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sync Mode</Label>
                                <Select value={formData.syncMode} onValueChange={(v) => v && setFormData({...formData, syncMode: v})}>
                                    <SelectTrigger className="bg-white h-11">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="FULL_REFRESH" className="font-medium">Full Refresh</SelectItem>
                                        <SelectItem value="INCREMENTAL" disabled className="font-medium">Incremental <span className="text-amber-500 font-normal ml-1">(Coming Soon)</span></SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {formData.syncMode === 'FULL_REFRESH' && (
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cleanup Strategy</Label>
                                    <Select value={formData.fullRefreshStrategy} onValueChange={(v) => v && setFormData({...formData, fullRefreshStrategy: v})}>
                                        <SelectTrigger className="bg-white h-11">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="TRUNCATE" className="font-medium">Truncate <span className="text-slate-400 font-normal ml-1">(Safe - preserves views)</span></SelectItem>
                                            <SelectItem value="DROP" className="font-medium">Drop <span className="text-red-400 font-normal ml-1">(Destructive - may fail if views exist)</span></SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-100 max-w-3xl">
                            <SchedulePicker 
                                value={formData.schedule}
                                enabled={formData.scheduleEnabled}
                                onChange={(cron: string, enabled: boolean) => setFormData(prev => ({ ...prev, schedule: cron, scheduleEnabled: enabled }))}
                            />
                        </div>

                        {formData.syncMode === 'FULL_REFRESH' && formData.fullRefreshStrategy === 'TRUNCATE' && (
                            <div className="mt-8 pt-6 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                            Schema Compatibility Health
                                            {isValidating && <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />}
                                        </h3>
                                        <p className="text-xs text-slate-500">Validation ensures the destination table matches your source model.</p>
                                    </div>
                                    <Badge 
                                        variant="outline" 
                                        className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                                            validation.status === 'MATCH' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                            validation.status === 'MISMATCH' ? "bg-red-50 text-red-700 border-red-200" :
                                            validation.status === 'MISSING_DEST_TABLE' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                            "bg-slate-50 text-slate-500 border-slate-200"
                                        )}
                                    >
                                        {validation.status}
                                    </Badge>
                                </div>

                                <Card className={cn(
                                    "border shadow-none overflow-hidden transition-all",
                                    validation.status === 'MATCH' ? "border-emerald-100 bg-emerald-50/20" :
                                    validation.status === 'MISMATCH' ? "border-red-100 bg-red-50/20" :
                                    validation.status === 'MISSING_DEST_TABLE' ? "border-amber-100 bg-amber-50/20" :
                                    "border-slate-100 bg-slate-50/30"
                                )}>
                                    <CardContent className="p-4">
                                        {validation.status === 'IDLE' && (
                                            <div className="flex items-center gap-3 text-slate-400 py-2">
                                                <Info className="h-5 w-5" />
                                                <span className="text-xs font-medium italic">Configure destination to trigger validation...</span>
                                            </div>
                                        )}

                                        {validation.status === 'MATCH' && (
                                            <div className="flex items-start gap-4">
                                                <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-emerald-900">Schemas matched successfully!</p>
                                                    <p className="text-xs text-emerald-700/80 mt-1">The destination table is fully compatible with the source model.</p>
                                                </div>
                                            </div>
                                        )}

                                        {validation.status === 'MISSING_DEST_TABLE' && (
                                            <div className="flex items-start gap-4">
                                                <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                                                    <ShieldAlert className="h-5 w-5 text-amber-600" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-amber-900">Destination table not found</p>
                                                    <p className="text-xs text-amber-700/80 mt-1">The table <span className="font-mono font-bold">{formData.destSchema}.{formData.destName}</span> does not exist yet. Please create it or use <strong>DROP</strong> strategy.</p>
                                                </div>
                                            </div>
                                        )}

                                        {validation.status === 'MISMATCH' && (
                                            <div className="space-y-4">
                                                <div className="flex items-start gap-4">
                                                    <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                                        <ShieldX className="h-5 w-5 text-red-600" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-bold text-red-900">Incompatible Schema Detected</p>
                                                        <p className="text-xs text-red-700/80 mt-1">There are critical differences between source and destination.</p>
                                                    </div>
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline" 
                                                        className="h-8 gap-2 bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300"
                                                        onClick={(e) => { e.preventDefault(); handleFixSchema(); }}
                                                        disabled={isFixingSchema}
                                                    >
                                                        {isFixingSchema ? <Loader2 className="h-3 w-3 animate-spin" /> : "Fix Schema"}
                                                    </Button>
                                                </div>
                                                
                                                <div className="space-y-2 max-w-2xl px-1">
                                                    {validation.errors.map((err: { column: string, type: string, expected?: string, actual?: string }, idx: number) => (
                                                        <div key={idx} className="flex items-center gap-2 text-xs bg-white/60 p-2 rounded border border-red-50 shadow-sm">
                                                            <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                                            <span className="font-mono font-bold text-slate-700">{err.column}</span>
                                                            <span className="text-slate-500">
                                                                {err.type === 'MISSING_IN_DEST' ? 'is missing in destination table' : 
                                                                 err.type === 'TYPE_MISMATCH' ? `type mismatch (expected ${err.expected}, found ${err.actual})` :
                                                                 err.type === 'NULLABILITY_MISMATCH' ? `nullability mismatch (expected ${err.expected}, found ${err.actual})` :
                                                                 err.type}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {validation.warnings.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-slate-200/50">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Warnings & Tips</p>
                                                <div className="space-y-2">
                                                    {validation.warnings.map((w: string, idx: number) => (
                                                        <p key={idx} className="text-xs text-slate-600 flex items-center gap-2">
                                                            <div className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                                                            {w}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="fixed bottom-0 left-60 right-0 p-4 border-t border-slate-200 bg-white/90 backdrop-blur-md flex items-center justify-end space-x-3 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
                <Button variant="ghost" onClick={() => router.back()} className="font-medium text-xs h-10 px-6">Cancel</Button>
                <Button 
                    onClick={handleSubmit} 
                    disabled={submitting || !formData.name || !formData.modelId || !formData.destConnId || !formData.destName}
                    className="bg-indigo-600 hover:bg-indigo-700 shadow-md font-bold text-xs h-10 px-8 transition-all active:scale-95"
                >
                    {submitting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Workflow className="mr-2 h-4 w-4" />
                    )}
                    Create Sync Job
                </Button>
            </div>
        </div>
    );
}

export default function NewJobPage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen items-center justify-center bg-slate-50/50">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        }>
            <NewJobForm />
        </Suspense>
    );
}

