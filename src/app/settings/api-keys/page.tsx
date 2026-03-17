"use client";

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
import { Copy, Plus, Trash2 } from "lucide-react";

const MOCK_KEYS = [
    { id: "k1", name: "Production CI/CD Trigger", prefix: "ds_live_xxxx", scope: "Trigger Only", created: "Oct 12, 2024", lastUsed: "10 mins ago" },
    { id: "k2", name: "Local Dev Testing", prefix: "ds_test_xxxx", scope: "Full Access", created: "Nov 03, 2024", lastUsed: "Never" },
];

export default function ApiKeysSettings() {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium text-slate-900">API Keys</h3>
                    <p className="text-sm text-slate-500 mt-1">Manage API keys used to programmatically trigger syncs.</p>
                </div>
                <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
                    <Plus className="mr-2 h-4 w-4" /> Generate New Key
                </Button>
            </div>

            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50 border-b">
                        <TableRow>
                            <TableHead>Key Name</TableHead>
                            <TableHead>Prefix</TableHead>
                            <TableHead>Scope</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Last Used</TableHead>
                            <TableHead className="w-[80px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {MOCK_KEYS.map((key) => (
                            <TableRow key={key.id} className="hover:bg-slate-50">
                                <TableCell className="font-semibold text-slate-900">{key.name}</TableCell>
                                <TableCell>
                                    <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">{key.prefix}</span>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="text-slate-600 bg-white border-slate-200">{key.scope}</Badge>
                                </TableCell>
                                <TableCell className="text-sm text-slate-600">{key.created}</TableCell>
                                <TableCell className="text-sm text-slate-600">{key.lastUsed}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end space-x-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600" title="Copy ID">
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" title="Revoke Key">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
