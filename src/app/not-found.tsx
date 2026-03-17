"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { FileQuestion, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-indigo-100 rounded-full blur-3xl opacity-50 scale-150 animate-pulse"></div>
        <div className="relative bg-white p-8 rounded-3xl shadow-2xl shadow-indigo-100/50 ring-1 ring-slate-100">
          <FileQuestion className="h-20 w-20 text-indigo-600 mx-auto" strokeWidth={1.5} />
        </div>
      </div>

      <h1 className="text-6xl font-black text-slate-900 tracking-tighter mb-4">404</h1>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Oops! Page not found</h2>
      
      <p className="text-slate-500 max-w-md mx-auto mb-10 leading-relaxed font-medium">
        The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <Button 
          variant="outline" 
          onClick={() => router.back()}
          className="w-full sm:w-auto h-12 px-8 rounded-2xl border-slate-200 hover:bg-slate-50 gap-2 font-bold"
        >
          <ArrowLeft className="h-4 w-4" /> Go Back
        </Button>
        <Button 
          onClick={() => router.push("/")}
          className="w-full sm:w-auto h-12 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 gap-2 font-bold"
        >
          <Home className="h-4 w-4" /> Return Home
        </Button>
      </div>
      
      <div className="mt-20 pt-8 border-t border-slate-100 w-full max-w-lg">
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">AutoSync Engine v1.0</p>
      </div>
    </div>
  );
}
