"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle
} from "@/components/ui/sheet";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Filter, Search, Terminal, Loader2, History } from "lucide-react";
import { useState, useEffect } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

interface Run {
    id: string;
    jobName: string;
    status: string;
    triggeredBy: string;
    startedAt: string;
    durationMs: number | null;
    rowsProcessed: number | null;
    bytesTransferred: number | null;
    errorMessage: string | null;
    logOutput: string | null;
}

export default function HistoryPage() {
    const [selectedRun, setSelectedRun] = useState<Run | null>(null);
    const [runs, setRuns] = useState<Run[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        async function fetchHistory() {
            setLoading(true);
            try {
                const res = await fetch("/api/history");
                if (res.ok) {
                    const data = await res.json();
                    setRuns(data);
                }
            } catch (error) {
                console.error("Failed to fetch history:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchHistory();
    }, []);

    const formatDuration = (ms: number | null) => {
        if (ms === null) return "-";
        if (ms < 1000) return `${ms}ms`;
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    const formatBytes = (bytes: number | null) => {
        if (bytes === null) return "-";
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatRows = (rows: number | null) => {
        if (rows === null) return "-";
        return new Intl.NumberFormat().format(rows);
    };

    const filteredRuns = runs.filter(run => 
        run.jobName.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10 flex flex-col h-full h-[calc(100vh-6rem)] px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-6 border-b border-slate-100 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">History & Logs</h2>
                    <p className="text-sm text-slate-500 mt-1">Review past execution logs and sync performance</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full shrink-0">
                <div className="relative w-full sm:w-80 shadow-sm rounded-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input 
                        type="search" 
                        placeholder="Search by job name..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-10 bg-white border-slate-200" 
                    />
                </div>
                <Select defaultValue="all">
                    <SelectTrigger className="w-full sm:w-36 h-10 bg-white shadow-sm border-slate-200">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="running">Running</SelectItem>
                    </SelectContent>
                </Select>
                <Select defaultValue="7d">
                    <SelectTrigger className="w-full sm:w-36 h-10 bg-white shadow-sm border-slate-200">
                        <SelectValue placeholder="Timeframe" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="24h">Last 24 Hours</SelectItem>
                        <SelectItem value="7d">Last 7 Days</SelectItem>
                        <SelectItem value="30d">Last 30 Days</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" className="h-10 px-4 bg-white shadow-sm font-medium border-slate-200 hidden sm:flex">
                    <Filter className="mr-2 h-4 w-4 text-slate-500" /> More Filters
                </Button>
            </div>

            <div className="bg-white border rounded-xl shadow-sm flex-1 overflow-hidden flex flex-col min-h-[400px]">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-4" />
                        <p className="text-sm font-medium">Loading history...</p>
                    </div>
                ) : runs.length === 0 ? (
                     <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-50/50">
                        <History className="h-12 w-12 text-slate-300 mb-4" />
                        <h3 className="text-lg font-bold text-slate-900">No Execution History</h3>
                        <p className="text-sm mt-1 max-w-sm text-center">Sync jobs will appear here once they have been executed manually or via schedule.</p>
                    </div>
                ) : filteredRuns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <Search className="h-8 w-8 text-slate-300 mb-4" />
                        <p className="text-sm font-medium text-slate-900">No runs match your search.</p>
                    </div>
                ) : (
                    <div className="overflow-y-auto flex-1">
                        <Table>
                            <TableHeader className="bg-slate-50/80 border-b border-slate-200 sticky top-0 z-10">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">Job Name</TableHead>
                                    <TableHead className="w-[120px] text-xs font-bold uppercase tracking-wider text-slate-500">Status</TableHead>
                                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">Triggered By</TableHead>
                                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">Started</TableHead>
                                    <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-slate-500">Duration</TableHead>
                                    <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-slate-500">Rows</TableHead>
                                    <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-slate-500">Data Size</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-slate-100">
                                {filteredRuns.map((run) => (
                                    <TableRow key={run.id} className="hover:bg-slate-50 cursor-pointer group transition-colors" onClick={() => setSelectedRun(run)}>
                                        <TableCell className="font-bold text-sm text-slate-900 group-hover:text-indigo-700 transition-colors py-4">
                                            {run.jobName}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={cn(
                                                "capitalize tracking-wide text-[10px] w-24 justify-center py-0.5 opacity-90 border font-bold",
                                                run.status === "SUCCESS" && "text-emerald-700 bg-emerald-50 border-emerald-200",
                                                run.status === "FAILED" && "text-red-700 bg-red-50 border-red-200",
                                                run.status === "RUNNING" && "text-blue-700 bg-blue-50 border-blue-200 flex items-center space-x-1.5",
                                                run.status === "CANCELLED" && "text-slate-600 bg-slate-100 border-slate-200",
                                                run.status === "PENDING" && "text-amber-700 bg-amber-50 border-amber-200"
                                            )}>
                                                {run.status === "RUNNING" && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse shrink-0"></span>}
                                                {run.status.toLowerCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                                            {run.triggeredBy}
                                        </TableCell>
                                        <TableCell className="text-sm font-medium text-slate-700">
                                            {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{format(new Date(run.startedAt), "MMM d, HH:mm:ss")}</div>
                                        </TableCell>
                                        <TableCell className="text-right text-sm font-mono font-medium text-slate-600">
                                            {formatDuration(run.durationMs)}
                                        </TableCell>
                                        <TableCell className="text-right text-sm font-mono font-medium text-slate-600">
                                            {formatRows(run.rowsProcessed)}
                                        </TableCell>
                                        <TableCell className="text-right text-sm font-mono font-medium text-slate-600">
                                            {formatBytes(run.bytesTransferred)}
                                        </TableCell>
                                        <TableCell className="text-right pr-4">
                                            <Button variant="ghost" size="sm" className="h-8 text-xs font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors opacity-0 group-hover:opacity-100 uppercase tracking-widest px-3" onClick={(e) => { e.stopPropagation(); setSelectedRun(run); }}>
                                                Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            <Sheet open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
                <SheetContent className="w-[600px] sm:max-w-xl sm:w-full overflow-y-auto p-0 flex flex-col h-full border-l border-slate-200 shadow-2xl bg-white">
                    {selectedRun && (
                        <>
                            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10 shrink-0">
                                <SheetTitle className="flex items-center space-x-3 text-lg font-black text-slate-900 uppercase tracking-tight">
                                    <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-sm">
                                        <Terminal className="h-4 w-4 text-slate-500" />
                                    </div>
                                    <span>{selectedRun.jobName}</span>
                                </SheetTitle>
                                <SheetDescription className="flex flex-col space-y-3 mt-4">
                                    <div className="flex items-center space-x-3">
                                        <Badge variant="outline" className={cn(
                                            "capitalize tracking-widest text-[10px] px-2.5 py-1 justify-center opacity-90 border font-black",
                                            selectedRun.status === "SUCCESS" && "text-emerald-700 bg-emerald-50 border-emerald-200",
                                            selectedRun.status === "FAILED" && "text-red-700 bg-red-50 border-red-200",
                                            selectedRun.status === "RUNNING" && "text-blue-700 bg-blue-50 border-blue-200 flex items-center space-x-1.5",
                                            selectedRun.status === "CANCELLED" && "text-slate-600 bg-slate-100 border-slate-200"
                                        )}>
                                            {selectedRun.status === "RUNNING" && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse shrink-0"></span>}
                                            {selectedRun.status}
                                        </Badge>
                                        <span className="text-xs font-medium text-slate-500">
                                            Executed {formatDistanceToNow(new Date(selectedRun.startedAt), { addSuffix: true })}
                                        </span>
                                    </div>
                                </SheetDescription>
                            </div>

                            <div className="p-6 space-y-8 flex-1 flex flex-col min-h-0 bg-white">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
                                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Duration</div>
                                        <div className="font-mono text-lg font-bold text-slate-900">{formatDuration(selectedRun.durationMs)}</div>
                                    </div>
                                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Records</div>
                                        <div className="font-mono text-lg font-bold text-slate-900">{formatRows(selectedRun.rowsProcessed)}</div>
                                    </div>
                                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Data Vol</div>
                                        <div className="font-mono text-lg font-bold text-slate-900">{formatBytes(selectedRun.bytesTransferred)}</div>
                                    </div>
                                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Trigger</div>
                                        <div className="font-bold text-lg text-slate-900 capitalize">{selectedRun.triggeredBy.toLowerCase()}</div>
                                    </div>
                                </div>

                                {selectedRun.errorMessage && (
                                     <div className="p-4 bg-red-50 border border-red-200 rounded-xl shrink-0">
                                         <h4 className="text-xs font-black text-red-800 uppercase tracking-widest mb-2">Error Message</h4>
                                         <p className="text-sm text-red-700 font-medium font-mono">{selectedRun.errorMessage}</p>
                                     </div>
                                )}

                                <div className="flex-1 border border-slate-800 rounded-xl bg-slate-950 flex flex-col overflow-hidden min-h-[400px] shadow-inner">
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900 shrink-0">
                                        <div className="flex items-center space-x-2 shrink-0">
                                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
                                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
                                            <span className="ml-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Execution Output Log</span>
                                        </div>
                                        <div className="flex items-center space-x-1">
                                            <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-slate-800 px-3 transition-colors">Copy</Button>
                                            <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-slate-800 px-3 transition-colors">Download</Button>
                                        </div>
                                    </div>
                                    <ScrollArea className="flex-1 p-5 font-mono text-[11px] leading-relaxed">
                                        {selectedRun.logOutput ? (
                                            <pre className="whitespace-pre-wrap text-slate-300">
                                                {selectedRun.logOutput}
                                            </pre>
                                        ) : (
                                            <div className="text-slate-500 italic mt-2 text-center">No structural logs available for this execution.</div>
                                        )}
                                    </ScrollArea>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
