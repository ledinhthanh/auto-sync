"use client";

import * as React from "react";
import { 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  X 
} from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "success" | "error" | "warning" | "info";

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  message: string;
  onClose?: () => void;
  className?: string;
}

const variantStyles: Record<AlertVariant, string> = {
  success: "bg-emerald-50 border-emerald-100 text-emerald-800 shadow-emerald-100/20",
  error: "bg-red-50 border-red-100 text-red-800 shadow-red-100/20",
  warning: "bg-amber-50 border-amber-100 text-amber-800 shadow-amber-100/20",
  info: "bg-indigo-50 border-indigo-100 text-indigo-800 shadow-indigo-100/20",
};

const iconColors: Record<AlertVariant, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-indigo-500",
};

const Icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export function Alert({ 
  variant = "info", 
  title, 
  message, 
  onClose, 
  className 
}: AlertProps) {
  const Icon = Icons[variant];

  return (
    <div className={cn(
      "relative flex w-full items-start gap-3 rounded-2xl border p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300",
      variantStyles[variant],
      className
    )}>
      <div className={cn("mt-0.5 p-1 rounded-full bg-white/50", iconColors[variant])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-bold tracking-tight mb-0.5">{title}</p>}
        <p className="text-xs font-semibold opacity-90 leading-relaxed break-words">{message}</p>
      </div>
      {onClose && (
        <button 
          onClick={onClose}
          className="shrink-0 p-1 hover:bg-black/5 rounded-full transition-colors"
        >
          <X className="h-4 w-4 opacity-50" />
        </button>
      )}
    </div>
  );
}

export function StatusBanner({ 
  variant = "info", 
  message, 
  className 
}: { 
  variant?: AlertVariant; 
  message: string; 
  className?: string 
}) {
  const Icon = Icons[variant];
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
      variantStyles[variant],
      className
    )}>
      <Icon className="h-3 w-3" />
      {message}
    </div>
  );
}
