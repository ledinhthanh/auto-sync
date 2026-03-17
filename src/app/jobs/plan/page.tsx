"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowDownToLine, ArrowLeft, BoxSelect, Layers, Play, Server } from "lucide-react";
import Link from "next/link";

export default function SyncPlanPage() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <div className="flex items-center space-x-4 pb-4 border-b">
                <Link href="/jobs/new">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sync Plan Review</h2>
                    <p className="text-sm text-slate-500 mt-1">Review the execution steps for <span className="font-semibold text-slate-700">Sync Users Data</span></p>
                </div>
                <div className="flex-1"></div>
                <Button className="bg-indigo-600 hover:bg-indigo-700 font-semibold shadow-sm">
                    <Play className="mr-2 h-4 w-4 fill-white" /> Execute Plan Now
                </Button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start space-x-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                    <h4 className="font-medium text-amber-900 leading-none mb-2">This sync affects 3 existing objects</h4>
                    <p className="text-sm text-amber-800/80">
                        Because the target table will be overwritten, <span className="font-semibold">2 dependent user-created views</span> will be temporarily dropped. We have saved their DDL definitions and will recreate them automatically after the sync.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="shadow-sm border-slate-200">
                    <CardHeader className="bg-slate-50/50 border-b pb-3 pt-4">
                        <CardTitle className="text-sm font-semibold flex items-center text-slate-700">
                            <Layers className="mr-2 h-4 w-4" /> Affected Objects
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-white">
                            <div className="flex items-center space-x-3">
                                <div className="p-1.5 bg-blue-100 text-blue-700 rounded"><Server className="h-4 w-4" /></div>
                                <div>
                                    <h5 className="text-sm font-semibold text-slate-900">public.users_sync</h5>
                                    <p className="text-xs text-slate-500">Target Table</p>
                                </div>
                            </div>
                            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 outline-none">MANAGED</Badge>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border border-indigo-100 bg-indigo-50/30">
                            <div className="flex items-center space-x-3">
                                <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded"><BoxSelect className="h-4 w-4" /></div>
                                <div>
                                    <h5 className="text-sm font-semibold text-slate-900">reporting.active_users</h5>
                                    <p className="text-xs text-slate-500">Dependent View</p>
                                </div>
                            </div>
                            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-0 outline-none">USER CREATED</Badge>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border border-indigo-100 bg-indigo-50/30">
                            <div className="flex items-center space-x-3">
                                <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded"><BoxSelect className="h-4 w-4" /></div>
                                <div>
                                    <h5 className="text-sm font-semibold text-slate-900">dashboard.daily_users_mv</h5>
                                    <p className="text-xs text-slate-500">Dependent MatView</p>
                                </div>
                            </div>
                            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-0 outline-none">USER CREATED</Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b pb-3 pt-4">
                        <CardTitle className="text-sm font-semibold flex items-center text-slate-700">
                            <ArrowDownToLine className="mr-2 h-4 w-4" /> Execution Steps
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="relative">
                            {/* Timeline line */}
                            <div className="absolute left-[27px] top-6 bottom-6 w-0.5 bg-slate-200 z-0"></div>

                            <div className="divide-y relative z-10">
                                <StepItem num="1" action="SAVE DEFINITION" color="slate" object="reporting.active_users" type="view" risk="low" />
                                <StepItem num="2" action="SAVE DEFINITION" color="slate" object="dashboard.daily_users_mv" type="matview" risk="low" />
                                <StepItem num="3" action="DROP" color="red" object="dashboard.daily_users_mv" type="matview" risk="medium" />
                                <StepItem num="4" action="DROP" color="red" object="reporting.active_users" type="view" risk="medium" />
                                <StepItem num="5" action="DROP TABLE" color="red" object="public.users_sync" type="table" risk="medium" />

                                <div className="p-4 flex items-start space-x-4 bg-indigo-50/50">
                                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 shadow-sm border-2 border-white ring-2 ring-indigo-100">6</div>
                                    <div className="flex-1 pt-0.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-2">
                                                <span className="text-sm font-bold text-indigo-700">SYNC DATA</span>
                                                <span className="text-sm font-mono text-slate-700">public.users_sync</span>
                                            </div>
                                            <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">~1.2M rows</Badge>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">pg_dump from source → pg_restore to destination via parallel streams.</p>
                                    </div>
                                </div>

                                <StepItem num="7" action="RECREATE" color="emerald" object="reporting.active_users" type="view" risk="low" />
                                <StepItem num="8" action="RECREATE" color="emerald" object="dashboard.daily_users_mv" type="matview" risk="low" />
                                <StepItem num="9" action="REFRESH" color="blue" object="dashboard.daily_users_mv" type="matview" risk="low" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StepItem({ num, action, color, object, type, risk }: { num: string, action: string, color: string, object: string, type: string, risk: string }) {
    const colorClasses = {
        slate: "text-slate-700",
        red: "text-red-600",
        emerald: "text-emerald-600",
        blue: "text-blue-600"
    }[color];

    return (
        <div className="p-4 flex items-start space-x-4 bg-white transition-colors hover:bg-slate-50">
            <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 border border-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 z-10 bg-white">
                {num}
            </div>
            <div className="flex-1 pt-0.5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <span className={`text-sm font-bold tracking-tight ${colorClasses}`}>{action}</span>
                        <span className="text-sm font-mono text-slate-700">{object}</span>
                        <span className="text-[10px] uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{type}</span>
                    </div>
                    {risk === 'medium' && <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 rounded-full font-normal shadow-none px-2 h-5 text-[10px]">Medium Risk</Badge>}
                </div>
            </div>
        </div>
    );
}
