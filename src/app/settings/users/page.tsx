"use client";

import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { MoreHorizontal, UserPlus } from "lucide-react";

const MOCK_USERS = [
    { id: "u1", name: "Alice Admin", email: "alice@example.com", role: "ADMIN", status: "ACTIVE", joined: "Oct 12, 2024" },
    { id: "u2", name: "Bob Builder", email: "bob@example.com", role: "EDITOR", status: "ACTIVE", joined: "Nov 03, 2024" },
    { id: "u3", name: "Charlie Viewer", email: "charlie@example.com", role: "VIEWER", status: "PENDING", joined: "Sent 2 days ago" },
];

export default function UsersSettings() {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium text-slate-900">Users & Roles</h3>
                    <p className="text-sm text-slate-500 mt-1">Manage team access and permissions to this workspace.</p>
                </div>
                <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
                    <UserPlus className="mr-2 h-4 w-4" /> Invite User
                </Button>
            </div>

            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50 border-b">
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Joined</TableHead>
                            <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {MOCK_USERS.map((user) => (
                            <TableRow key={user.id} className="hover:bg-slate-50">
                                <TableCell>
                                    <div className="font-semibold text-slate-900">{user.name}</div>
                                    <div className="text-sm text-slate-500">{user.email}</div>
                                </TableCell>
                                <TableCell>
                                    <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">{user.role}</span>
                                </TableCell>
                                <TableCell>
                                    {user.status === "ACTIVE" ? (
                                        <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200">Active</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200">Pending Invite</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-sm text-slate-600">{user.joined}</TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className={cn(
                                            "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 h-8 w-8 text-slate-400 hover:text-slate-900 transition-colors hover:bg-muted font-medium text-sm",
                                        )}>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem>Change Role</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-red-600 focus:text-red-700">Remove from Workspace</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
