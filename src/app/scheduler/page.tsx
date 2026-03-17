"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Calendar, Clock, Plus, Search } from "lucide-react";
import { useState } from "react";

const MOCK_SCHEDULES = [
    { id: "s1", jobName: "Sync HR Data", cron: "0 2 * * *", humanReadable: "Every day at 2:00 AM", nextRun: "in 4 hours", lastRun: "yesterday", enabled: true },
    { id: "s2", jobName: "Daily Revenue MatView", cron: "0 0 * * *", humanReadable: "Every day at midnight", nextRun: "in 2 hours", lastRun: "yesterday", enabled: true },
    { id: "s3", jobName: "Orders Incremental Sync", cron: "*/15 * * * *", humanReadable: "Every 15 minutes", nextRun: "in 2 mins", lastRun: "13 mins ago", enabled: false },
    { id: "s4", jobName: "Legacy Users Archive", cron: "0 0 1 * *", humanReadable: "On day 1 of every month", nextRun: "in 12 days", lastRun: "Last month", enabled: true },
];

export default function SchedulerPage() {
    const [view, setView] = useState<'list' | 'calendar'>('list');

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Job Scheduler</h2>
                    <p className="text-sm text-slate-500 mt-1">Manage automated execution frequencies</p>
                </div>
                <div className="flex items-center space-x-2">
                    <div className="bg-slate-100 p-1 rounded-lg flex space-x-1">
                        <button
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${view === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            onClick={() => setView('list')}
                        >
                            List View
                        </button>
                        <button
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${view === 'calendar' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            onClick={() => setView('calendar')}
                        >
                            Calendar
                        </button>
                    </div>
                    <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm border-0 ml-4">
                        <Plus className="mr-2 h-4 w-4" /> New Schedule
                    </Button>
                </div>
            </div>

            {view === 'list' ? (
                <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                        <div className="relative w-80">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                            <Input type="search" placeholder="Search schedules..." className="pl-9 bg-white" />
                        </div>
                    </div>

                    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-50 border-b">
                                <TableRow>
                                    <TableHead className="w-[80px]">Status</TableHead>
                                    <TableHead>Job Name</TableHead>
                                    <TableHead>Schedule (Cron)</TableHead>
                                    <TableHead>Next Run</TableHead>
                                    <TableHead>Last Run</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {MOCK_SCHEDULES.map((schedule) => (
                                    <TableRow key={schedule.id} className="hover:bg-slate-50">
                                        <TableCell>
                                            <Switch checked={schedule.enabled} className="scale-75 origin-left" />
                                        </TableCell>
                                        <TableCell className="font-semibold text-slate-900">
                                            {schedule.jobName}
                                        </TableCell>
                                        <TableCell>
                                            <div className="space-y-1">
                                                <div className="font-mono text-sm inline-block bg-slate-100 px-2 py-0.5 rounded text-slate-700 border">{schedule.cron}</div>
                                                <div className="text-xs text-slate-500">{schedule.humanReadable}</div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center space-x-2 text-sm text-slate-700">
                                                {schedule.enabled ? (
                                                    <>
                                                        <Clock className="h-4 w-4 text-emerald-500" />
                                                        <span className="font-medium">{schedule.nextRun}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-slate-400 italic">Paused</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-600">{schedule.lastRun}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" className="h-8 text-indigo-600 font-medium">Edit</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            ) : (
                <div className="bg-white border rounded-xl shadow-sm p-8 text-center flex flex-col items-center justify-center space-y-4 min-h-[400px]">
                    <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
                        <Calendar className="h-8 w-8 text-indigo-300" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Calendar View Upcoming</h3>
                        <p className="text-slate-500 max-w-sm mx-auto mt-2">A visual weekly calendar showing all your upcoming scheduled data syncs is currently in development.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
