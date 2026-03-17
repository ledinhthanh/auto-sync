"use client";

import { Button } from "@/components/ui/button";
import { Plus, Search, Database } from "lucide-react";

interface EmptyStateProps {
  onAdd: () => void;
  isSearch?: boolean;
}

export function EmptyState({ onAdd, isSearch }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in duration-500">
      <div className="mx-auto w-12 h-12 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center mb-4">
        {isSearch ? (
          <Search className="h-5 w-5 text-slate-400" />
        ) : (
          <Database className="h-5 w-5 text-slate-400" />
        )}
      </div>
      
      <h3 className="text-base font-semibold text-slate-900 mb-1">
        {isSearch ? "No matches" : "No nodes yet"}
      </h3>
      
      <p className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">
        {isSearch 
          ? "No connections matching your filters were found."
          : "Connect your infrastructure to start orchestrating data pipelines."}
      </p>
      
      <div className="flex items-center justify-center gap-3">
        <Button 
          onClick={onAdd}
          className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-medium shadow-sm flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {isSearch ? "Add Connection" : "Add Connection"}
        </Button>
        {!isSearch && (
          <Button variant="ghost" className="h-9 px-4 rounded-md text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50">
            Read docs
          </Button>
        )}
      </div>
    </div>
  );
}
