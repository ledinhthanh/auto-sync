"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface ConnectionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ConnectionFormData) => Promise<void>;
  initialData?: ConnectionData;
  isLoading?: boolean;
}

export interface ConnectionFormData {
  id?: string;
  name: string;
  type: "POSTGRES" | "MYSQL";
  role: "SOURCE" | "DESTINATION" | "BOTH";
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  sslMode: string;
  sshEnabled: boolean;
  sshHost?: string;
  sshPort?: string;
  sshUser?: string;
  sshKey?: string;
}

export interface ConnectionData {
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
}

export function ConnectionForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isLoading,
}: ConnectionFormProps) {
  const [formData, setFormData] = useState<ConnectionFormData>({
    id: "",
    name: "",
    type: "POSTGRES",
    role: "SOURCE",
    host: "",
    port: "5432",
    database: "",
    username: "",
    password: "",
    sslMode: "disable",
    sshEnabled: false,
    sshHost: "",
    sshPort: "22",
    sshUser: "",
    sshKey: "",
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        id: initialData.id,
        name: initialData.name,
        type: (initialData.type as "POSTGRES" | "MYSQL") || "POSTGRES",
        role: (initialData.role as "SOURCE" | "DESTINATION" | "BOTH") || "SOURCE",
        host: initialData.host,
        port: initialData.port?.toString() || "5432",
        database: initialData.database,
        username: initialData.username,
        password: "",
        sslMode: initialData.sslMode || "disable",
        sshEnabled: initialData.sshEnabled || false,
        sshHost: initialData.sshHost || "",
        sshPort: initialData.sshPort?.toString() || "22",
        sshUser: initialData.sshUser || "",
        sshKey: "",
      });
    } else {
      setFormData({
        id: "",
        name: "",
        type: "POSTGRES",
        role: "SOURCE",
        host: "",
        port: "5432",
        database: "",
        username: "",
        password: "",
        sslMode: "disable",
        sshEnabled: false,
        sshHost: "",
        sshPort: "22",
        sshUser: "",
        sshKey: "",
      });
    }
    setTestResult(null);
  }, [initialData, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const handleTestConnection = async () => {
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
        message: data.error || data.serverVersion || "Connection successful",
      });
    } catch (error: unknown) {
      const err = error as Error;
      setTestResult({
        success: false,
        message: err.message || "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const inputClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData ? "Edit Connection" : "Add Connection"}
          </DialogTitle>
          <DialogDescription>
            Configure your database connection details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Connection Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Production DB"
                required
              />
            </div>

            <div>
              <Label htmlFor="type">Database Type</Label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as "POSTGRES" | "MYSQL", port: e.target.value === "POSTGRES" ? "5432" : "3306" })}
                className={inputClassName}
              >
                <option value="POSTGRES">PostgreSQL</option>
                <option value="MYSQL">MySQL</option>
              </select>
            </div>

            <div>
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as "SOURCE" | "DESTINATION" | "BOTH" })}
                className={inputClassName}
              >
                <option value="SOURCE">Source</option>
                <option value="DESTINATION">Destination</option>
                <option value="BOTH">Both</option>
              </select>
            </div>

            <div className="col-span-2">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                placeholder="e.g., localhost or 10.0.0.1"
                required
              />
            </div>

            <div>
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="database">Database Name</Label>
              <Input
                id="database"
                value={formData.database}
                onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={initialData ? "(unchanged)" : ""}
                required={!initialData}
              />
            </div>

            <div>
              <Label htmlFor="sslMode">SSL Mode</Label>
              <select
                id="sslMode"
                value={formData.sslMode}
                onChange={(e) => setFormData({ ...formData, sslMode: e.target.value })}
                className={inputClassName}
              >
                <option value="disable">Disable</option>
                <option value="require">Require</option>
                <option value="verify-full">Verify Full</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="sshEnabled"
              checked={formData.sshEnabled}
              onChange={(e) => setFormData({ ...formData, sshEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="sshEnabled" className="text-sm font-normal">
              Enable SSH Tunnel
            </Label>
          </div>

          {formData.sshEnabled && (
            <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 ml-1">
              <div>
                <Label htmlFor="sshHost">SSH Host</Label>
                <Input
                  id="sshHost"
                  value={formData.sshHost}
                  onChange={(e) => setFormData({ ...formData, sshHost: e.target.value })}
                  placeholder="e.g., jump-server.example.com"
                />
              </div>
              <div>
                <Label htmlFor="sshPort">SSH Port</Label>
                <Input
                  id="sshPort"
                  type="number"
                  value={formData.sshPort}
                  onChange={(e) => setFormData({ ...formData, sshPort: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="sshUser">SSH User</Label>
                <Input
                  id="sshUser"
                  value={formData.sshUser}
                  onChange={(e) => setFormData({ ...formData, sshUser: e.target.value })}
                />
              </div>
            </div>
          )}

          {testResult && (
            <div className={`flex flex-col gap-2 p-3 rounded-md ${
              testResult.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span className="text-sm font-medium">{testResult.success ? "Success" : "Connection Failed"}</span>
              </div>
              <p className="text-xs break-all opacity-90">{testResult.message}</p>
              
              {!testResult.success && formData.host === 'localhost' && (
                <div className="mt-1 pt-2 border-t border-red-200 text-[10px] leading-tight flex flex-col gap-1">
                  <p className="font-bold uppercase tracking-wider">💡 Docker Tip:</p>
                  <p>Running inside Docker? Use <b>host.docker.internal</b> instead of <b>localhost</b> to connect back to your computer.</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !formData.host || !formData.database}
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData ? "Save Changes" : "Add Connection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
