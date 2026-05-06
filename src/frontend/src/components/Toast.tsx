import { useToast } from "@/context/ToastContext";
import type { ToastType } from "@/types";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

const ICON: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-primary" />,
  error: <AlertCircle className="w-5 h-5 text-destructive" />,
  warning: <AlertTriangle className="w-5 h-5 text-accent" />,
  info: <Info className="w-5 h-5 text-muted-foreground" />,
};

const BAR_CLASS: Record<ToastType, string> = {
  success: "bg-primary",
  error: "bg-destructive",
  warning: "bg-accent",
  info: "bg-muted-foreground",
};

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[90vw]"
      data-ocid="toast"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="relative bg-card border border-border rounded-lg shadow-lg overflow-hidden"
          >
            {/* Accent bar */}
            <div
              className={`absolute left-0 top-0 bottom-0 w-1 ${BAR_CLASS[toast.type]}`}
            />
            <div className="flex items-start gap-3 px-4 py-3 pl-5">
              <span className="mt-0.5 flex-shrink-0">{ICON[toast.type]}</span>
              <p className="flex-1 text-sm text-foreground leading-snug min-w-0 break-words">
                {toast.message}
              </p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
