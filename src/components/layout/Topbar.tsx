"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AlertCircle, Bell, LogOut, Search, Settings as SettingsIcon, User } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

export function Topbar() {
    const pathname = usePathname();
    const router = useRouter();

    const pageName = pathname === "/"
        ? "Dashboard"
        : pathname.split("/").filter(Boolean).map(segment =>
            segment.charAt(0).toUpperCase() + segment.slice(1).replace("-", " ")
        ).join(" / ");

    return (
        <header className="h-14 border-b bg-white flex items-center justify-between px-6 sticky top-0 z-10 shadow-sm">
            <div className="flex items-center">
                <h1 className="text-sm font-semibold text-slate-900 tracking-tight">{pageName}</h1>
            </div>

            <div className="flex items-center space-x-4">
                <div className="relative w-64 hidden md:block">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        type="search"
                        placeholder="Search..."
                        className="w-full pl-9 h-9 bg-slate-50 border-slate-200 rounded-full text-sm"
                    />
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger className="relative inline-flex h-9 w-9 items-center justify-center text-slate-500 rounded-full hover:bg-slate-100 focus:outline-none">
                        <Bell className="h-4 w-4" />
                        <span className="absolute top-2 right-2 h-1.5 w-1.5 bg-red-500 rounded-full border border-white pulse"></span>
                        <span className="sr-only">Notifications</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                        <div className="px-2 py-1.5 text-sm font-semibold">Notifications</div>
                        <DropdownMenuSeparator />
                        <div className="flex flex-col gap-1 p-2">
                            <div className="flex items-start gap-3 p-2 rounded-md hover:bg-slate-50">
                                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium leading-none">Job Failed: Daily Revenue</p>
                                    <p className="text-xs text-slate-500">Connection to Source DB dropped unexpectedly.</p>
                                    <p className="text-xs text-slate-400">10 mins ago</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-2 rounded-md hover:bg-slate-50">
                                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium leading-none">Schedule Alert: Legacy Archive</p>
                                    <p className="text-xs text-slate-500">Job runs in 12 days. Disk space warning.</p>
                                    <p className="text-xs text-slate-400">2 hours ago</p>
                                </div>
                            </div>
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                    <DropdownMenuTrigger className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 ml-2 overflow-hidden bg-slate-100 focus:outline-none">
                        <User className="h-4 w-4 text-slate-500" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <div className="px-2 py-1.5 text-sm font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">Admin User</p>
                                <p className="text-xs leading-none text-muted-foreground">admin@datasync.local</p>
                            </div>
                        </div>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5 text-xs text-slate-500 font-normal uppercase tracking-wider">Workspaces</div>
                        <DropdownMenuItem className="font-medium bg-slate-50 text-indigo-700">✓ Default Workspace</DropdownMenuItem>
                        <DropdownMenuItem>Marketing Data</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/settings")}>
                            <SettingsIcon className="mr-2 h-4 w-4" />
                            <span>Settings</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600 focus:text-red-700">
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Log out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}
