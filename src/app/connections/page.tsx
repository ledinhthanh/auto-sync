"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Search, 
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { ConnectionCard } from "./components/ConnectionCard";
import { ConnectionForm } from "./components/ConnectionForm";
import { EmptyState } from "./components/EmptyState";
import { SelectTypeStep } from "./components/SelectTypeStep";

interface Connection {
  id: string;
  name: string;
  type: string;
  role: string;
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: string | null;
  sshEnabled: boolean;
  sshHost: string | null;
  sshPort: number | null;
  sshUser: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastError: string | null;
}

interface FormData {
  id?: string;
  name: string;
  type: "POSTGRES" | "MYSQL";
  role: "SOURCE" | "DESTINATION" | "SOURCE,DESTINATION";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode?: string;
}

const INITIAL_FORM_DATA: FormData = {
  name: "",
  type: "POSTGRES",
  role: "SOURCE",
  host: "",
  port: 5432,
  database: "",
  username: "",
  password: "",
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [step, setStep] = useState(1); // 1: Select Type, 2: Configure

  const fetchConnections = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data);
      }
    } catch (error) {
      console.error("Failed to fetch connections:", error);
      toast.error("Failed to load connections");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const resetForm = () => {
    setFormData(INITIAL_FORM_DATA);
    setEditingId(null);
    setShowForm(false);
    setStep(1);
    setTestResult(null);
  };

  const handleAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const handleTypeSelect = (type: string) => {
    if (type === "POSTGRES") {
      setFormData({
        ...INITIAL_FORM_DATA,
        type: "POSTGRES",
        port: 5432,
      });
    } else if (type === "MYSQL") {
      setFormData({
        ...INITIAL_FORM_DATA,
        type: "MYSQL",
        port: 3306,
      });
    }
    setStep(2);
  };

  const handleEdit = (conn: Connection) => {
    setFormData({
      id: conn.id,
      name: conn.name,
      type: conn.type as "POSTGRES" | "MYSQL",
      role: conn.role as "SOURCE" | "DESTINATION",
      host: conn.host,
      port: conn.port,
      database: conn.database,
      username: conn.username,
      password: "",
      sslMode: conn.sslMode || "disable",
    });
    setEditingId(conn.id);
    setStep(2);
    setShowForm(true);
    setTestResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = editingId ? `/api/connections/${editingId}` : "/api/connections";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      if (!res.ok) throw new Error(editingId ? "Failed to update connection" : "Failed to create connection");
      
      toast.success(editingId ? "Connection updated" : "Connection created");
      resetForm();
      fetchConnections();
    } catch (error) {
      console.error("Submit error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save connection");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this connection?")) return;
    
    try {
      const res = await fetch(`/api/connections/${id}?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      
      toast.success("Connection deleted");
      fetchConnections(true);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete connection");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const res = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      setTestResult({
        success: res.ok && data.success,
        message: data.error || data.serverVersion || "Connection successful! Ready to sync.",
      });
      if (res.ok && data.success) {
        toast.success("Connection test passed!");
      } else {
        toast.error("Connection test failed");
      }
    } catch (error: unknown) {
      const err = error as Error;
      setTestResult({
        success: false,
        message: err.message || "Network error. Could not reach server.",
      });
      toast.error("Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const filteredConnections = useMemo(() => {
    return connections.filter(conn => {
      const matchesFilter = 
        filter === "all" ||
        (filter === "source" && conn.role === "SOURCE") ||
        (filter === "dest" && conn.role === "DESTINATION") ||
        (filter === "error" && conn.status === "ERROR");
      
      const searchTerm = search.toLowerCase();
      const matchesSearch = 
        conn.name.toLowerCase().includes(searchTerm) ||
        conn.host.toLowerCase().includes(searchTerm) ||
        conn.database.toLowerCase().includes(searchTerm);

      return matchesFilter && matchesSearch;
    });
  }, [connections, filter, search]);

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Connections</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your database infrastructure and data pipelines.
          </p>
        </div>

        {!showForm && (
          <Button
            onClick={handleAdd}
            className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-medium shadow-sm flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Connection
          </Button>
        )}
      </div>

      {showForm ? (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className="rounded-lg border-slate-200 shadow-sm bg-white overflow-hidden">
            <CardContent className="p-6">
              {step === 1 && !editingId ? (
                <SelectTypeStep onSelect={handleTypeSelect} onCancel={resetForm} />
              ) : (
                <ConnectionForm
                  editingId={editingId}
                  formData={formData}
                  setFormData={setFormData}
                  onSubmit={handleSubmit}
                  onTest={handleTest}
                  onCancel={resetForm}
                  submitting={submitting}
                  testing={testing}
                  testResult={testResult}
                />
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search connections..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 bg-white border-slate-200 rounded-md text-sm focus:ring-1 focus:ring-slate-300"
              />
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Tabs value={filter} onValueChange={setFilter} className="w-full md:w-auto">
                <TabsList className="bg-slate-100/50 p-1 h-9 rounded-md">
                  <TabsTrigger value="all" className="rounded-sm px-3 h-7 text-xs font-medium">All</TabsTrigger>
                  <TabsTrigger value="source" className="rounded-sm px-3 h-7 text-xs font-medium">Sources</TabsTrigger>
                  <TabsTrigger value="destination" className="rounded-sm px-3 h-7 text-xs font-medium">Destinations</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => fetchConnections()}
                className="h-9 w-9 rounded-md border-slate-200 hover:bg-slate-50 text-slate-500"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Grid Layout */}
          {loading && connections.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 rounded-lg border border-slate-100 bg-slate-50 animate-pulse" />
              ))}
            </div>
          ) : filteredConnections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white">
              <EmptyState onAdd={handleAdd} isSearch={search !== "" || filter !== "all"} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredConnections.map((conn, idx) => (
                <div 
                  key={conn.id} 
                  className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <ConnectionCard 
                    connection={conn}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
