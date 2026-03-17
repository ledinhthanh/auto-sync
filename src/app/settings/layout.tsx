import { Bell, Key, Settings, Shield, Users } from "lucide-react";
import Link from "next/link";

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex max-w-7xl mx-auto h-[calc(100vh-6rem)]">
            {/* Settings Sidebar */}
            <div className="w-64 shrink-0 pr-8">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-6">Settings</h2>
                <nav className="flex flex-col space-y-1">
                    <Link href="/settings/general" className="flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:text-slate-900 hover:bg-slate-100">
                        <Settings className="h-4 w-4" />
                        <span>General</span>
                    </Link>
                    <Link href="/settings/users" className="flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:text-slate-900 hover:bg-slate-100">
                        <Users className="h-4 w-4" />
                        <span>Users & Roles</span>
                    </Link>
                    <Link href="/settings/notifications" className="flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:text-slate-900 hover:bg-slate-100">
                        <Bell className="h-4 w-4" />
                        <span>Notifications</span>
                    </Link>
                    <Link href="/settings/api-keys" className="flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:text-slate-900 hover:bg-slate-100">
                        <Key className="h-4 w-4" />
                        <span>API Keys</span>
                    </Link>
                    <Link href="/settings/audit-logs" className="flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:text-slate-900 hover:bg-slate-100">
                        <Shield className="h-4 w-4" />
                        <span>Audit Logs</span>
                    </Link>
                </nav>
            </div>

            {/* Settings Content */}
            <div className="flex-1 pl-8 border-l pb-10 overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
