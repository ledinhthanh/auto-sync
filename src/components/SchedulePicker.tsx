"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Clock, Calendar, Repeat, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

type Frequency = 'daily' | 'weekly' | 'monthly' | 'interval' | 'manual';

interface SchedulePickerProps {
    value: string; // cron expression (supports 5 or 6 fields)
    enabled: boolean;
    onChange: (cron: string, enabled: boolean) => void;
    className?: string;
}

const DAYS_OF_WEEK = [
    { label: 'Monday', value: '1' },
    { label: 'Tuesday', value: '2' },
    { label: 'Wednesday', value: '3' },
    { label: 'Thursday', value: '4' },
    { label: 'Friday', value: '5' },
    { label: 'Saturday', value: '6' },
    { label: 'Sunday', value: '0' },
];

function getOrdinal(n: number) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
}

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => ({
    label: `${i + 1}${getOrdinal(i + 1)}`,
    value: (i + 1).toString(),
}));

export function SchedulePicker({ value, enabled, onChange, className }: SchedulePickerProps) {
    // Parse cron to UI state
    const parsed = useMemo(() => {
        const defaultState = { frequency: 'daily' as Frequency, second: '0', hour: '0', minute: '0', day: '1', interval: '1' };
        if (!value) return defaultState;
        
        const parts = value.split(' ');
        // Support both 5 and 6 field cron
        const isSixField = parts.length === 6;
        if (parts.length !== 5 && parts.length !== 6) return defaultState;

        const sec = isSixField ? parts[0] : '0';
        const min = isSixField ? parts[1] : parts[0];
        const hour = isSixField ? parts[2] : parts[1];
        const dom = isSixField ? parts[3] : parts[2];
        const dow = isSixField ? parts[5] : parts[4];

        if (dom.startsWith('*/')) {
            return { frequency: 'interval' as Frequency, second: sec, hour, minute: min, day: '1', interval: dom.split('/')[1] };
        }
        if (dow !== '*' && dow.length === 1) {
            return { frequency: 'weekly' as Frequency, second: sec, hour, minute: min, day: dow, interval: '1' };
        }
        if (dom !== '*' && dom.length <= 2) {
            return { frequency: 'monthly' as Frequency, second: sec, hour, minute: min, day: dom, interval: '1' };
        }
        return { frequency: 'daily' as Frequency, second: sec, hour, minute: min, day: '1', interval: '1' };
    }, [value]);

    const [frequency, setFrequency] = useState<Frequency>(enabled ? parsed.frequency : 'manual');
    const [second, setSecond] = useState(parsed.second);
    const [hour, setHour] = useState(parsed.hour);
    const [minute, setMinute] = useState(parsed.minute);
    const [day, setDay] = useState(parsed.day);
    const [interval, setInterval] = useState(parsed.interval);

    // Sync external state to internal
    useEffect(() => {
        const isCurrentlyManual = frequency === 'manual';
        const shouldBeManual = !enabled;

        if (shouldBeManual !== isCurrentlyManual) {
            setFrequency(shouldBeManual ? 'manual' : parsed.frequency);
        }
        
        if (parsed.second !== second) setSecond(parsed.second);
        if (parsed.hour !== hour) setHour(parsed.hour);
        if (parsed.minute !== minute) setMinute(parsed.minute);
        if (parsed.day !== day) setDay(parsed.day);
        if (parsed.interval !== interval) setInterval(parsed.interval);
    }, [value, enabled]);

    // Build cron from UI state (always 6 fields for precision)
    const updateCron = (f: Frequency, s: string, h: string, m: string, d: string, i: string) => {
        let cron = `${s} ${m} ${h} * * *`;
        if (f === 'weekly') {
            cron = `${s} ${m} ${h} * * ${d}`;
        } else if (f === 'monthly') {
            cron = `${s} ${m} ${h} ${d} * *`;
        } else if (f === 'interval') {
            cron = `${s} ${m} ${h} */${i} * *`;
        }
        
        const isEnabled = f !== 'manual';
        onChange(cron, isEnabled);
    };

    const handleFrequencyChange = (f: Frequency) => {
        setFrequency(f);
        updateCron(f, second, hour, minute, day, interval);
    };

    const handleValueChange = (updates: Partial<{ s: string, h: string, m: string, d: string, i: string }>) => {
        const newS = updates.s ?? second;
        const newH = updates.h ?? hour;
        const newM = updates.m ?? minute;
        const newD = updates.d ?? day;
        const newI = updates.i ?? interval;

        setSecond(newS);
        setHour(newH);
        setMinute(newM);
        setDay(newD);
        setInterval(newI);

        updateCron(frequency, newS, newH, newM, newD, newI);
    };

    const unitInputClass = "bg-white border-slate-200 h-9 w-14 text-center px-1 font-mono text-xs focus:ring-indigo-500 focus:border-indigo-500 transition-all";

    return (
        <div className={cn("space-y-4 p-5 rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                        <Repeat className="h-4 w-4" />
                    </div>
                    <div>
                        <Label className="text-[11px] font-black uppercase tracking-wider text-slate-800">Runner Schedule</Label>
                        <p className="text-[10px] text-slate-400 font-medium">Configure sync trigger frequency</p>
                    </div>
                </div>
                <div className="flex items-center gap-2.5 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                        {frequency === 'manual' ? 'Manual' : 'Automated'}
                    </span>
                    <Switch 
                        checked={frequency !== 'manual'} 
                        onCheckedChange={(checked) => handleFrequencyChange(checked ? 'daily' : 'manual')}
                        className="scale-90"
                    />
                </div>
            </div>

            {frequency !== 'manual' && (
                <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="space-y-2.5 min-w-[140px]">
                            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Repeat className="h-3 w-3" /> Frequency
                            </Label>
                            <Select value={frequency} onValueChange={(val) => handleFrequencyChange(val as Frequency)}>
                                <SelectTrigger className="bg-slate-50 border-slate-100 h-10 font-bold text-xs ring-offset-0 focus:ring-2 focus:ring-indigo-100">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="daily" className="text-xs font-medium">Daily</SelectItem>
                                    <SelectItem value="weekly" className="text-xs font-medium">Weekly</SelectItem>
                                    <SelectItem value="monthly" className="text-xs font-medium">Monthly</SelectItem>
                                    <SelectItem value="interval" className="text-xs font-medium">Interval</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {frequency === 'interval' && (
                            <div className="space-y-2.5">
                                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Hash className="h-3 w-3" /> Every
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Input 
                                        type="number" 
                                        min="1" 
                                        max="31"
                                        value={interval}
                                        onChange={(e) => handleValueChange({ i: e.target.value })}
                                        className="h-10 w-16 text-center font-bold text-xs bg-slate-50 border-slate-100 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-tighter">Days</span>
                                </div>
                            </div>
                        )}

                        {(frequency === 'weekly' || frequency === 'monthly') && (
                            <div className="space-y-2.5 flex-1 min-w-[160px]">
                                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Calendar className="h-3 w-3" /> On {frequency === 'weekly' ? 'Day' : 'Date'}
                                </Label>
                                <Select value={day} onValueChange={(d) => handleValueChange({ d: d || '1' })}>
                                    <SelectTrigger className="bg-slate-50 border-slate-100 h-10 font-bold text-xs ring-offset-0 focus:ring-2 focus:ring-indigo-100">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(frequency === 'weekly' ? DAYS_OF_WEEK : DAYS_OF_MONTH).map((d) => (
                                            <SelectItem key={d.value} value={d.value} className="text-xs font-medium">{d.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50/50 border border-slate-100">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                            <Clock className="h-3 w-3" /> Execution Time (HH:MM:SS)
                        </Label>
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col gap-1.5">
                                <Input 
                                    type="number" min="0" max="23"
                                    value={hour}
                                    onChange={(e) => handleValueChange({ h: e.target.value })}
                                    className={unitInputClass}
                                />
                                <span className="text-[9px] text-center font-bold text-slate-400 uppercase">Hr</span>
                            </div>
                            <span className="text-slate-300 font-bold mb-5">:</span>
                            <div className="flex flex-col gap-1.5">
                                <Input 
                                    type="number" min="0" max="59"
                                    value={minute}
                                    onChange={(e) => handleValueChange({ m: e.target.value })}
                                    className={unitInputClass}
                                />
                                <span className="text-[9px] text-center font-bold text-slate-400 uppercase">Min</span>
                            </div>
                            <span className="text-slate-300 font-bold mb-5">:</span>
                            <div className="flex flex-col gap-1.5">
                                <Input 
                                    type="number" min="0" max="59"
                                    value={second}
                                    onChange={(e) => handleValueChange({ s: e.target.value })}
                                    className={unitInputClass}
                                />
                                <span className="text-[9px] text-center font-bold text-slate-400 uppercase">Sec</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {frequency === 'manual' && (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center text-center gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                    <p className="text-xs font-bold text-slate-900">Manual Sync Enabled</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed px-4">
                        Automatic triggers are disabled. Use the "Sync Now" button or API to start synchronization.
                    </p>
                </div>
            )}
            
            <div className="flex items-center justify-between pt-2">
                <p className="text-[9px] font-mono text-slate-400 italic">
                    Cron: <span className="text-indigo-500 font-bold ml-1">{frequency === 'manual' ? 'None' : value || 'None'}</span>
                </p>
                {frequency !== 'manual' && (
                    <div className="px-2 py-0.5 rounded bg-green-50 text-green-600 text-[9px] font-bold uppercase tracking-tight">
                        Active
                    </div>
                )}
            </div>
        </div>
    );
}
