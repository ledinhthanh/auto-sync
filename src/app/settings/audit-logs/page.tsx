"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Download, Filter, Search } from "lucide-react";

const MOCK_AUDIT = [
    { id: "a1", timestamp: "10/12/2024, 10:32:45 AM", user: "Alice Admin", action: "UPDATE_JOB", resource: "Job: Sync HR Data", ip: "192.168.1.1" },
    { id: "a2", timestamp: "10/12/2024, 09:15:22 AM", user: "Bob Builder", action: "CREATE_CONNECTION", resource: "Connection: ERP Production", ip: "10.0.0.5" },
    { id: "a3", timestamp: "10/11/2024, 16:45:00 PM", user: "SYSTEM", action: "SYNC_EXECUTION_FAILED", resource: "Job: Daily Revenue", ip: "internal" },
    { id: "a4", timestamp: "10/11/2024, 14:20:11 PM", user: "Alice Admin", action: "INVITE_USER", resource: "User: charlie@example.com", ip: "192.168.1.1" },
    { id: "a5", timestamp: "10/10/2024, 08:00:00 AM", user: "SYSTEM", action: "WORKSPACE_CREATED", resource: "Workspace: Default", ip: "internal" },
];

export default function AuditLogsSettings() {
    return (
        <div className="space-y-6 flex flex-col h-[calc(100vh-6rem-40px)]">
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h3 className="text-lg font-medium text-slate-900">Audit Logs</h3>
                    <p className="text-sm text-slate-500 mt-1">Track all system events and user actions for compliance.</p>
                </div>
                <Button variant="outline" className="shadow-sm">
                    <Download className="mr-2 h-4 w-4 text-slate-500" /> Export CSV
                </Button>
            </div>

            <div className="flex items-center space-x-3 w-full shrink-0">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input type="search" placeholder="Search events..." className="pl-9 bg-white shadow-sm" />
                </div>
                <Button variant="outline" className="shadow-sm bg-white">
                    <Filter className="mr-2 h-4 w-4" /> Filter by User or Action
                </Button>
            </div>

            <div className="bg-white border rounded-xl shadow-sm flex-1 overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-1">
                    <Table>
                        <TableHeader className="bg-slate-50 border-b sticky top-0 z-10">
                            <TableRow>
                                <TableHead>Timestamp</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Resource</TableHead>
                                <TableHead className="text-right">IP Address</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {MOCK_AUDIT.map((log) => (
                                <TableRow key={log.id} className="hover:bg-slate-50">
                                    <TableCell className="text-xs text-slate-500 font-mono whitespace-nowrap">{log.timestamp}</TableCell>
                                    <TableCell className="font-semibold text-slate-900 text-sm">{log.user}</TableCell>
                                    <TableCell>
                                        <span className="text-[10px] font-mono font-bold tracking-wider text-indigo-700 bg-indigo-50 px-2 py-1 rounded">{log.action}</span>
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-700">{log.resource}</TableCell>
                                    <TableCell className="text-right text-xs text-slate-400 font-mono">{log.ip}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
