import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type SyncState = "synced" | "pending" | "offline";

interface PendingAction {
  id: string;
  type: string;
  payload: unknown;
  queuedAt: number;
}

const PENDING_KEY = "agm-pending-actions";

function getPendingActions(): PendingAction[] {
  try {
    return JSON.parse(
      localStorage.getItem(PENDING_KEY) ?? "[]",
    ) as PendingAction[];
  } catch {
    return [];
  }
}

export function useSyncStatus() {
  const [pending, setPending] = useState<PendingAction[]>([]);

  useEffect(() => {
    setPending(getPendingActions());
    const handler = () => setPending(getPendingActions());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return { pendingCount: pending.length };
}

export function SyncStatus() {
  const [state, setState] = useState<SyncState>("synced");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const qc = useQueryClient();

  // Detect online/offline
  useEffect(() => {
    const onOnline = () => {
      setState((s) =>
        s === "offline" ? (pendingCount > 0 ? "pending" : "synced") : s,
      );
    };
    const onOffline = () => setState("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (!navigator.onLine) setState("offline");
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [pendingCount]);

  // Listen for SW sync requests
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const handler = (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type === "SW_SYNC_REQUESTED") {
        handleRetry();
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handler);
  });

  // Load pending actions from localStorage
  useEffect(() => {
    const load = () => {
      const count = getPendingActions().length;
      setPendingCount(count);
      if (count > 0 && navigator.onLine) setState("pending");
      else if (count === 0 && navigator.onLine) setState("synced");
    };
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, []);

  const handleRetry = useCallback(async () => {
    if (!navigator.onLine || isRetrying) return;
    setIsRetrying(true);
    try {
      // Re-fetch all queries to sync state
      await qc.invalidateQueries();
      setLastSync(new Date());
      setState("synced");
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, qc]);

  if (state === "synced" && pendingCount === 0) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-primary px-2 py-1 rounded-md bg-primary/10 border border-primary/20"
        data-ocid="sync.success_state"
      >
        <CheckCircle2 className="w-3 h-3" />
        <span className="hidden sm:inline">
          Synced
          {lastSync
            ? ` ${lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </span>
      </div>
    );
  }

  if (state === "offline") {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-destructive px-2 py-1 rounded-md bg-destructive/10 border border-destructive/20"
        data-ocid="sync.error_state"
      >
        <WifiOff className="w-3 h-3" />
        <span className="hidden sm:inline">Offline — queuing changes</span>
      </div>
    );
  }

  // pending state
  return (
    <div className="flex items-center gap-2" data-ocid="sync.pending_state">
      <Badge
        variant="secondary"
        className="text-xs gap-1 border border-accent/30 bg-accent/10 text-accent-foreground"
      >
        <span>{pendingCount} pending</span>
      </Badge>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="w-7 h-7 text-muted-foreground hover:text-primary"
        onClick={handleRetry}
        disabled={isRetrying || !navigator.onLine}
        aria-label="Retry sync"
        data-ocid="sync.retry_button"
      >
        <RefreshCw className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
