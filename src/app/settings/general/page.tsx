"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";

export default function GeneralSettings() {
    return (
        <div className="space-y-8 max-w-3xl">
            <div>
                <h3 className="text-lg font-medium text-slate-900">General Settings</h3>
                <p className="text-sm text-slate-500 mt-1">Manage workspace preferences and data retention policies.</p>
            </div>

            <div className="grid gap-6 py-4 border-t">
                <div className="grid gap-2">
                    <Label htmlFor="workspace-name">Workspace Name</Label>
                    <Input id="workspace-name" defaultValue="Default Workspace" className="bg-white" />
                </div>

                <div className="grid gap-2">
                    <Label>System Timezone</Label>
                    <Select defaultValue="utc">
                        <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="utc">UTC (Coordinated Universal Time)</SelectItem>
                            <SelectItem value="pst">Pacific Time (US & Canada)</SelectItem>
                            <SelectItem value="est">Eastern Time (US & Canada)</SelectItem>
                            <SelectItem value="ict">Indochina Time (Asia/Ho_Chi_Minh)</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">Schedules are evaluated based on this timezone.</p>
                </div>

                <div className="grid gap-2">
                    <Label>Log Retention Policy</Label>
                    <Select defaultValue="30">
                        <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select retention plan" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7">7 Days</SelectItem>
                            <SelectItem value="14">14 Days</SelectItem>
                            <SelectItem value="30">30 Days</SelectItem>
                            <SelectItem value="90">90 Days</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">Historical run logs older than this will be automatically deleted.</p>
                </div>
            </div>

            <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm"><Save className="mr-2 h-4 w-4" /> Save Changes</Button>
        </div>
    );
}
