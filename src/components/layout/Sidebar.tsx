"use client";

import { cn } from "@/lib/utils";
import {
    Clock,
    Database,
    LayoutDashboard,
    Settings,
    Table2,
    Workflow
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Connections", href: "/connections", icon: Database },
    { name: "Models", href: "/models", icon: Table2 },
    { name: "Jobs", href: "/jobs", icon: Workflow },
    { name: "History & Logs", href: "/history", icon: Clock },
    { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="flex flex-col h-full w-60 border-r bg-white">
            <div className="p-4 flex items-center space-x-2 border-b h-14">
                <div className="h-6 w-6 bg-indigo-600 rounded flex items-center justify-center">
                    <Database className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-lg text-slate-900">DataSync</span>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
                {navigation.map((item) => {
                    const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            )}
                        >
                            <item.icon className={cn("h-4 w-4", isActive ? "text-indigo-600" : "text-slate-400")} />
                            <span>{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t">
                <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                        AD
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">Admin User</span>
                        <span className="text-xs text-slate-500">Default Workspace</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
