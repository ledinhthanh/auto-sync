"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Clock, Database, Filter, MoreHorizontal, Pause, Play, Plus, Search, Loader2, Workflow, Trash2, Code, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";

export default function JobsPage() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isProcessingBulk, setIsProcessingBulk] = useState(false);
    const router = useRouter();

    const fetchJobs = useCallback(async () => {
        try {
            const res = await fetch("/api/syncs");
            if (res.ok) {
                const data = await res.json();
                setJobs(data);
            }
        } catch {
            toast.error("Failed to load sync jobs");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchJobs();
    }, [fetchJobs]);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this job?")) return;
        
        try {
            const res = await fetch(`/api/syncs/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success("Job deleted");
                fetchJobs();
            } else {
                throw new Error("Failed to delete");
            }
        } catch {
            toast.error("Error deleting job");
        }
    };

    const toggleStatus = async (id: string, currentStatus: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        
        try {
            const res = await fetch(`/api/syncs/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                toast.success(`Job ${newStatus === 'ACTIVE' ? 'resumed' : 'paused'}`);
                fetchJobs();
            } else {
                throw new Error("Failed to update status");
            }
        } catch {
            toast.error("Error updating job status");
        }
    };

    const runJob = async (id: string, e: React.MouseEvent) => {
         e.stopPropagation();
         // Optimistic UI update
         setSyncingId(id);
         setJobs(prevJobs => prevJobs.map(job => 
             job.id === id ? { ...job, status: 'RUNNING' } : job
         ));
         toast.info("Triggering job execution...");

         try {
             const res = await fetch(`/api/syncs/${id}/run`, { method: 'POST' });
             if (!res.ok) throw new Error("Failed to trigger job");
             
             toast.success("Job triggered successfully");
             // Re-fetch after a short bit to get actual status
             setTimeout(() => {
                 fetchJobs();
                 setSyncingId(null);
             }, 1000);
         } catch {
             toast.error("Error triggering job");
             fetchJobs(); // Revert back
             setSyncingId(null);
         }
    };

    // Auto-refresh when any job is RUNNING
    useEffect(() => {
        const hasRunningJobs = jobs.some(j => j.status === 'RUNNING');
        if (hasRunningJobs) {
            const interval = setInterval(fetchJobs, 2000);
            return () => clearInterval(interval);
        }
    }, [jobs, fetchJobs]);

    const filteredJobs = jobs.filter(job => {
        const matchesSearch = job.name.toLowerCase().includes(search.toLowerCase()) || 
            job.destName.toLowerCase().includes(search.toLowerCase()) ||
            job.model?.name.toLowerCase().includes(search.toLowerCase());
        
        const matchesStatus = statusFilter === "ALL" || 
            (statusFilter === "NEVER_RUN" ? !job.lastRunAt : job.status === statusFilter);
        
        return matchesSearch && matchesStatus;
    });

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(filteredJobs.map(job => job.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectRow = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds(prev => [...prev, id]);
        } else {
            setSelectedIds(prev => prev.filter(jobId => jobId !== id));
        }
    };

    const validateJob = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        const toastId = toast.loading("Validating sync job...");
        
        try {
            const res = await fetch(`/api/syncs/${id}/validate`, { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                if (data.issues.schemaMismatches.length > 0) {
                    toast.warning("Validation passed with warnings", {
                        id: toastId,
                        description: `Found ${data.issues.schemaMismatches.length} schema differences.`
                    });
                } else {
                    toast.success("Validation passed! Ready to sync.", { id: toastId });
                }
            } else {
                toast.error("Validation failed", {
                    id: toastId,
                    description: data.issues.dependencies[0] || data.message
                });
            }
        } catch {
            toast.error("Error during validation", { id: toastId });
        }
    };

    const handleBulkSync = async () => {
        if (selectedIds.length === 0) return;
        setIsProcessingBulk(true);
        toast.info(`Triggering ${selectedIds.length} jobs (max 3 concurrent)...`);
        
        try {
            setJobs(prevJobs => prevJobs.map(job => 
                selectedIds.includes(job.id) ? { ...job, status: 'RUNNING' } : job
            ));

            const queue = [...selectedIds];
            const maxConcurrency = 3;
            let activeCount = 0;
            let completedCount = 0;
            let errorCount = 0;

            const processQueue = async () => {
                while (queue.length > 0) {
                    if (activeCount < maxConcurrency) {
                        const id = queue.shift();
                        if (!id) break;
                        
                        activeCount++;
                        (async () => {
                            try {
                                const res = await fetch(`/api/syncs/${id}/run`, { method: 'POST' });
                                if (!res.ok) throw new Error("Failed");
                                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            } catch (e) {
                                errorCount++;
                            } finally {
                                activeCount--;
                                completedCount++;
                                processQueue();
                            }
                        })();
                    } else {
                        break;
                    }
                }
            };

            // Start initial workers
            const initialWorkers = [];
            for (let i = 0; i < Math.min(queue.length, maxConcurrency); i++) {
                initialWorkers.push(processQueue());
            }

            // Wait until all are completed
            while (completedCount < selectedIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (errorCount > 0) {
                toast.error(`Completed with ${errorCount} errors`);
            } else {
                toast.success(`Successfully triggered ${selectedIds.length} jobs`);
                setSelectedIds([]);
            }
        } finally {
            setIsProcessingBulk(false);
            setTimeout(fetchJobs, 1000);
        }
    };

    const handleBulkValidate = async () => {
        if (selectedIds.length === 0) return;
        setIsProcessingBulk(true);
        toast.info(`Validating ${selectedIds.length} jobs...`);

        try {
            const results = await Promise.allSettled(
                selectedIds.map(id => fetch(`/api/syncs/${id}/validate`, { method: 'POST' }))
            );

            const failed = results.filter(r => 
                r.status === 'rejected' || 
                (r.status === 'fulfilled' && !r.value.ok)
            );

            if (failed.length > 0) {
                toast.error(`Validation complete: ${failed.length} jobs have issues.`);
            } else {
                toast.success(`All ${selectedIds.length} jobs passed validation!`);
                setSelectedIds([]);
            }
        } finally {
            setIsProcessingBulk(false);
        }
    };

    const handleBulkStatus = async (newStatus: 'ACTIVE' | 'PAUSED') => {
        if (selectedIds.length === 0) return;
        setIsProcessingBulk(true);
        
        try {
            const results = await Promise.allSettled(
                selectedIds.map(id => fetch(`/api/syncs/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                }))
            );

            const errors = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
            if (errors.length > 0) {
                toast.error(`Changed status with ${errors.length} errors`);
            } else {
                toast.success(`Successfully ${newStatus === 'ACTIVE' ? 'resumed' : 'paused'} ${selectedIds.length} jobs`);
                setSelectedIds([]);
            }
        } finally {
            setIsProcessingBulk(false);
            fetchJobs();
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} jobs?`)) return;
        setIsProcessingBulk(true);
        
        try {
            const results = await Promise.allSettled(
                selectedIds.map(id => fetch(`/api/syncs/${id}`, { method: 'DELETE' }))
            );

            const errors = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
            if (errors.length > 0) {
                toast.error(`Deleted with ${errors.length} errors`);
            } else {
                toast.success(`Successfully deleted ${selectedIds.length} jobs`);
                setSelectedIds([]);
            }
        } finally {
            setIsProcessingBulk(false);
            fetchJobs();
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10 px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-6 border-b border-slate-100">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sync Jobs</h2>
                    <p className="text-sm text-slate-500 mt-1">Manage database data movement operations and schedules</p>
                </div>
                <Link href="/jobs/new">
                    <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm border-0 font-bold transition-all active:scale-95">
                        <Plus className="mr-2 h-4 w-4" /> New Sync Job
                    </Button>
                </Link>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                <div className="relative w-full sm:w-80 shadow-sm rounded-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        type="search"
                        placeholder="Search jobs by name or table..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-10 border-slate-200 bg-white"
                    />
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input h-10 px-4 py-2 bg-white shadow-sm hover:bg-slate-50 text-slate-900">
                        <Filter className="mr-2 h-4 w-4 text-slate-500" /> 
                        {statusFilter === "ALL" ? "Filter Options" : `Status: ${statusFilter}`}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 p-1 rounded-lg">
                        <DropdownMenuItem onClick={() => setStatusFilter("ALL")} className="text-xs cursor-pointer rounded-md py-2">
                            All Statuses
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatusFilter("NEVER_RUN")} className="text-xs cursor-pointer rounded-md py-2 text-indigo-600 font-bold">
                            <Clock className="h-3.5 w-3.5 mr-2" /> Never Run
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-slate-100" />
                        <DropdownMenuItem onClick={() => setStatusFilter("ACTIVE")} className="text-xs cursor-pointer rounded-md py-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 mr-2"></span> Active
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatusFilter("PAUSED")} className="text-xs cursor-pointer rounded-md py-2">
                            <span className="h-2 w-2 rounded-full bg-slate-400 mr-2"></span> Paused
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatusFilter("RUNNING")} className="text-xs cursor-pointer rounded-md py-2">
                            <span className="h-2 w-2 rounded-full bg-blue-500 mr-2"></span> Running
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatusFilter("ERROR")} className="text-xs cursor-pointer rounded-md py-2">
                            <span className="h-2 w-2 rounded-full bg-red-500 mr-2"></span> Error
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatusFilter("DRAFT")} className="text-xs cursor-pointer rounded-md py-2">
                            <span className="h-2 w-2 rounded-full bg-amber-500 mr-2"></span> Draft
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
                {selectedIds.length > 0 && (
                    <div className="bg-indigo-50 border-b border-indigo-100 p-3 flex items-center justify-between animate-in slide-in-from-top-2 fade-in duration-200">
                        <span className="text-sm font-medium text-indigo-900 ml-2">
                            {selectedIds.length} job{selectedIds.length > 1 ? 's' : ''} selected
                        </span>
                        <div className="flex items-center gap-2">
                            <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
                                onClick={handleBulkSync}
                                disabled={isProcessingBulk}
                            >
                                {isProcessingBulk ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-2 h-3.5 w-3.5" />}
                                Sync Selected
                            </Button>
                            <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
                                onClick={handleBulkValidate}
                                disabled={isProcessingBulk}
                            >
                                <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                                Validate Selected
                            </Button>
                            <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                                onClick={() => handleBulkStatus('ACTIVE')}
                                disabled={isProcessingBulk}
                            >
                                <Play className="mr-2 h-3.5 w-3.5" /> Resume
                            </Button>
                            <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 bg-white border-amber-200 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                                onClick={() => handleBulkStatus('PAUSED')}
                                disabled={isProcessingBulk}
                            >
                                <Pause className="mr-2 h-3.5 w-3.5" /> Pause
                            </Button>
                            <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 bg-white border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 ml-2"
                                onClick={handleBulkDelete}
                                disabled={isProcessingBulk}
                            >
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </Button>
                        </div>
                    </div>
                )}
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-slate-400">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-4" />
                        <p className="text-sm font-medium">Loading sync jobs...</p>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-slate-500 bg-slate-50/50">
                        <Workflow className="h-12 w-12 text-slate-300 mb-4" />
                        <h3 className="text-lg font-bold text-slate-900">No Jobs configured</h3>
                        <p className="text-sm mt-1 max-w-sm text-center">Get started by creating a new sync job to move data from your models to a destination.</p>
                        <Link href="/jobs/new" className="mt-6">
                            <Button variant="outline" className="bg-white">Create First Job</Button>
                        </Link>
                    </div>
                ) : filteredJobs.length === 0 ? (
                     <div className="flex flex-col items-center justify-center h-[400px] text-slate-500">
                        <Search className="h-8 w-8 text-slate-300 mb-4" />
                        <p className="text-sm font-medium text-slate-900">No jobs match your search.</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[40px] text-center">
                                    <Checkbox 
                                        checked={filteredJobs.length > 0 && selectedIds.length === filteredJobs.length}
                                        onCheckedChange={handleSelectAll}
                                        aria-label="Select all"
                                        className="translate-y-0.5"
                                    />
                                </TableHead>
                                <TableHead className="w-[140px] text-xs font-bold uppercase tracking-wider text-slate-500">Status</TableHead>
                                <TableHead className="w-[300px] text-xs font-bold uppercase tracking-wider text-slate-500">Job Details</TableHead>
                                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">Source → Destination</TableHead>
                                <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">Schedule</TableHead>
                                <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-slate-500">Last Executed</TableHead>
                                <TableHead className="w-[70px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-slate-100">
                            {filteredJobs.map((job) => (
                                <TableRow key={job.id} onClick={() => router.push(`/jobs/${job.id}`)} className={cn("hover:bg-slate-50 cursor-pointer group transition-colors", selectedIds.includes(job.id) && "bg-indigo-50/30 hover:bg-indigo-50/50")}>
                                    <TableCell className="align-middle text-center" onClick={(e) => e.stopPropagation()}>
                                        <Checkbox 
                                            checked={selectedIds.includes(job.id)}
                                            onCheckedChange={(checked) => handleSelectRow(job.id, checked as boolean)}
                                            aria-label={`Select job ${job.name}`}
                                            className="translate-y-0.5"
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium align-middle">
                                        <Badge variant="outline" className={cn(
                                            "capitalize tracking-wide text-[10px] w-24 justify-center py-1 opacity-90 border font-bold",
                                            job.status === "ACTIVE" && "text-emerald-700 bg-emerald-50 border-emerald-200",
                                            job.status === "ERROR" && "text-red-700 bg-red-50 border-red-200",
                                            job.status === "RUNNING" && "text-blue-700 bg-blue-50 border-blue-200 flex items-center space-x-1.5",
                                            job.status === "PAUSED" && "text-slate-600 bg-slate-100 border-slate-200",
                                            job.status === "DRAFT" && "text-amber-700 bg-amber-50 border-amber-200"
                                        )}>
                                            {job.status === "RUNNING" && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse shrink-0"></span>}
                                            <span>{job.status.toLowerCase()}</span>
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="align-middle py-4 min-w-[200px]">
                                        <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors leading-tight mb-1 whitespace-normal break-words">{job.name}</p>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="secondary" className="px-1.5 py-0 text-[9px] font-mono tracking-wider rounded bg-slate-100 text-slate-500">
                                                {job.syncMode}
                                            </Badge>
                                        </div>
                                    </TableCell>
                                    <TableCell className="align-middle py-4">
                                        <div className="flex flex-col space-y-2">
                                            <div className="flex items-center text-xs text-slate-600 font-mono" title={job.model.name}>
                                                <div className="h-5 w-5 rounded bg-slate-100 flex items-center justify-center mr-2 shrink-0">
                                                    {job.model.sourceType === 'CUSTOM_SQL' ? <Code className="h-3 w-3 text-slate-400" /> : <Database className="h-3 w-3 text-slate-400" />}
                                                </div>
                                                <span className="truncate max-w-[200px] font-medium">{job.model.sourceConn?.name || 'Local'}</span>
                                                <span className="mx-1.5 text-slate-300">/</span>
                                                <span className="truncate max-w-[200px] font-bold text-slate-800">{job.model.name}</span>
                                            </div>
                                            <div className="flex items-center text-xs font-mono ml-2.5 border-l-2 border-indigo-200 pl-4 py-0.5" title={`${job.destSchema}.${job.destName}`}>
                                                <span className="truncate max-w-[200px] text-indigo-700 font-bold bg-indigo-50 px-1.5 rounded">
                                                    {job.destSchema}.{job.destName}
                                                </span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="align-middle">
                                        {job.scheduleEnabled && job.schedule ? (
                                             <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-xs text-slate-700 font-mono font-medium">
                                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                <span>{job.schedule}</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">Manual only</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right align-middle">
                                        {job.lastRunAt ? (
                                            <>
                                                <p className="text-xs font-semibold text-slate-900">
                                                    {formatDistanceToNow(new Date(job.lastRunAt), { addSuffix: true })}
                                                </p>
                                                <p className={cn(
                                                    "text-[10px] mt-1 font-medium",
                                                    job.lastRunStatus === 'SUCCESS' ? "text-emerald-600" : "text-red-500"
                                                )}>
                                                    {job.lastRunStatus || 'UNKNOWN'}
                                                </p>
                                            </>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">Never run</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="align-middle text-right pr-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className={cn(
                                                    "h-8 shadow-sm font-semibold hidden sm:flex",
                                                    job.status === 'RUNNING' || syncingId === job.id 
                                                        ? "text-slate-500 border-slate-200 bg-slate-50 opacity-75 cursor-not-allowed hover:bg-slate-50 hover:text-slate-500" 
                                                        : "text-emerald-700 hover:text-emerald-800 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                                                )}
                                                disabled={job.status === 'RUNNING' || syncingId === job.id}
                                                onClick={(e) => runJob(job.id, e)}
                                            >
                                                {job.status === 'RUNNING' || syncingId === job.id ? (
                                                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Syncing</>
                                                ) : (
                                                    <><Play className="mr-1.5 h-3.5 w-3.5" /> Sync Now</>
                                                )}
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger className="group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 h-8 w-8 text-slate-400 hover:text-slate-900 opacity-0 group-hover:opacity-100 font-medium text-sm data-[state=open]:opacity-100">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48 p-1 rounded-lg">
                                                    <DropdownMenuItem onClick={(e) => runJob(job.id, e)} className="text-xs cursor-pointer rounded-md py-2 sm:hidden">
                                                        <Play className="mr-2 h-3.5 w-3.5 text-emerald-600" /> 
                                                        <span className="font-medium text-slate-700">Run Now</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={(e) => validateJob(job.id, e)} className="text-xs cursor-pointer rounded-md py-2">
                                                        <ShieldCheck className="mr-2 h-3.5 w-3.5 text-indigo-600" /> 
                                                        <span className="font-medium text-slate-700">Validate Job</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={(e) => toggleStatus(job.id, job.status, e)} className="text-xs cursor-pointer rounded-md py-2">
                                                        {job.status === 'ACTIVE' ? (
                                                            <><Pause className="mr-2 h-3.5 w-3.5 text-amber-600" /> <span className="font-medium text-slate-700">Pause Schedule</span></>
                                                        ) : (
                                                            <><Play className="mr-2 h-3.5 w-3.5 text-indigo-600" /> <span className="font-medium text-slate-700">Resume Schedule</span></>
                                                        )}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator className="bg-slate-100" />
                                                    <DropdownMenuItem onClick={() => router.push(`/jobs/${job.id}`)} className="text-xs cursor-pointer rounded-md py-2">
                                                        <span className="font-medium text-slate-700 ml-5.5">View Job Details</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={(e) => handleDelete(job.id, e)} className="text-xs cursor-pointer rounded-md py-2 text-red-600 focus:bg-red-50 focus:text-red-700">
                                                        <Trash2 className="mr-2 h-3.5 w-3.5" /> 
                                                        <span className="font-bold">Delete Job</span>
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>
        </div>
    );
}
