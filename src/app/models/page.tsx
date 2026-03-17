"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, RefreshCw, Database, LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight, Tag, Table2, Code as CodeIcon, MoreHorizontal, Edit2, Trash2, Zap, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ModelCard } from "./components/ModelCard";
import { ModelForm } from "./components/ModelForm";
import { BulkModelForm } from "./components/BulkModelForm";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const emptyForm = {
  name: "",
  description: "",
  sourceConnId: "",
  sourceType: "TABLE",
  sourceSchema: "public",
  sourceName: "",
  customSql: "",
  tags: [] as string[],
};

export default function ModelsPage() {
    const router = useRouter();
    const [models, setModels] = useState<Model[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    
    const [showForm, setShowForm] = useState(false);
    const [editingModel, setEditingModel] = useState<Model | null>(null);
    const [formData, setFormData] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [showBulkForm, setShowBulkForm] = useState(false);

    // Bulk selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);

    const fetchModels = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch("/api/models");
            if (res.ok) {
                const data = await res.json();
                setModels(data);
            }
        } catch (error) {
            console.error("Failed to fetch models:", error);
            toast.error("Failed to load models");
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchModels();
    }, [fetchModels]);

    const handleAdd = () => {
        setFormData(emptyForm);
        setEditingModel(null);
        setShowForm(true);
    };

    const handleEdit = (model: Model) => {
        setEditingModel(model);
        setFormData({
            name: model.name || "",
            description: model.description || "",
            sourceConnId: model.sourceConnId || "",
            sourceType: model.sourceType || "TABLE",
            sourceSchema: model.sourceSchema || "public",
            sourceName: model.sourceName || "",
            customSql: model.customSql || "",
            tags: model.tags || [],
        });
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this model?")) return;
        
        try {
            const res = await fetch(`/api/models/${id}`, {
                method: "DELETE",
            });
            
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || "Failed to delete model");
            }
            
            toast.success("Model deleted successfully");
            fetchModels(true);
        } catch (error) {
            console.error("Delete error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to delete model");
        }
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedIds);
        // Filter out models that have syncs attached
        const deletable = ids.filter(id => {
            const model = models.find(m => m.id === id);
            return !model?._count?.syncs || model._count.syncs === 0;
        });
        const skipped = ids.length - deletable.length;

        if (deletable.length === 0) {
            toast.error("All selected models have active syncs and cannot be deleted.");
            return;
        }

        const confirmMsg = skipped > 0
            ? `Delete ${deletable.length} model(s)? ${skipped} model(s) with active syncs will be skipped.`
            : `Delete ${deletable.length} model(s)? This cannot be undone.`;

        if (!confirm(confirmMsg)) return;

        setBulkDeleting(true);
        const results = await Promise.allSettled(
            deletable.map(id => fetch(`/api/models/${id}`, { method: "DELETE" }))
        );
        setBulkDeleting(false);

        const failed = results.filter(r => r.status === 'rejected').length;
        const deleted = results.length - failed;
        if (deleted > 0) toast.success(`${deleted} model(s) deleted.${skipped > 0 ? ` ${skipped} skipped (have syncs).` : ""}`);
        if (failed > 0) toast.error(`${failed} model(s) failed to delete.`);

        setSelectedIds(new Set());
        fetchModels(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const url = editingModel ? `/api/models/${editingModel.id}` : "/api/models";
            const method = editingModel ? "PUT" : "POST";
            
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });
            
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || "Failed to save model");
            }
            
            toast.success(editingModel ? "Model updated" : "Model created");
            
            if (!editingModel) {
                const data = await res.json();
                router.push(`/models/${data.id}`);
                return;
            }
            
            setShowForm(false);
            fetchModels();
        } catch (error) {
            console.error("Submit error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to save model");
        } finally {
            setSubmitting(false);
        }
    };

    // Extract unique tags
    const allUniqueTags = useMemo(() => {
        const tagSet = new Set<string>();
        models.forEach(m => m.tags?.forEach(t => tagSet.add(t)));
        return Array.from(tagSet).sort();
    }, [models]);

    const filteredModels = useMemo(() => {
        const result = models.filter(model => {
            const matchesFilter = 
                filter === "all" ||
                (filter === "active" && model.status === "ACTIVE") ||
                (filter === "draft" && model.status === "DRAFT") ||
                (filter === "error" && model.status === "ERROR");
            
            const searchTerm = search.toLowerCase();
            const matchesSearch = 
                model.name.toLowerCase().includes(searchTerm) ||
                (model.sourceName?.toLowerCase() || "").includes(searchTerm);
            
            const matchesTags = 
                selectedTags.length === 0 || 
                selectedTags.every(tag => model.tags?.includes(tag));
            
            return matchesFilter && matchesSearch && matchesTags;
        });

        return result;
    }, [models, filter, search, selectedTags]);

    const paginatedModels = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredModels.slice(start, start + pageSize);
    }, [filteredModels, currentPage, pageSize]);

    const totalPages = Math.ceil(filteredModels.length / pageSize);

    useEffect(() => {
        setCurrentPage(1);
        // Clear selection when filter/search changes
        setSelectedIds(new Set());
    }, [filter, search, selectedTags]);

    const toggleTag = (tag: string) => {
        setSelectedTags(prev => 
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    if (showForm) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
                <ModelForm
                    editingId={editingModel?.id || null}
                    formData={formData}
                    setFormData={setFormData}
                    onSubmit={handleSubmit}
                    onCancel={() => setShowForm(false)}
                    submitting={submitting}
                />
            </div>
        );
    }

    if (showBulkForm) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
                <BulkModelForm
                    onSuccess={() => {
                        setShowBulkForm(false);
                        fetchModels();
                    }}
                    onCancel={() => setShowBulkForm(false)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20 px-4 sm:px-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-6 border-b border-slate-100">
                <div>
                    <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
                        Models
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Architecture your data definitions and source maps.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-md">
                        <Button 
                            variant={viewMode === "grid" ? "secondary" : "ghost"}
                            size="icon"
                            className="h-8 w-8 rounded-sm"
                            onClick={() => setViewMode("grid")}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button 
                            variant={viewMode === "list" ? "secondary" : "ghost"}
                            size="icon"
                            className="h-8 w-8 rounded-sm"
                            onClick={() => setViewMode("list")}
                        >
                            <ListIcon className="h-4 w-4" />
                        </Button>
                    </div>
                    <Button 
                        onClick={() => setShowBulkForm(true)}
                        className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold shadow-sm"
                    >
                        <Zap className="mr-2 h-3.5 w-3.5" /> 
                        Bulk Import
                    </Button>
                    <Button 
                        onClick={handleAdd}
                        className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-medium shadow-sm"
                    >
                        <Plus className="mr-2 h-3.5 w-3.5" /> 
                        New Model
                    </Button>
                </div>
            </div>

            {/* Advanced Filters */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <Tabs defaultValue="all" onValueChange={setFilter} className="w-full sm:w-auto">
                        <TabsList className="bg-slate-100/50 p-1 h-9 rounded-md">
                            {["all", "active", "draft", "error"].map((v) => (
                                <TabsTrigger 
                                    key={v}
                                    value={v} 
                                    className="px-3 py-1 rounded-sm text-[10px] uppercase font-bold tracking-wider data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                                >
                                    {v}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>

                    <div className="flex items-center gap-2">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                                type="search"
                                placeholder="Search models..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full sm:w-[240px] h-9 pl-9 pr-3 rounded-md border-slate-200 bg-white text-xs focus:ring-1 focus:ring-slate-300 transition-all"
                            />
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 text-slate-400 hover:text-slate-900 rounded-md"
                            onClick={() => fetchModels()}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>

                {/* Tag Cloud */}
                {allUniqueTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 py-1">
                        <div className="flex items-center gap-1.5 text-slate-400 mr-2">
                            <Tag className="h-3 w-3" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Tags:</span>
                        </div>
                        {allUniqueTags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => toggleTag(tag)}
                                className={`text-[10px] px-2.5 py-1 rounded-full border transition-all font-medium ${
                                    selectedTags.includes(tag)
                                        ? "bg-slate-900 text-white border-slate-900"
                                        : "bg-white text-slate-500 border-slate-100 hover:border-slate-300"
                                }`}
                            >
                                #{tag}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* List/Grid Content */}
            {loading && models.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-48 rounded-lg bg-slate-50 animate-pulse border border-slate-100" />
                    ))}
                </div>
            ) : filteredModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                    <Database className="h-8 w-8 text-slate-200 mb-4" />
                    <h3 className="text-sm font-semibold text-slate-900">No models found</h3>
                    <p className="text-xs text-slate-500 mt-1">Try resetting your filters or search terms.</p>
                </div>
            ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {paginatedModels.map(model => (
                        <ModelCard 
                            key={model.id} 
                            model={model} 
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    ))}
                    {currentPage === 1 && filteredModels.length < pageSize && (
                        <button 
                            onClick={handleAdd}
                            className="h-full min-h-[180px] rounded-lg border-2 border-dashed border-slate-200 bg-transparent hover:bg-slate-50/50 hover:border-slate-300 transition-all flex flex-col items-center justify-center p-6 gap-3 group"
                        >
                            <div className="p-3 bg-slate-100 text-slate-400 rounded-md group-hover:bg-slate-200 group-hover:text-slate-600 transition-all">
                                <Plus className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">Add New Model</p>
                            </div>
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                    {/* Bulk action bar */}
                    {selectedIds.size > 0 && (
                        <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50 border-b border-indigo-100">
                            <span className="text-xs font-semibold text-indigo-700">
                                {selectedIds.size} model{selectedIds.size > 1 ? 's' : ''} selected
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="text-[11px] text-indigo-600 hover:text-indigo-900 font-medium"
                                >
                                    Clear
                                </button>
                                <Button
                                    size="sm"
                                    disabled={bulkDeleting}
                                    onClick={handleBulkDelete}
                                    className="h-7 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md"
                                >
                                    {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Trash2 className="h-3 w-3 mr-1.5" />}
                                    Delete Selected
                                </Button>
                            </div>
                        </div>
                    )}
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="pl-4 pr-2 py-3 w-10">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                                        checked={filteredModels.length > 0 && filteredModels.every(m => (m._count?.syncs ?? 0) > 0 || selectedIds.has(m.id))}
                                        onChange={(e) => {
                                            const next = new Set(selectedIds);
                                            if (e.target.checked) {
                                                filteredModels.forEach(m => {
                                                    if (!m._count?.syncs || m._count.syncs === 0) {
                                                        next.add(m.id);
                                                    }
                                                });
                                            } else {
                                                // Clear global selection
                                                next.clear();
                                            }
                                            setSelectedIds(next);
                                        }}
                                    />
                                </th>
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Name</th>
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Source</th>
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</th>
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Synced</th>
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Jobs</th>
                                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedModels.map(model => {
                                const hasSyncs = (model._count?.syncs ?? 0) > 0;
                                const isSelected = selectedIds.has(model.id);
                                return (
                                    <tr key={model.id} className={`hover:bg-slate-50/50 transition-colors group ${isSelected ? 'bg-indigo-50/40' : ''}`}>
                                        <td className="pl-4 pr-2 py-4">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-slate-300 accent-indigo-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                checked={isSelected}
                                                disabled={hasSyncs}
                                                title={hasSyncs ? "Cannot select: model has active syncs" : undefined}
                                                onChange={(e) => {
                                                    const next = new Set(selectedIds);
                                                    if (e.target.checked) next.add(model.id);
                                                    else next.delete(model.id);
                                                    setSelectedIds(next);
                                                }}
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex flex-col">
                                                <Link href={`/models/${model.id}`} className="group/link">
                                                    <span className="text-sm font-semibold text-slate-900 leading-none mb-1 hover:text-indigo-600 transition-colors">{model.name}</span>
                                                </Link>
                                                <span className="text-[10px] text-slate-400 font-mono italic max-w-[140px] truncate mt-1">
                                                    {model.sourceType === 'CUSTOM_SQL' ? 'SQL Query' : `${model.sourceSchema}.${model.sourceName}`}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-medium text-slate-700">{model.sourceConn.name}</span>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">{model.sourceConn.type}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-1.5">
                                                {model.sourceType === 'CUSTOM_SQL' ? <CodeIcon className="h-3.5 w-3.5 text-slate-400" /> : <Table2 className="h-3.5 w-3.5 text-slate-400" />}
                                                <span className="text-xs text-slate-600">{model.sourceType}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-1.5">
                                                <div className={`h-1.5 w-1.5 rounded-full ${
                                                    model.status === 'ACTIVE' ? 'bg-emerald-500' : 
                                                    model.status === 'ERROR' ? 'bg-red-500' : 'bg-slate-300'
                                                }`} />
                                                <span className="text-xs font-medium text-slate-700">{model.status}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <Badge variant="outline" className={`px-2 py-0.5 text-[9px] rounded-md ${
                                                model.schemaStatus === 'SYNCED' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'
                                            }`}>
                                                {model.schemaStatus}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-4">
                                            {hasSyncs ? (
                                                <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                                    {model._count!.syncs} job{model._count!.syncs > 1 ? 's' : ''}
                                                </span>
                                            ) : (
                                                <span className="text-[11px] text-slate-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center text-slate-400 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors ml-auto">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-40 p-1 rounded-md border-slate-200 shadow-sm">
                                                    <DropdownMenuItem onClick={() => handleEdit(model)} className="text-xs rounded-md">
                                                        <Edit2 className="h-3 w-3 mr-2" /> Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        disabled={hasSyncs}
                                                        onClick={() => !hasSyncs && handleDelete(model.id)}
                                                        className={`text-xs rounded-md ${hasSyncs ? 'opacity-40 cursor-not-allowed' : 'text-red-600'}`}
                                                        title={hasSyncs ? 'Cannot delete: model has active syncs' : undefined}
                                                    >
                                                        <Trash2 className="h-3 w-3 mr-2" /> Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination Controls */}
            {filteredModels.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 pt-6 gap-4">
                    <div className="flex items-center gap-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Showing {Math.min((currentPage - 1) * pageSize + 1, filteredModels.length)} to {Math.min(currentPage * pageSize, filteredModels.length)} of {filteredModels.length} models
                        </p>
                        
                        <div className="flex items-center gap-2 border-l border-slate-100 pl-4">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Page size:</span>
                            <select 
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="text-[10px] font-bold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 outline-none focus:border-indigo-500 transition-colors"
                            >
                                {[10, 25, 50, 100].map(size => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="h-8 w-8 rounded-md border-slate-200"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="flex items-center gap-1 mx-2">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    // Basic pagination logic to show current window
                                    let pageNum = i + 1;
                                    if (totalPages > 5 && currentPage > 3) {
                                        pageNum = currentPage - 2 + i;
                                        if (pageNum + (4-i) > totalPages) pageNum = totalPages - 4 + i;
                                    }
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`h-8 w-8 rounded-md text-[10px] font-bold transition-all ${
                                                currentPage === pageNum
                                                    ? "bg-slate-900 text-white shadow-sm"
                                                    : "text-slate-500 hover:bg-slate-50"
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="h-8 w-8 rounded-md border-slate-200"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

