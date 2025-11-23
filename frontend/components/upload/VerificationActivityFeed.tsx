"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Loader2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  stage: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "progress";
  progress?: number;
}

interface VerificationActivityFeedProps {
  logs: ActivityLogEntry[];
  className?: string;
}

const LOG_ICONS = {
  info: Info,
  success: CheckCircle,
  warning: AlertCircle,
  error: AlertCircle,
  progress: Loader2,
};

const LOG_COLORS = {
  info: "text-sonar-blue",
  success: "text-sonar-signal",
  warning: "text-amber-500",
  error: "text-sonar-coral",
  progress: "text-sonar-highlight",
};

const LOG_BG_COLORS = {
  info: "bg-sonar-blue/10",
  success: "bg-sonar-signal/10",
  warning: "bg-amber-500/10",
  error: "bg-sonar-coral/10",
  progress: "bg-sonar-highlight/5",
};

export function VerificationActivityFeed({
  logs,
  className,
}: VerificationActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest entry
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  };

  return (
    <div
      className={cn(
        "glass-panel rounded-sonar p-4 max-h-96 overflow-y-auto",
        "border border-sonar-blue/20",
        "font-mono text-xs",
        className
      )}
      ref={scrollRef}
    >
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-sonar-blue/20">
        <h3 className="font-semibold text-sonar-highlight-bright">
          Verification Activity Log
        </h3>
        <span className="text-sonar-highlight/50">{logs.length} events</span>
      </div>

      <AnimatePresence initial={false}>
        {logs.map((log, index) => {
          const Icon = LOG_ICONS[log.type];
          const isLatest = index === logs.length - 1;

          return (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex items-start space-x-2 py-2 px-3 rounded-md mb-1",
                LOG_BG_COLORS[log.type],
                isLatest && "ring-1 ring-sonar-signal/30"
              )}
            >
              <Icon
                className={cn(
                  "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
                  LOG_COLORS[log.type],
                  log.type === "progress" && "animate-spin"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline space-x-2">
                  <span className="text-sonar-highlight/40 text-[10px] flex-shrink-0">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className="text-sonar-signal/70 font-semibold text-[10px] uppercase tracking-wider flex-shrink-0">
                    {log.stage}
                  </span>
                </div>
                <p className={cn("mt-0.5 leading-relaxed", LOG_COLORS[log.type])}>
                  {log.message}
                  {log.progress !== undefined && (
                    <span className="ml-2 text-sonar-signal font-bold">
                      {Math.round(log.progress * 100)}%
                    </span>
                  )}
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {logs.length === 0 && (
        <div className="text-center py-8 text-sonar-highlight/40">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
          <p>Waiting for verification to start...</p>
        </div>
      )}
    </div>
  );
}
