"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays, startOfDay } from "date-fns";

type RawData = {
    startedAt: Date;
    status: string;
};

export function SyncHealthChart({ rawData }: { rawData: RawData[] }) {
    const data = useMemo(() => {
        // Initialize last 7 days including today
        const chartData: Record<string, { date: string; displayDate: string; success: number; failed: number }> = {};
        
        for (let i = 6; i >= 0; i--) {
            const date = startOfDay(subDays(new Date(), i));
            const formatted = format(date, "yyyy-MM-dd");
            chartData[formatted] = {
                date: formatted,
                displayDate: format(date, "MMM dd"),
                success: 0,
                failed: 0
            };
        }

        // Aggregate Data
        rawData.forEach(run => {
            const runDate = format(run.startedAt, "yyyy-MM-dd");
            if (chartData[runDate]) {
                if (run.status === 'SUCCESS') chartData[runDate].success++;
                if (run.status === 'FAILED') chartData[runDate].failed++;
            }
        });

        return Object.values(chartData);
    }, [rawData]);

    if (rawData.length === 0) {
        return (
            <div className="flex items-center justify-center h-full w-full">
                <p className="text-sm text-slate-500 italic">Not enough historical data to generate trend yet.</p>
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                </defs>
                <XAxis dataKey="displayDate" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dx={10} dy={10} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} dx={-10} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                    labelStyle={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="success" name="Successful Runs" stroke="#10b981" fillOpacity={1} fill="url(#colorSuccess)" strokeWidth={2} activeDot={{ r: 6 }} />
                <Area type="monotone" dataKey="failed" name="Failed Runs" stroke="#ef4444" fillOpacity={1} fill="url(#colorFailed)" strokeWidth={2} activeDot={{ r: 6 }} />
            </AreaChart>
        </ResponsiveContainer>
    );
}
