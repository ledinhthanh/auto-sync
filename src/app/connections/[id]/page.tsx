"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Database, 
  ChevronLeft, 
  Activity, 
  Settings, 
  FileText, 
  BarChart3,
  Clock,
  ShieldCheck,
  Globe,
  RefreshCw,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
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
  status: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
}

export default function ConnectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConnection = async () => {
      try {
        const res = await fetch(`/api/connections/${params.id}`);
        if (res.ok) {
          const data = await res.json();
          setConnection(data);
        } else {
          toast.error("Connection not found");
          router.push("/connections");
        }
      } catch {
        toast.error("Failed to load connection");
      } finally {
        setLoading(false);
      }
    };

    if (params.id) fetchConnection();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="h-10 w-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!connection) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-10 animate-in fade-in duration-700">
      {/* Breadcrumbs & Navigation */}
      <button 
        onClick={() => router.push("/connections")}
        className="flex items-center gap-2 text-slate-400 font-black uppercase tracking-widest text-[10px] hover:text-indigo-600 transition-colors group"
      >
        <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
        Back to Infrastructure
      </button>

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-[2rem] bg-slate-900 p-8 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-slate-900 to-slate-900" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="h-20 w-20 bg-white/10 backdrop-blur-xl border border-white/10 rounded-[1.5rem] flex items-center justify-center shadow-2xl rotate-3">
              <Database className="h-10 w-10 text-indigo-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                 <h1 className="text-3xl font-black text-white tracking-tight">{connection.name}</h1>
                 <div className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                   connection.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                 }`}>
                   {connection.status === 'ACTIVE' ? 'Live' : 'Issue'}
                 </div>
              </div>
              <div className="flex items-center gap-4 text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3 w-3 text-indigo-400" />
                  {connection.host}:{connection.port}
                </div>
                <div className="h-1 w-1 rounded-full bg-slate-700" />
                <div className="flex items-center gap-1.5">
                  <Database className="h-3 w-3 text-indigo-400" />
                  {connection.database}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <Button variant="outline" className="h-12 px-6 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl font-black uppercase tracking-widest text-[9px] transition-all">
               Test Connection
             </Button>
             <Button className="h-12 px-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest text-[9px] shadow-xl shadow-indigo-500/20 transition-all">
               Edit Config
             </Button>
          </div>
        </div>
      </div>

      {/* Dashboard Tabs */}
      <Tabs defaultValue="overview" className="space-y-8">
        <TabsList className="h-14 p-1.5 bg-slate-100 rounded-xl w-full md:w-auto overflow-x-auto">
          <TabsTrigger value="overview" className="h-11 px-6 rounded-lg font-black uppercase tracking-widest text-[9px] data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm transition-all flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="usage" className="h-11 px-6 rounded-lg font-black uppercase tracking-widest text-[9px] data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm transition-all flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5" /> Discovery
          </TabsTrigger>
          <TabsTrigger value="logs" className="h-11 px-6 rounded-lg font-black uppercase tracking-widest text-[9px] data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm transition-all flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" /> Logs
          </TabsTrigger>
          <TabsTrigger value="settings" className="h-11 px-6 rounded-lg font-black uppercase tracking-widest text-[9px] data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm transition-all flex items-center gap-2">
            <Settings className="h-3.5 w-3.5" /> Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8 focus-visible:outline-none">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {/* Stats Overview */}
            <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-5">
               <Card className="bg-white border-slate-200/60 rounded-[2rem] shadow-xl shadow-slate-200/20 overflow-hidden">
                 <CardContent className="p-6 space-y-4">
                   <div className="flex items-center justify-between">
                     <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Connectivity</span>
                     <Activity className="h-3.5 w-3.5 text-emerald-500" />
                   </div>
                   <div className="space-y-0.5">
                     <h3 className="text-2xl font-black text-slate-900 tracking-tight">24ms</h3>
                     <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">Healthy Ping</p>
                   </div>
                   <div className="h-10 w-full bg-slate-50 rounded-lg relative overflow-hidden">
                     <div className="absolute inset-x-0 bottom-0 h-6 bg-emerald-500/10 flex items-end px-1 gap-0.5">
                        {[40, 60, 45, 70, 55, 80, 50, 90, 60, 75].map((h, i) => (
                          <div key={i} style={{ height: `${h}%` }} className="flex-1 bg-emerald-500/40 rounded-t-[1px]" />
                        ))}
                     </div>
                   </div>
                 </CardContent>
               </Card>

               <Card className="bg-white border-slate-200/60 rounded-[2rem] shadow-xl shadow-slate-200/20 overflow-hidden">
                 <CardContent className="p-6 space-y-4">
                   <div className="flex items-center justify-between">
                     <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Links</span>
                     <Database className="h-3.5 w-3.5 text-indigo-500" />
                   </div>
                   <div className="space-y-0.5">
                     <h3 className="text-2xl font-black text-slate-900 tracking-tight">12</h3>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Models Tuned</p>
                   </div>
                   <div className="flex gap-1.5">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-7 w-7 rounded-lg bg-slate-100 border border-white shadow-sm flex items-center justify-center text-[9px] font-black text-slate-500">M{i}</div>
                      ))}
                      <div className="h-7 w-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-[9px] font-black text-slate-400">+8</div>
                   </div>
                 </CardContent>
               </Card>

               {/* Connection Details List */}
               <Card className="bg-white border-slate-200/60 rounded-[2rem] shadow-xl shadow-slate-200/20 col-span-full">
                 <CardContent className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Topology Details</h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                       <div className="space-y-4">
                         <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-slate-50 text-slate-400 border border-slate-100">
                              <ShieldCheck className="h-4 w-4" />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">SSL Security</span>
                              <p className="text-xs font-black text-slate-700">{connection.sslMode || 'PLAINTEXT'}</p>
                            </div>
                         </div>
                         <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-slate-50 text-slate-400 border border-slate-100">
                              <Globe className="h-4 w-4" />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ingress Point</span>
                              <p className="text-xs font-black text-slate-700">{connection.host}</p>
                            </div>
                         </div>
                       </div>

                       <div className="space-y-4">
                         <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-slate-50 text-slate-400 border border-slate-100">
                              <Clock className="h-4 w-4" />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Last Verified</span>
                              <p className="text-xs font-black text-slate-700">
                                {connection.lastTestedAt ? formatDistanceToNow(new Date(connection.lastTestedAt), { addSuffix: true }) : 'Pending'}
                              </p>
                            </div>
                         </div>
                         <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-slate-50 text-slate-400 border border-slate-100">
                              <Settings className="h-4 w-4" />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Driver Engine</span>
                              <p className="text-xs font-black text-slate-700">{connection.type}</p>
                            </div>
                         </div>
                       </div>
                    </div>
                 </CardContent>
               </Card>
            </div>

            {/* Side Activity */}
            <div className="md:col-span-4 space-y-5">
               <Card className="bg-slate-900 border-0 rounded-[2rem] shadow-2xl p-6 text-white overflow-hidden relative">
                  <div className="absolute top-0 right-0 h-24 w-24 bg-indigo-500/10 blur-2xl -mr-8 -mt-8" />
                  
                  <div className="relative space-y-4">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-indigo-400" />
                      <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Node Health</h4>
                    </div>

                    <div className="space-y-3">
                       <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                          <span className="text-[10px] font-bold text-slate-400">Socket</span>
                          <span className="text-[10px] font-black text-emerald-400">UP</span>
                       </div>
                       <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                          <span className="text-[10px] font-bold text-slate-400">IO Quota</span>
                          <span className="text-[10px] font-black text-emerald-400">92%</span>
                       </div>
                       <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                          <span className="text-[10px] font-bold text-slate-400">Anomalies</span>
                          <span className="text-[10px] font-black text-slate-500">N/A</span>
                       </div>
                    </div>

                    <Button className="w-full h-10 bg-white text-slate-900 hover:bg-slate-100 rounded-lg font-black uppercase tracking-widest text-[9px] shadow-lg shadow-black/20 transition-all">
                      Diagnostics
                    </Button>
                  </div>
               </Card>

               <div className="p-6 rounded-[2rem] bg-indigo-50 border border-indigo-100 space-y-3">
                 <div className="flex items-center gap-2">
                   <AlertCircle className="h-4 w-4 text-indigo-600" />
                   <h4 className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Observation</h4>
                 </div>
                 <p className="text-[10px] font-bold text-indigo-900/70 leading-relaxed uppercase tracking-tight">
                   Engine underutilized. Recommended: Link more downstream models.
                 </p>
               </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="usage" className="p-20 text-center animate-in fade-in slide-in-from-bottom-4">
           <div className="max-w-md mx-auto space-y-6">
              <div className="h-20 w-20 bg-slate-100 rounded-[2rem] flex items-center justify-center mx-auto">
                <BarChart3 className="h-10 w-10 text-slate-300" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Advanced Analytics</h3>
              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                Connect your sync pipelines to start visualizing throughput, error rates, and data volume trends for this discovery node.
              </p>
           </div>
        </TabsContent>

        <TabsContent value="logs" className="p-20 text-center animate-in fade-in slide-in-from-bottom-4">
           <div className="max-w-md mx-auto space-y-6">
              <div className="h-20 w-20 bg-slate-100 rounded-[2rem] flex items-center justify-center mx-auto">
                <FileText className="h-10 w-10 text-slate-300" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Audit Manifest</h3>
              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                Detailed audit logs for configuration changes and connectivity tests will appear here. No activity recorded in the last 24 hours.
              </p>
           </div>
        </TabsContent>
        
        <TabsContent value="settings" className="p-20 text-center animate-in fade-in slide-in-from-bottom-4 text-red-500 font-black">
           DANGER ZONE - COMING SOON
        </TabsContent>
      </Tabs>
    </div>
  );
}
