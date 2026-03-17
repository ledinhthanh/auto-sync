"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MoreHorizontal, 
  Table2, 
  FileCode, 
  Code, 
  AlertCircle, 
  CheckCircle2,
  ExternalLink,
  Edit2,
  Trash2,
  PlayCircle
} from "lucide-react";
import Link from "next/link";

interface Model {
  id: string;
  name: string;
  sourceType: string;
  sourceName: string | null;
  sourceSchema: string | null;
  customSql: string | null;
  description: string | null;
  sourceConnId: string;
  tags: string[];
  status: string;
  schemaStatus: string;
  updatedAt: string;
  sourceConn: {
    name: string;
    type: string;
  };
  _count?: {
    syncs: number;
  };
}

const sourceTypeIcons = {
  TABLE: Table2,
  VIEW: FileCode,
  MATVIEW: FileCode,
  CUSTOM_SQL: Code
};

interface ModelCardProps {
  model: Model;
  onEdit: (model: Model) => void;
  onDelete: (id: string) => void;
}

export function ModelCard({ model, onEdit, onDelete }: ModelCardProps) {
  const Icon = sourceTypeIcons[model.sourceType as keyof typeof sourceTypeIcons] || Table2;
  const sourceObject = model.sourceType === 'CUSTOM_SQL' 
    ? "Custom SQL Query" 
    : `${model.sourceSchema}.${model.sourceName}`;
  const syncCount = model._count?.syncs || 0;

  // Format date
  const updatedAt = new Date(model.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <Card className="relative overflow-hidden transition-all duration-200 hover:shadow-md border-slate-200 bg-white group">
      <CardContent className="p-4 flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <Link href={`/models/${model.id}`} className="flex items-start space-x-3 group/link">
            <div className="p-2 rounded-md bg-slate-50 text-slate-600 border border-slate-100 group-hover/link:border-indigo-100 group-hover/link:bg-indigo-50/50 transition-colors">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 truncate leading-none group-hover/link:text-indigo-600 transition-colors" title={model.name}>
                {model.name}
              </h3>
              <div className="text-[11px] text-slate-500 mt-1 font-mono truncate max-w-[150px]" title={sourceObject}>
                {sourceObject}
              </div>
            </div>
          </Link>
          
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center text-slate-400 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1 rounded-md border-slate-200 shadow-sm">
              <Link href={`/models/${model.id}`}>
                  <DropdownMenuItem className="rounded-md cursor-pointer text-xs py-2">
                      <ExternalLink className="mr-2 h-3.5 w-3.5 text-slate-400" /> 
                      <span>View Details</span>
                  </DropdownMenuItem>
              </Link>
              <DropdownMenuItem onClick={() => onEdit(model)} className="rounded-md cursor-pointer text-xs py-2">
                <Edit2 className="mr-2 h-3.5 w-3.5 text-slate-400" /> 
                <span>Edit Settings</span>
              </DropdownMenuItem>
              <Link href={`/jobs/new?modelId=${model.id}`}>
                <DropdownMenuItem className="rounded-md cursor-pointer text-xs py-2 text-indigo-600 focus:text-indigo-700 focus:bg-indigo-50">
                  <PlayCircle className="mr-2 h-3.5 w-3.5" /> 
                  <span className="font-medium">Create Sync Job</span>
                </DropdownMenuItem>
              </Link>
              <div className="h-px bg-slate-100 my-1" />
              <DropdownMenuItem 
                className="rounded-md cursor-pointer text-xs py-2 text-red-600 focus:text-red-700 focus:bg-red-50"
                onClick={() => onDelete(model.id)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> 
                <span className="font-medium">Delete Model</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          <Badge variant="secondary" className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border-transparent font-medium text-[10px] uppercase tracking-wider">
            {model.sourceType}
          </Badge>
          <Badge 
            variant="outline" 
            className={`px-2 py-0.5 rounded-md font-medium text-[10px] uppercase tracking-wider border ${
              model.schemaStatus === 'SYNCED' 
                ? 'text-emerald-600 border-emerald-100 bg-emerald-50/50' 
                : 'text-amber-600 border-amber-100 bg-amber-50/50'
            }`}
          >
            {model.schemaStatus === 'SYNCED' 
              ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Synced</>
              : <><AlertCircle className="h-3 w-3 mr-1" /> {model.schemaStatus}</>
            }
          </Badge>
        </div>

        {model.tags && model.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {model.tags.map(tag => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 border border-slate-100 font-medium whitespace-nowrap">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-2.5 bg-slate-50/50 p-3 rounded-md border border-slate-100/50 mb-4">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-500 font-medium">Source Path</span>
            <span className="font-semibold text-slate-700">{model.sourceConn.name}</span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-500 font-medium">Active Syncs</span>
            <div className="flex items-center gap-1.5">
               <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
               <span className="font-semibold text-slate-700">{syncCount} Jobs</span>
            </div>
          </div>
        </div>

        <div className="mt-auto">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest">
            <div className="flex items-center space-x-1.5">
              {model.status === 'ACTIVE'
                ? <><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /><span className="text-emerald-600">Active</span></>
                : model.status === 'DRAFT'
                ? <><div className="h-1.5 w-1.5 rounded-full bg-slate-300" /><span className="text-slate-500">Draft</span></>
                : <><div className="h-1.5 w-1.5 rounded-full bg-red-500" /><span className="text-red-500">Error</span></>
              }
            </div>
            <div className="text-slate-400 tabular-nums lowercase font-medium tracking-normal">
              {updatedAt}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
