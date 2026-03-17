"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  X
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
  sslMode: string;
}

interface ConnectionFormProps {
  editingId: string | null;
  formData: FormData;
  setFormData: (data: FormData) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  onTest: () => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
  testing: boolean;
  testResult: { success: boolean; message: string } | null;
}

export function ConnectionForm({
  editingId,
  formData,
  setFormData,
  onSubmit,
  onTest,
  onCancel,
  submitting,
  testing,
  testResult
}: ConnectionFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isTestedAndValid = testResult?.success === true;

  const handleSaveClick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTestedAndValid) {
       toast.error("Please test the connection successfully before saving.");
       return;
    }
    await onSubmit(e);
  };

  return (
    <form onSubmit={handleSaveClick} className="space-y-8">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
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
           <div>
             <h3 className="text-base font-semibold text-slate-900">
               {editingId ? 'Edit Connection' : 'New Connection'}
             </h3>
             <p className="text-xs text-slate-500 mt-0.5">
                Configure your {formData.type.toLowerCase()} database credentials.
             </p>
           </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Main Form Fields - Full Width */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-medium text-slate-700">Display Name</Label>
              <Input
                id="name"
                placeholder="e.g. Production Read-only"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-9 rounded-md border-slate-200 bg-white text-sm focus:ring-1 focus:ring-slate-300"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type" className="text-xs font-medium text-slate-700">Database Type</Label>
              <Select
                value={formData.type}
                onValueChange={(val: "POSTGRES" | "MYSQL" | null) => {
                  if (!val) return;
                  const defaultPort = val === "POSTGRES" ? 5432 : 3306;
                  setFormData({ ...formData, type: val, port: formData.port === 5432 || formData.port === 3306 ? defaultPort : formData.port });
                }}
              >
                <SelectTrigger className="h-9 rounded-md border-slate-200 bg-white text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="rounded-md border-slate-200">
                  <SelectItem value="POSTGRES" className="text-sm">PostgreSQL</SelectItem>
                  <SelectItem value="MYSQL" className="text-sm">MySQL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role" className="text-xs font-medium text-slate-700">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(val: "SOURCE" | "DESTINATION" | "SOURCE,DESTINATION" | null) => val && setFormData({ ...formData, role: val })}
              >
                <SelectTrigger className="h-9 rounded-md border-slate-200 bg-white text-sm">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent className="rounded-md border-slate-200">
                  <SelectItem value="SOURCE" className="text-sm">Source</SelectItem>
                  <SelectItem value="DESTINATION" className="text-sm">Destination</SelectItem>
                  <SelectItem value="SOURCE,DESTINATION" className="text-sm">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-3 space-y-2">
              <Label htmlFor="host" className="text-xs font-medium text-slate-700">Host</Label>
              <Input
                id="host"
                placeholder="db.example.com"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                className="h-9 rounded-md border-slate-200 bg-white text-sm"
                required
              />
            </div>
            <div className="sm:col-span-1 space-y-2">
              <Label htmlFor="port" className="text-xs font-medium text-slate-700">Port</Label>
              <Input
                id="port"
                type="number"
                placeholder="5432"
                value={formData.port || ""}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 0 })}
                className="h-9 rounded-md border-slate-200 bg-white text-sm"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="database" className="text-xs font-medium text-slate-700">Database Name</Label>
            <Input
              id="database"
              placeholder="postgres"
              value={formData.database}
              onChange={(e) => setFormData({ ...formData, database: e.target.value })}
              className="h-9 rounded-md border-slate-200 bg-white text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-medium text-slate-700">User</Label>
              <Input
                id="username"
                placeholder="db_user"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="h-9 rounded-md border-slate-200 bg-white text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium text-slate-700">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="h-9 pr-9 rounded-md border-slate-200 bg-white text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* SSL Mode */}
          <div className="space-y-2">
            <Label htmlFor="sslMode" className="text-xs font-medium text-slate-700">SSL Mode</Label>
            <Select
              value={formData.sslMode || "disable"}
              onValueChange={(val: string | null) => val && setFormData({ ...formData, sslMode: val })}
            >
              <SelectTrigger id="sslMode" className="h-9 rounded-md border-slate-200 bg-white text-sm">
                <SelectValue placeholder="Select SSL mode" />
              </SelectTrigger>
              <SelectContent className="rounded-md border-slate-200">
                <SelectItem value="disable" className="text-sm">Disable (no SSL)</SelectItem>
                <SelectItem value="require" className="text-sm">Require (encrypted, self-signed OK)</SelectItem>
                <SelectItem value="verify-ca" className="text-sm">Verify CA (encrypted + verify CA)</SelectItem>
                <SelectItem value="verify-full" className="text-sm">Verify Full (encrypted + verify hostname)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-slate-400">
              Use &quot;Disable&quot; for local/private networks. Use &quot;Require&quot; for cloud databases that mandate SSL.
            </p>
          </div>
        </div>

        {/* Integrated Footer: Test & Submit */}
        <div className="pt-8 border-t border-slate-100 space-y-6">
           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-4 rounded-lg bg-slate-50/50 border border-slate-200">
              <div className="max-w-md">
                <h4 className="text-xs font-semibold text-slate-900 mb-1">Verify Connection</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Test the connection to ensure your credentials are correct before saving.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                {testResult && (
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs whitespace-nowrap ${
                    testResult.success ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'
                  }`}>
                     {testResult.success ? <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
                     <span className="font-medium">{testResult.success ? 'Success' : 'Failed'}</span>
                  </div>
                )}
                
                <Button 
                  type="button" 
                  onClick={onTest}
                  disabled={testing}
                  variant="outline"
                  className="h-9 px-4 bg-white border-slate-200 hover:bg-slate-50 text-slate-900 rounded-md text-xs font-medium shrink-0"
                >
                  {testing && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                  Test Connection
                </Button>
              </div>
           </div>

           <div className="flex items-center justify-end gap-3">
              {onCancel && (
                <Button
                  type="button"
                  onClick={onCancel}
                  variant="ghost"
                  className="h-9 px-4 rounded-md text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={submitting || !isTestedAndValid}
                className="h-9 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-medium shadow-sm transition-all disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                {editingId ? 'Update Connection' : 'Create Connection'}
              </Button>
           </div>
        </div>
      </div>
    </form>
  );
}
