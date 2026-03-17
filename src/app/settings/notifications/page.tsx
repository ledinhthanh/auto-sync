"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save } from "lucide-react";

export default function NotificationsSettings() {
    return (
        <div className="space-y-8 max-w-3xl">
            <div>
                <h3 className="text-lg font-medium text-slate-900">Notifications</h3>
                <p className="text-sm text-slate-500 mt-1">Configure how you receive alerts for job executions.</p>
            </div>

            <div className="grid gap-6 py-4 border-t">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-base">Email on Job Failure</Label>
                        <p className="text-sm text-slate-500">Receive an email immediately if any sync job fails.</p>
                    </div>
                    <Switch defaultChecked />
                </div>

                <div className="grid gap-2 pl-4 border-l-2 border-slate-100">
                    <Label>Email Recipients</Label>
                    <Input defaultValue="team@example.com, alerts@example.com" className="bg-white" />
                    <p className="text-xs text-slate-500">Comma-separated email addresses.</p>
                </div>

                <div className="flex items-center justify-between mt-4 border-t pt-6">
                    <div className="space-y-0.5">
                        <Label className="text-base">Email on Job Success</Label>
                        <p className="text-sm text-slate-500">Receive a daily digest of all successful sync jobs.</p>
                    </div>
                    <Switch />
                </div>

                <div className="flex items-center justify-between mt-4 border-t pt-6">
                    <div className="space-y-0.5">
                        <Label className="text-base">Slack Webhook alerts</Label>
                        <p className="text-sm text-slate-500">Send real-time alerts to a Slack channel.</p>
                    </div>
                    <Switch defaultChecked />
                </div>

                <div className="grid gap-2 pl-4 border-l-2 border-slate-100">
                    <Label>Webhook URL</Label>
                    <Input type="password" className="bg-white font-mono text-sm" />
                </div>
            </div>

            <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm"><Save className="mr-2 h-4 w-4" /> Save Preferences</Button>
        </div>
    );
}
