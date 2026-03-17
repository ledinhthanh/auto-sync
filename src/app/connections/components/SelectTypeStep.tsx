"use client";

import { Button } from "@/components/ui/button";
import { Database, Search, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

const CONNECTION_TYPES = [
  {
    id: "POSTGRES",
    name: "PostgreSQL",
    description: "Robust open-source relational database favored for performance.",
    icon: Database,
    color: "indigo",
    tags: ["Relational", "ACID"]
  },
  {
    id: "MYSQL",
    name: "MySQL",
    description: "Reliable, mass-market database for enterprise web applications.",
    icon: Database,
    color: "amber",
    tags: ["Web", "Scale"]
  },
  {
    id: "SNOWFLAKE",
    name: "Snowflake",
    description: "Cloud data warehouse for large-scale analytic workloads.",
    icon: Database,
    color: "blue",
    disabled: true,
    tags: ["Warehouse", "Data Plane"]
  },
  {
    id: "BIGQUERY",
    name: "BigQuery",
    description: "Serverless data warehouse with built-in machine learning.",
    icon: Database,
    color: "orange",
    disabled: true,
    tags: ["Serverless", "Big Data"]
  }
];

interface SelectTypeStepProps {
  onSelect: (type: string) => void;
  onCancel?: () => void;
}

export function SelectTypeStep({ onSelect, onCancel }: SelectTypeStepProps) {
  const [search, setSearch] = useState("");

  const filteredTypes = CONNECTION_TYPES.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          {onCancel && (
            <Button 
              type="button"
              variant="ghost" 
              size="icon" 
              onClick={onCancel}
              className="h-8 w-8 rounded-md text-slate-400 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold text-slate-900 leading-tight">Add Connection</h2>
            <p className="text-sm text-slate-500">Select a database engine to get started.</p>
          </div>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search engines..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-white border-slate-200 rounded-md text-sm focus:ring-1 focus:ring-slate-300"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
        {filteredTypes.map((type) => (
          <div 
            key={type.id}
            className={`group relative flex items-start gap-4 p-4 cursor-pointer rounded-lg border border-slate-200 bg-white transition-all duration-200 hover:border-slate-300 hover:shadow-sm ${type.disabled ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
            onClick={() => !type.disabled && onSelect(type.id)}
          >
            <div className="h-10 w-10 flex-shrink-0 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-slate-900 transition-colors">
              <type.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-slate-900 truncate">{type.name}</h3>
                <div className="flex gap-1">
                  {type.tags.slice(0, 1).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-medium text-slate-500 uppercase tracking-tight">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                {type.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
