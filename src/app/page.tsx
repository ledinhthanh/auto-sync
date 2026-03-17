import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, Database, PlayCircle, XCircle } from "lucide-react";
import prisma from "@/lib/db";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { SyncHealthChart } from "@/components/dashboard/sync-health-chart";

export const revalidate = 0; // Disable static caching for dashboard

export default async function DashboardPage() {
  // Get first workspace (simulating current session)
  const workspace = await prisma.workspace.findFirst();

  if (!workspace) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">Welcome to DataSync</h2>
        <p className="text-slate-500 mb-6">You don&apos;t have any workspaces yet.</p>
        <Link href="/models">
            <Button>Configure Your First Model</Button>
        </Link>
      </div>
    );
  }

  // Fetch Sync Metrics
  const totalSyncs = await prisma.sync.count({ where: { workspaceId: workspace.id } });
  const healthySyncs = await prisma.sync.count({ 
    where: { 
      workspaceId: workspace.id,
      OR: [
        { lastRunStatus: 'SUCCESS' },
        { status: 'ACTIVE', lastRunStatus: null }
      ]
    } 
  });
  
  const failedSyncs = await prisma.sync.count({ 
    where: { 
      workspaceId: workspace.id,
      OR: [
        { lastRunStatus: 'FAILED' },
        { status: 'ERROR' }
      ]
    } 
  });

  const runningSyncsCount = await prisma.syncRun.count({
    where: {
      sync: { workspaceId: workspace.id },
      status: { in: ['PENDING', 'RUNNING'] }
    }
  });

  const pausedDraftSyncs = await prisma.sync.count({
    where: {
      workspaceId: workspace.id,
      status: { in: ['PAUSED', 'DRAFT'] }
    }
  });

  // Needs Attention Jobs
  const needsAttention = await prisma.sync.findMany({
    where: {
      workspaceId: workspace.id,
      OR: [
        { status: 'ERROR' },
        { lastRunStatus: 'FAILED' }
      ]
    },
    take: 5,
    orderBy: { lastRunAt: 'desc' },
    include: {
        runs: {
            where: { status: 'FAILED' },
            orderBy: { startedAt: 'desc' },
            take: 1
        }
    }
  });

  // Recent Activity Timeline
  const recentRuns = await prisma.syncRun.findMany({
    where: { sync: { workspaceId: workspace.id } },
    take: 10,
    orderBy: { startedAt: 'desc' },
    include: { sync: true }
  });

  // Health Chart Data - Aggregate last 7 days from SyncRun
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentRunsForChart = await prisma.syncRun.findMany({
      where: {
          sync: { workspaceId: workspace.id },
          startedAt: { gte: sevenDaysAgo },
          status: { in: ['SUCCESS', 'FAILED'] }
      },
      select: { startedAt: true, status: true }
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h2>
          {workspace && <p className="text-sm text-slate-500 mt-1">Overview of your DataSync platform - Workspace: {workspace.name}</p>}
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/jobs">
            <Button variant="outline">View All Jobs</Button>
          </Link>
          <Link href="/jobs/new">
            <Button>Create Job</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Jobs</CardTitle>
            <Database className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{totalSyncs}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-emerald-100 bg-emerald-50/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800">Healthy</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{healthySyncs}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-red-100 bg-red-50/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-800">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{failedSyncs}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-blue-100 bg-blue-50/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-800">Running Now</CardTitle>
            <PlayCircle className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{runningSyncsCount}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Draft / Paused</CardTitle>
            <Clock className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-700">{pausedDraftSyncs}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>Sync Health Trend</CardTitle>
            <CardDescription>Daily successful vs failed sync runs over last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex items-center justify-center border-t border-slate-100 pt-6">
            <SyncHealthChart rawData={recentRunsForChart} />
          </CardContent>
        </Card>

        <Card className="col-span-3 shadow-sm border-red-100">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
              <span>Needs Attention</span>
            </CardTitle>
            <CardDescription>Failed jobs requiring your action</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {needsAttention.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center italic">No jobs currently need attention.</p>
              ) : needsAttention.map((job) => (
                <div key={job.id} className="flex flex-col space-y-2 pb-4 border-b last:border-0 last:pb-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{job.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5.5">Target: {job.destSchema}.{job.destName}</p>
                    </div>
                    <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 font-normal shadow-none">
                      Failed
                    </Badge>
                  </div>
                  {job.runs.length > 0 && job.runs[0].errorMessage && (
                    <div className="bg-slate-100 rounded px-2.5 py-1.5 border border-slate-200 font-mono text-[11px] text-red-600 truncate">
                        {job.runs[0].errorMessage}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] font-medium text-slate-400">
                        {job.lastRunAt ? formatDistanceToNow(new Date(job.lastRunAt), { addSuffix: true }) : 'Unknown'}
                    </span>
                    <Link href={`/jobs/${job.id}`}>
                        <Button variant="link" size="sm" className="h-auto p-0 text-indigo-600 text-[11px]">View Job</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Recent Activity Timeline</CardTitle>
            <CardDescription>Latest events and job executions in your workspace</CardDescription>
          </CardHeader>
          <CardContent>
            {recentRuns.length === 0 ? (
                <div className="text-sm text-slate-500 py-6 text-center italic border-t border-dashed">
                Activity timeline will populate as jobs run.
                </div>
            ) : (
                <div className="relative border-l border-slate-200 ml-3 md:ml-4 space-y-6 py-2">
                    {recentRuns.map((run) => (
                        <div key={run.id} className="relative pl-6">
                            <span className={`absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-white ring-2 ring-white
                                ${run.status === 'SUCCESS' ? 'bg-emerald-500' : 
                                    run.status === 'FAILED' ? 'bg-red-500' :
                                    run.status === 'RUNNING' ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'
                                }`} 
                            />
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-1">
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-900">{run.sync.name}</h4>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Triggered {run.triggeredBy === 'SCHEDULER' ? 'by Schedule' : 'Manually'}
                                    </p>
                                </div>
                                <div className="text-xs font-medium text-slate-400 mt-1 sm:mt-0 whitespace-nowrap">
                                    {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
                                </div>
                            </div>
                            <div className="mt-2 text-sm text-slate-700">
                                {run.status === 'SUCCESS' && (
                                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-xs font-medium">
                                        Completed: {run.rowsProcessed} rows processed in {Math.round(((run.finishedAt?.getTime() || 0) - run.startedAt.getTime()) / 1000)}s
                                    </span>
                                )}
                                {run.status === 'FAILED' && run.errorMessage && (
                                    <span className="text-red-600 block bg-red-50/50 p-2 rounded-md border border-red-100 font-mono text-xs">
                                        {run.errorMessage}
                                    </span>
                                )}
                                {['PENDING', 'RUNNING'].includes(run.status) && (
                                    <span className="text-blue-700 text-xs font-medium italic flex items-center">
                                        <PlayCircle className="h-3 w-3 mr-1 animate-pulse" /> Running now...
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
