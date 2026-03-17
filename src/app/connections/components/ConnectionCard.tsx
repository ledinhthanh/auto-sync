"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { 
  Database, 
  Pencil, 
  Trash2, 
  Clock,
  ExternalLink
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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

interface ConnectionCardProps {
  connection: Connection;
  onEdit: (conn: Connection) => void;
  onDelete: (id: string) => void;
}

export function ConnectionCard({ connection, onEdit, onDelete }: ConnectionCardProps) {
  const isPostgres = connection.type === "POSTGRES";
  
  return (
    <div className="relative group">
      <Card className="bg-white rounded-lg border-slate-200 shadow-sm transition-all duration-200 hover:shadow-md hover:border-slate-300 overflow-hidden">
        <CardContent className="p-4 flex flex-col h-full">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-md ${
                isPostgres 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'bg-orange-50 text-orange-600'
              }`}>
                <Database className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                   <h3 className="font-semibold text-slate-900 text-sm leading-none">
                     {connection.name}
                   </h3>
                   <div className={`h-1.5 w-1.5 rounded-full ${connection.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-mono">
                  {connection.host}:{connection.port}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-0.5">
               <Link href={`/connections/${connection.id}`}>
                 <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
               <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                onClick={(e) => {
                  e.preventDefault();
                  onEdit(connection);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                onClick={(e) => {
                  e.preventDefault();
                  onDelete(connection.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-medium text-slate-600 border border-slate-200">
              {connection.type}
            </span>
            {connection.role.split(",").map(role => {
              const r = role.trim();
              const style = r === 'SOURCE' 
                ? "bg-blue-50 text-blue-700 border-blue-100" 
                : "bg-emerald-50 text-emerald-700 border-emerald-100";
              
              return (
                <span 
                  key={r} 
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border ${style}`}
                >
                  {r.toLowerCase()}
                </span>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="p-2 rounded-md bg-slate-50 border border-slate-100">
              <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider block mb-0.5">Database</span>
              <p className="text-[11px] font-medium text-slate-900 truncate font-mono">{connection.database}</p>
            </div>
            <div className="p-2 rounded-md bg-slate-50 border border-slate-100">
              <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider block mb-0.5">User</span>
              <p className="text-[11px] font-medium text-slate-900 truncate font-mono">{connection.username}</p>
            </div>
          </div>

          <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
            <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
              connection.status === 'ACTIVE' 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                : connection.status === 'ERROR' 
                ? 'bg-red-50 text-red-700 border border-red-100' 
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {connection.status === 'ACTIVE' ? 'Active' : connection.status}
            </div>
            
            {connection.lastTestedAt && (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(connection.lastTestedAt), { addSuffix: true })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
