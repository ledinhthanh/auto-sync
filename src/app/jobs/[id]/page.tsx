"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Clock, Database, Play, Pause, Trash2, Edit2, ArrowLeft, Loader2, Workflow, Code, CheckCircle2, AlertCircle, FileText, MoreHorizontal, ScrollText, XCircle, Zap, ShieldCheck, ShieldX } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SchedulePicker } from "@/components/SchedulePicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    stepNumber: number | null;
    metadata?: Record<string, unknown>;
}

function TerminalLog({ logs, isLive }: { logs: LogEntry[], isLive?: boolean }) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }, [logs]);

    const handleCopyAll = () => {
        const text = logs.map(l => `[${l.timestamp}] ${l.level.toUpperCase()}: ${l.message}`).join('\n');
        navigator.clipboard.writeText(text);
        toast.success("All logs copied to clipboard");
    };

    return (
        <div ref={scrollRef} className="flex flex-col h-full bg-[#0d1117] rounded-xl border border-[#30363d] overflow-hidden font-mono text-[11px] shadow-2xl relative">
            <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d] z-10">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                    </div>
                    <span className="ml-2 text-[#7d8590] font-bold uppercase tracking-widest text-[9px]">Execution Console</span>
                </div>
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleCopyAll}
                        className="h-6 text-[9px] uppercase tracking-widest font-black text-[#7d8590] hover:text-white hover:bg-white/10"
                    >
                        Copy All
                    </Button>
                    {isLive && (
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-emerald-500 font-bold uppercase tracking-tighter text-[9px]">Live Streaming</span>
                        </div>
                    )}
                </div>
            </div>
            
            <ScrollArea className="flex-1 p-4 h-full">
                <div className="space-y-0.5 whitespace-pre-wrap pb-10">
                    {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
                            <FileText className="h-10 w-10 opacity-30" />
                            <div className="text-center px-4">
                                <p className="text-xs font-bold uppercase tracking-widest text-[#7d8590]">No execution logs captured</p>
                                <p className="text-[10px] text-[#484f58] mt-1 font-medium max-w-[200px] mx-auto">Logs may have been purged or the run failed prematurely.</p>
                            </div>
                        </div>
                    ) : logs.map((log, i) => {
                        const ts = log.timestamp ? (new Date(log.timestamp).toLocaleTimeString('en-GB') === 'Invalid Date' ? '' : new Date(log.timestamp).toLocaleTimeString('en-GB')) : '';
                        const levelColor = 
                            log.level === 'error' ? 'text-red-400' :
                            log.level === 'warn' ? 'text-amber-400' :
                            log.level === 'debug' ? 'text-slate-500' : 'text-indigo-400';
                        
                        return (
                            <div key={i} className="group flex flex-col hover:bg-white/5 transition-colors py-0.5 rounded px-1 -mx-1">
                                <div className="flex items-start gap-3">
                                    <span className="text-[#484f58] shrink-0 font-bold w-[70px]">[{ts || '--:--:--'}]</span>
                                    <span className={cn("font-black uppercase w-10 shrink-0", levelColor)}>{log.level}</span>
                                    <span className="text-[#7d8590] w-16 shrink-0 font-bold">
                                        {log.stepNumber ? `[Step ${log.stepNumber}]` : ' '.repeat(8)}
                                    </span>
                                    <span className="text-[#c9d1d9] flex-1 leading-normal tracking-tight">{log.message}</span>
                                </div>
                                
                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                    <div className="ml-[145px] mt-1 flex flex-wrap gap-x-3 gap-y-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                        {Object.entries(log.metadata).map(([k, v]) => (
                                            !!v && <span key={k} className="text-[10px] text-[#58a6ff]">
                                                <span className="text-[#8b949e]">{k}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {isLive && (
                        <div className="flex items-center gap-2 mt-4 ml-1 opacity-60">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                            </div>
                            <span className="text-[10px] text-emerald-500/80 font-bold uppercase tracking-widest pl-2">Streaming Logs...</span>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

export default function JobDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [job, setJob] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [runs, setRuns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [runningJob, setRunningJob] = useState(false);
    const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selectedRun, setSelectedRun] = useState<any | null>(null);
    const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [schemaValidation, setSchemaValidation] = useState<{ status: string; errors: any[]; warnings: string[] } | null>(null);
    const [isValidatingSchema, setIsValidatingSchema] = useState(false);
    const [isFixingSchema, setIsFixingSchema] = useState(false);
    const [lastFixResult, setLastFixResult] = useState<{ sql: string[]; timestamp: Date } | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [editFormData, setEditFormData] = useState({
        name: "",
        schedule: "",
        scheduleEnabled: false,
        syncMode: "",
        fullRefreshStrategy: ""
    });

    // Derived state for UI sync status
    const latestRun = runs[0];
    const isJobRunning = runningJob || (latestRun && (latestRun.status === 'RUNNING' || latestRun.status === 'PENDING'));
    const displayStatus = isJobRunning ? 'RUNNING' : job?.status;

    const fetchJobDetails = useCallback(async () => {
        try {
            const res = await fetch(`/api/syncs/${id}`);
            if (res.ok) {
                const data = await res.json();
                setJob(data);
            } else if (res.status === 404) {
               router.push('/404');
            }
        } catch {
            toast.error("Failed to load job details");
        }
    }, [id, router]);

    const fetchJobRuns = useCallback(async () => {
        try {
            const res = await fetch(`/api/syncs/${id}/runs?limit=10`);
            if (res.ok) {
                const data = await res.json();
                setRuns(data);
            }
        } catch {
            console.error("Failed to load job runs");
        }
    }, [id]);

    const loadData = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchJobDetails(), fetchJobRuns()]);
        setLoading(false);
    }, [fetchJobDetails, fetchJobRuns]);

    useEffect(() => {
        if (id) {
            loadData();
        }
    }, [id, loadData]);

    // Validate schema when job loads (TRUNCATE mode only)
    useEffect(() => {
        if (job) {
            validateSchema(job);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job?.id]);

    // Polling for status when running
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isJobRunning) {
            interval = setInterval(() => {
                fetchJobDetails();
                fetchJobRuns();
            }, 3000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isJobRunning, fetchJobDetails, fetchJobRuns]);

    const validateSchema = async (currentJob: any) => {
        if (!currentJob || currentJob.fullRefreshStrategy !== 'TRUNCATE' || !currentJob.modelId || !currentJob.destConnId) return;
        setIsValidatingSchema(true);
        try {
            const res = await fetch("/api/syncs/validate-schema", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    modelId: currentJob.modelId,
                    destConnId: currentJob.destConnId,
                    destSchema: currentJob.destSchema,
                    destName: currentJob.destName,
                }),
            });
            if (res.ok) setSchemaValidation(await res.json());
        } catch { /* silently fail */ }
        finally { setIsValidatingSchema(false); }
    };

    const handleFixSchema = async () => {
        if (!job) return;
        setIsFixingSchema(true);
        try {
            const res = await fetch("/api/syncs/fix-schema", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    modelId: job.modelId,
                    destConnId: job.destConnId,
                    destSchema: job.destSchema,
                    destName: job.destName
                }),
            });
            const result = await res.json();
            if (!res.ok || !result.success) {
                toast.error(result.error || "Failed to fix schema automatically");
            } else {
                if (result.executedSql?.length > 0) {
                    setLastFixResult({ sql: result.executedSql, timestamp: new Date() });
                    toast.success(`Schema fixed! ${result.executedSql.length} alteration(s) applied. Re-validating...`);
                } else {
                    toast.success("No changes needed. Re-validating...");
                }
                validateSchema(job);
            }
        } catch { toast.error("Error fixing schema"); }
        finally { setIsFixingSchema(false); }
    };

    const openEditModal = () => {
        if (!job) return;
        setEditFormData({
            name: job.name,
            schedule: job.schedule || "0 0 * * *",
            scheduleEnabled: job.scheduleEnabled,
            syncMode: job.syncMode,
            fullRefreshStrategy: job.fullRefreshStrategy
        });
        setIsEditModalOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editFormData.name) {
            toast.error("Job name is required");
            return;
        }
        setIsSavingEdit(true);
        try {
            const res = await fetch(`/api/syncs/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData)
            });
            if (res.ok) {
                toast.success("Job configuration updated");
                setIsEditModalOpen(false);
                fetchJobDetails();
            } else {
                const err = await res.json();
                throw new Error(err.error || "Failed to update job");
            }
        } catch (error: any) {
            toast.error(error.message || "Error updating job configuration");
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this job data sync? This cannot be undone.")) return;
        
        try {
            const res = await fetch(`/api/syncs/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success("Job deleted");
                router.push('/jobs');
            } else {
                throw new Error("Failed to delete");
            }
        } catch {
            toast.error("Error deleting job");
        }
    };

    const toggleStatus = async () => {
        if (!job) return;
        const newStatus = job.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        
        try {
            const res = await fetch(`/api/syncs/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                toast.success(`Job ${newStatus === 'ACTIVE' ? 'resumed' : 'paused'}`);
                fetchJobDetails();
            } else {
                throw new Error("Failed to update status");
            }
        } catch {
            toast.error("Error updating job status");
        }
    };

    const updateStrategy = async (strategy: string) => {
        if (!job) return;
        try {
            const res = await fetch(`/api/syncs/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullRefreshStrategy: strategy })
            });
            if (res.ok) {
                toast.success(`Strategy updated to ${strategy}`);
                fetchJobDetails();
            } else {
                throw new Error("Failed to update strategy");
            }
        } catch (error: any) {
            toast.error(error.message || "Error updating strategy");
        }
    };

    const runJob = async () => {
         try {
             setRunningJob(true);
             const res = await fetch(`/api/syncs/${id}/run`, { method: 'POST' });
             if (!res.ok) throw new Error("Failed to trigger job");
             
             toast.success("Job triggered successfully!");
             
             // Immediate refresh to catch the initial state change
             fetchJobRuns();
             fetchJobDetails();
             
             // The polling useEffect will take over from here
             setTimeout(() => setRunningJob(false), 2000);
         } catch (error: any) {
             toast.error(error.message || "Error triggering job");
             setRunningJob(false);
         }
    };

    useEffect(() => {
        if (!selectedRun || (selectedRun.status !== 'RUNNING' && selectedRun.status !== 'PENDING')) {
            setLiveLogs([]);
            setIsStreaming(false);
            return;
        }

        let eventSource: EventSource | null = null;
        setLiveLogs([]);
        setIsStreaming(true);

        const connect = () => {
            eventSource = new EventSource(`/api/runs/${selectedRun.id}/logs`);
            
            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'DONE') {
                    setIsStreaming(false);
                    eventSource?.close();
                    fetchJobRuns();
                    fetchJobDetails();
                    return;
                }
                setLiveLogs(prev => [...prev, data]);
            };

            eventSource.onerror = () => {
                eventSource?.close();
                setIsStreaming(false);
            };
        };

        connect();

        return () => {
            eventSource?.close();
            setIsStreaming(false);
        };
    }, [selectedRun, fetchJobRuns, fetchJobDetails]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-4" />
                <h3 className="text-lg font-semibold text-slate-800">Loading Job Definition</h3>
                <p className="text-sm text-slate-500">Retrieving configuration and execution logs...</p>
            </div>
        );
    }

    if (!job) return null;

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10 px-4 sm:px-6">
            <div className="py-2">
                <Link href="/jobs" className="inline-flex items-center text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors">
                    <ArrowLeft className="mr-1.5 h-3 w-3" /> Back to Sync Jobs
                </Link>
            </div>

            {/* Header & Control Ribbon */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 px-1">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <Badge variant="outline" className={cn(
                            "capitalize tracking-widest text-[10px] uppercase justify-center py-1 opacity-90 border-2 font-black",
                            displayStatus === "ACTIVE" && "text-emerald-700 bg-emerald-50 border-emerald-200/50",
                            displayStatus === "RUNNING" && "text-blue-700 bg-blue-50 border-blue-200/50 animate-pulse",
                            displayStatus === "ERROR" && "text-red-700 bg-red-50 border-red-200/50",
                            displayStatus === "PAUSED" && "text-slate-600 bg-slate-100 border-slate-200/50",
                            displayStatus === "DRAFT" && "text-amber-700 bg-amber-50 border-amber-200/50"
                        )}>
                            {displayStatus}
                        </Badge>
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-indigo-100 bg-indigo-50 text-indigo-700 shadow-sm">
                            <Workflow className="h-3 w-3" />
                            <span className="text-[10px] font-black uppercase tracking-widest">{job.syncMode.replace('_', ' ')}</span>
                        </div>
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight uppercase">
                            {job.name}
                        </h1>
                        <div className="flex flex-wrap items-center mt-3 gap-2 text-sm text-slate-500">
                             <div className="flex items-center bg-slate-100 px-2 py-1 rounded-md text-xs font-mono font-bold text-slate-700" title={job.model.sourceConn?.name}>
                                {job.model.sourceType === 'CUSTOM_SQL' ? <Code className="h-3 w-3 mr-1.5 text-slate-400" /> : <Database className="h-3 w-3 mr-1.5 text-slate-400" />}
                                {job.model.sourceConn?.name || 'Local'} / {job.model.name}
                             </div>
                             <span className="text-slate-300 mx-1">→</span>
                             <div className="flex items-center bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-md text-xs font-mono font-bold text-indigo-700">
                                {job.destSchema}.{job.destName}
                             </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 py-1">
                    <Button 
                        variant="outline" 
                        onClick={toggleStatus}
                        className={cn(
                            "h-10 bg-white font-bold transition-all shadow-sm",
                            job.status === 'ACTIVE' 
                                ? "text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700" 
                                : "text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                        )}
                    >
                        {job.status === 'ACTIVE' ? (
                            <><Pause className="mr-2 h-4 w-4" /> Pause Sync</>
                        ) : (
                            <><Play className="mr-2 h-4 w-4" /> Resume Sync</>
                        )}
                    </Button>
                    
                    <Button 
                        onClick={runJob}
                        disabled={isJobRunning}
                        className={cn(
                            "h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm transition-all shadow-emerald-600/20",
                            isJobRunning && "opacity-80"
                        )}
                    >
                        {isJobRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        {isJobRunning ? "Running..." : "Sync Now"}
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900 h-10 w-10 shadow-sm text-slate-500">
                            <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 p-1">
                            <DropdownMenuItem onClick={openEditModal} className="text-xs cursor-pointer rounded-md py-2">
                                <Edit2 className="mr-2 h-3.5 w-3.5" /> <span className="font-medium">Edit Configuration</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-100" />
                            <DropdownMenuItem onClick={handleDelete} className="text-xs cursor-pointer rounded-md py-2 text-red-600 focus:bg-red-50 focus:text-red-700">
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> <span className="font-bold">Delete Job</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Config Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 px-1 mt-4">
                <div className="p-4 rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm flex flex-col justify-center min-w-0">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                       <Database className="h-3 w-3" /> Destination
                   </span>
                   <span className="text-sm font-black text-slate-900 uppercase tracking-tight truncate border-b border-dashed border-slate-200" title={job.destConn?.name}>
                       {job.destConn?.name || 'Unknown'}
                   </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200/60 bg-white shadow-sm flex flex-col justify-center group/card transition-all hover:border-indigo-200 min-w-0">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                       <Zap className="h-3 w-3 text-amber-500" /> Strategy
                   </span>
                   <DropdownMenu>
                       <DropdownMenuTrigger className="flex items-center justify-between w-full outline-none">
                           <div className="flex items-center gap-2">
                               <span className="text-sm font-black text-slate-900 tracking-tight uppercase">
                                   {job.fullRefreshStrategy || 'TRUNCATE'}
                               </span>
                               <Badge variant="outline" className="text-[8px] font-bold h-3.5 px-1 border-slate-200 text-slate-400 uppercase">
                                   Edit
                               </Badge>
                           </div>
                           <MoreHorizontal className="h-3 w-3 text-slate-300 group-hover/card:text-indigo-400" />
                       </DropdownMenuTrigger>
                       <DropdownMenuContent align="start" className="w-40">
                           <DropdownMenuItem onClick={() => updateStrategy('TRUNCATE')} className="text-xs font-bold uppercase py-2">
                               TRUNCATE
                           </DropdownMenuItem>
                           <DropdownMenuItem onClick={() => updateStrategy('DROP')} className="text-xs font-bold uppercase py-2">
                               DROP (RECREATE)
                           </DropdownMenuItem>
                       </DropdownMenuContent>
                   </DropdownMenu>
                </div>

                <div className="p-4 rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm flex flex-col justify-center min-w-0">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                       <Clock className="h-3 w-3" /> Schedule
                   </span>
                   <span className="text-xs font-bold text-slate-700 font-mono bg-slate-100/50 px-2 py-0.5 rounded-md inline-flex w-fit truncate">
                       {job.scheduleEnabled ? job.schedule : 'Manual'}
                   </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm flex flex-col justify-center min-w-0">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                       <Play className="h-3 w-3 text-emerald-500" /> Last Run
                   </span>
                   <div className="flex flex-col gap-0.5 overflow-hidden">
                       {job.lastRunAt ? (
                           <>
                               <span className="text-xs font-bold text-slate-700 truncate">
                                   {formatDistanceToNow(new Date(job.lastRunAt), { addSuffix: true })}
                               </span>
                               <span className={cn("text-[9px] font-black uppercase tracking-wider", job.lastRunStatus === 'SUCCESS' ? 'text-emerald-600' : 'text-red-600')}>
                                   {job.lastRunStatus}
                               </span>
                           </>
                       ) : (
                           <span className="text-xs text-slate-400 italic font-medium">Never</span>
                       )}
                   </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm flex flex-col justify-center relative overflow-hidden min-w-0">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5 relative z-10">
                       <FileText className="h-3 w-3" /> Synced
                   </span>
                   <span className="text-lg font-black text-slate-900 leading-none relative z-10">
                       {runs.reduce((acc, r) => acc + (r.rowsProcessed || 0), 0).toLocaleString()}
                   </span>
                </div>
            </div>

            {/* Schema Compatibility Health */}
            {job.fullRefreshStrategy === 'TRUNCATE' && (
                <div className="pt-4">
                    <Card className={cn(
                        "border shadow-sm overflow-hidden transition-all",
                        schemaValidation?.status === 'MATCH' ? "border-emerald-100 bg-emerald-50/20" :
                        schemaValidation?.status === 'MISMATCH' ? "border-red-100 bg-red-50/20" :
                        "border-slate-100 bg-white"
                    )}>
                        <CardHeader className="py-3 px-5 border-b border-slate-100 flex-row items-center justify-between space-y-0">
                            <div className="space-y-0.5">
                                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
                                    Schema Compatibility Health
                                    {isValidatingSchema && <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />}
                                </CardTitle>
                                <p className="text-xs text-slate-400">Checks that the destination table matches your source model schema.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {schemaValidation?.status === 'MISMATCH' && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-2 bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                        onClick={handleFixSchema}
                                        disabled={isFixingSchema}
                                    >
                                        {isFixingSchema ? <Loader2 className="h-3 w-3 animate-spin" /> : "Fix Schema"}
                                    </Button>
                                )}
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "text-[10px] font-black uppercase tracking-wider",
                                        schemaValidation?.status === 'MATCH' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                        schemaValidation?.status === 'MISMATCH' ? "bg-red-50 text-red-700 border-red-200" :
                                        "bg-slate-50 text-slate-500 border-slate-200"
                                    )}
                                >
                                    {schemaValidation?.status ?? 'CHECKING'}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4">
                            {!schemaValidation && <p className="text-xs text-slate-400 italic">Running schema check...</p>}
                            {schemaValidation?.status === 'MATCH' && (
                                <div className="flex items-center gap-3">
                                    <ShieldCheck className="h-5 w-5 text-emerald-500" />
                                    <p className="text-sm font-bold text-emerald-700">All schemas match. Destination table is compatible.</p>
                                </div>
                            )}
                            {schemaValidation?.status === 'MISMATCH' && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <ShieldX className="h-5 w-5 text-red-500 shrink-0" />
                                        <p className="text-sm font-bold text-red-700">Incompatible Schema Detected – click "Fix Schema" to auto-repair.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        {schemaValidation.errors.map((err: any, idx: number) => (
                                            <div key={idx} className="flex items-center gap-2 text-xs bg-white/80 p-2 rounded border border-red-50 shadow-sm">
                                                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                                <span className="font-mono font-bold text-slate-700">{err.column}</span>
                                                <span className="text-slate-500">
                                                    {err.type === 'MISSING_IN_DEST' ? 'is missing in destination' :
                                                     err.type === 'TYPE_MISMATCH' ? `type mismatch (expected ${err.expected}, found ${err.actual})` :
                                                     err.type === 'NULLABILITY_MISMATCH' ? `nullability mismatch (expected ${err.expected}, found ${err.actual})` :
                                                     err.type === 'EXTRA_IN_DEST' ? `extra NOT NULL column (no source mapping)` :
                                                     err.type}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {schemaValidation?.warnings && schemaValidation.warnings.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    {schemaValidation.warnings.map((w: string, idx: number) => (
                                        <p key={idx} className="text-xs text-amber-600">{w}</p>
                                    ))}
                                </div>
                            )}
                            {lastFixResult && (
                                <div className="mt-3 border-t border-slate-100 pt-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                        Last Fix Applied — {lastFixResult.timestamp.toLocaleTimeString()}
                                    </p>
                                    <div className="bg-[#0d1117] rounded-lg p-3 space-y-1 font-mono overflow-x-auto">
                                        {lastFixResult.sql.map((sql, idx) => (
                                            <p key={idx} className="text-[11px] text-emerald-400">{sql};</p>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Run History List */}
            <div className="pt-6">
                <Card className="border-slate-200/60 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">Execution History</CardTitle>
                                <CardDescription className="text-xs mt-1">Recent synchronization logs and outcomes for this job.</CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" onClick={fetchJobRuns} className="h-8 text-slate-500 hover:text-slate-900">
                                Refresh logs
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {runs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-white">
                                <Workflow className="h-10 w-10 text-slate-200 mb-4" />
                                <h3 className="text-base font-bold text-slate-800">No execution history</h3>
                                <p className="text-sm mt-1 max-w-sm text-center">Run the job manually or wait for the schedule to trigger to see history logs here.</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-white">
                                    <TableRow className="hover:bg-transparent border-b-slate-100">
                                        <TableHead className="w-[140px] text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Triggered By</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Start Time</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Duration</TableHead>
                                        <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Rows</TableHead>
                                        <TableHead className="w-12"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="divide-y divide-slate-50/80 bg-white">
                                    {runs.map((run) => (
                                        <>
                                        <TableRow 
                                            key={run.id} 
                                            onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                                            className={cn(
                                                "transition-colors",
                                                (run.errorMessage || run.logOutput) ? "cursor-pointer hover:bg-slate-50/80" : "hover:bg-slate-50/50",
                                                expandedRunId === run.id && "bg-slate-50/80"
                                            )}
                                        >
                                             <TableCell className="py-4">
                                                <div className="flex items-center gap-2">
                                                    {run.status === 'SUCCESS' ? (
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                    ) : run.status === 'RUNNING' ? (
                                                        <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                                                    ) : run.status === 'FAILED' ? (
                                                        <AlertCircle className="h-4 w-4 text-red-500" />
                                                    ) : (
                                                        <Clock className="h-4 w-4 text-slate-400" />
                                                    )}
                                                    <span className={cn(
                                                        "text-xs font-bold tracking-wide",
                                                        run.status === 'FAILED' && 'text-red-600'
                                                    )}>{run.status}</span>
                                                    {(run.errorMessage || run.logOutput) && (
                                                        <span className="ml-auto text-[9px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider">
                                                            {expandedRunId === run.id ? 'Hide' : 'Details'}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="px-1.5 py-0 text-[9px] font-mono tracking-wider rounded bg-slate-100 text-slate-500 uppercase">
                                                    {run.triggeredBy}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-600 font-medium">
                                                {format(new Date(run.startedAt), "MMM d, yyyy HH:mm:ss")}
                                            </TableCell>
                                            <TableCell className="text-xs font-mono text-slate-500">
                                                {run.durationMs != null ? (
                                                    run.durationMs < 1000 ? `${run.durationMs}ms` : `${(run.durationMs / 1000).toFixed(1)}s`
                                                ) : run.finishedAt ? (
                                                    `${Math.max(1, Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000))}s`
                                                ) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-sm font-bold text-slate-800">
                                                {run.rowsProcessed != null ? run.rowsProcessed.toLocaleString() : '-'}
                                                {run.status === 'SUCCESS' && run.rowsProcessed != null && run.rowsProcessed > 0 && (
                                                    <span className="ml-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">Synced</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="w-8 pr-4">
                                                {(run.errorMessage || run.logOutput) && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setSelectedRun(run); }}
                                                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                        title="View full log"
                                                    >
                                                        <ScrollText className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                        {expandedRunId === run.id && (run.errorMessage || run.logOutput) && (
                                            <TableRow key={`${run.id}-detail`}>
                                                <TableCell colSpan={6} className="py-0 px-6 pb-6 bg-slate-50/50">
                                                    <div className="mt-2 space-y-4 max-w-5xl">
                                                        {run.errorMessage && (
                                                            <div className="rounded-xl border border-red-100 bg-white shadow-sm overflow-hidden">
                                                                <div className="flex items-center justify-between px-4 py-2 bg-red-50 border-b border-red-100">
                                                                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1.5">
                                                                        <AlertCircle className="h-3 w-3" /> Error Message
                                                                    </p>
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="sm" 
                                                                        className="h-6 text-[9px] uppercase font-bold text-red-600 hover:bg-red-100"
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(run.errorMessage);
                                                                            toast.success("Error copied");
                                                                        }}
                                                                    >
                                                                        Copy
                                                                    </Button>
                                                                </div>
                                                                <div className="p-4">
                                                                    <pre className="text-xs text-red-700/90 font-mono whitespace-pre-wrap break-all">{run.errorMessage}</pre>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {run.logOutput && (
                                                            <div className="rounded-xl border border-slate-800 bg-[#0d1117] shadow-xl overflow-hidden">
                                                                <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-slate-800">
                                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                                                        <FileText className="h-3 w-3" /> Execution Log Snippet
                                                                    </p>
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="sm" 
                                                                        className="h-6 text-[9px] uppercase font-bold text-slate-500 hover:text-white hover:bg-white/10"
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(run.logOutput);
                                                                            toast.success("Log copied");
                                                                        }}
                                                                    >
                                                                        Copy Snippet
                                                                    </Button>
                                                                </div>
                                                                <div className="p-4">
                                                                    <pre className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap break-all max-h-[500px] overflow-y-auto custom-scrollbar">{run.logOutput}</pre>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        </>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Run Log Detail Modal */}
            <Dialog open={!!selectedRun} onOpenChange={(open) => { if (!open) setSelectedRun(null); }}>
                <DialogContent className="max-w-[95vw] lg:max-w-7xl w-full max-h-[92vh] h-[88vh] flex flex-col p-0 overflow-hidden bg-white border-0 shadow-2xl">
                    <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
                        <div className="flex items-start gap-4">
                            <div className={cn(
                                "p-2 rounded-xl border shrink-0",
                                selectedRun?.status === 'FAILED' 
                                    ? "bg-red-50 border-red-200 text-red-500" 
                                    : "bg-emerald-50 border-emerald-200 text-emerald-500"
                            )}>
                                {selectedRun?.status === 'FAILED' 
                                    ? <XCircle className="h-5 w-5" /> 
                                    : <CheckCircle2 className="h-5 w-5" />
                                }
                            </div>
                            <div>
                                <DialogTitle className="text-sm font-black uppercase tracking-widest text-slate-900">
                                    Execution Log
                                </DialogTitle>
                                <DialogDescription className="text-xs mt-1 flex items-center gap-3">
                                    <span className={cn(
                                        "font-bold uppercase tracking-wider",
                                        selectedRun?.status === 'FAILED' ? 'text-red-600' : 'text-emerald-600'
                                    )}>{selectedRun?.status}</span>
                                    <span className="text-slate-300">•</span>
                                    <span>{selectedRun?.startedAt && format(new Date(selectedRun.startedAt), "MMM d, yyyy HH:mm:ss")}</span>
                                    <span className="text-slate-300">•</span>
                                    <span>{selectedRun?.triggeredBy}</span>
                                    {selectedRun?.durationMs != null && (
                                        <>
                                            <span className="text-slate-300">•</span>
                                            <span>{selectedRun.durationMs < 1000 ? `${selectedRun.durationMs}ms` : `${(selectedRun.durationMs / 1000).toFixed(1)}s`}</span>
                                        </>
                                    )}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 bg-black/5 rounded-b-xl border-t border-slate-100 overflow-hidden relative">
                        {isStreaming ? (
                            <TerminalLog logs={liveLogs} isLive={true} />
                        ) : (
                            <TerminalLog 
                                logs={selectedRun?.logOutput 
                                    ? selectedRun.logOutput.split('\n').filter(Boolean).map((line: string) => {
                                        const tsMatch = line.match(/\[(.*?)\]/);
                                        const levelMatch = line.match(/\]\s+(\w+)\s*:/);
                                        const stepMatch = line.match(/\[Step (\d+)\]/);
                                        const metaMatch = line.match(/\{(.*?)\}/);
                                        const rawMatch = line.match(/>>> DATA\/SQL: (.*)/);
                                        
                                        let msg = line;
                                        // Try to strip prefix if it looks like a standard log
                                        if (tsMatch && levelMatch) {
                                            msg = line
                                                .replace(/\[.*?\]\s+\w+\s*:\s+(\[Step \d+\]\s+)?/, '')
                                                .split(' {')[0]
                                                .split('\n')[0];
                                        }

                                        const meta: Record<string, string> = {};
                                        if (metaMatch) {
                                            metaMatch[1].split(', ').forEach(pair => {
                                                const [k, v] = pair.split(':');
                                                if (k && v) meta[k] = v;
                                            });
                                        }
                                        if (rawMatch) {
                                            meta['data'] = rawMatch[1];
                                        }

                                        return {
                                            timestamp: tsMatch?.[1] || '',
                                            level: levelMatch?.[1]?.toLowerCase() || 'info',
                                            message: msg.trim(),
                                            stepNumber: stepMatch ? parseInt(stepMatch[1], 10) : null,
                                            metadata: Object.keys(meta).length > 0 ? meta : undefined
                                        };
                                    })
                                    : []
                                } 
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Configuration Modal */}
            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="max-w-2xl w-full p-0 overflow-hidden bg-white border-0 shadow-2xl">
                    <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                            <Edit2 className="h-4 w-4 text-indigo-500" /> Edit Job Configuration
                        </DialogTitle>
                        <DialogDescription className="text-xs mt-1">
                            Update the name, sync mode, and automated schedule for this job.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="p-6 space-y-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Job Name</Label>
                            <Input 
                                value={editFormData.name}
                                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                className="bg-white h-11"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sync Mode</Label>
                                <Select value={editFormData.syncMode} onValueChange={(v) => setEditFormData({ ...editFormData, syncMode: v || "" })}>
                                    <SelectTrigger className="bg-white h-11">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="FULL_REFRESH" className="font-medium">Full Refresh</SelectItem>
                                        <SelectItem value="INCREMENTAL" disabled className="font-medium">Incremental</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cleanup Strategy</Label>
                                <Select value={editFormData.fullRefreshStrategy} onValueChange={(v) => setEditFormData({ ...editFormData, fullRefreshStrategy: v || "" })}>
                                    <SelectTrigger className="bg-white h-11">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="TRUNCATE" className="font-medium">Truncate</SelectItem>
                                        <SelectItem value="DROP" className="font-medium">Drop</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                            <SchedulePicker 
                                value={editFormData.schedule}
                                enabled={editFormData.scheduleEnabled}
                                onChange={(cron, enabled) => setEditFormData(prev => ({ ...prev, schedule: cron, scheduleEnabled: enabled }))}
                            />
                        </div>
                    </div>

                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                        <Button variant="ghost" onClick={() => setIsEditModalOpen(false)} className="font-medium text-xs">
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSaveEdit}
                            disabled={isSavingEdit || !editFormData.name}
                            className="bg-indigo-600 hover:bg-indigo-700 shadow-md font-bold text-xs h-10 px-8 transition-all active:scale-95"
                        >
                            {isSavingEdit ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                            ) : (
                                "Save Changes"
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

