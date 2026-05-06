import { RegistrationType } from "@/backend";
import type { Registration, Shareholder } from "@/backend";
import { Layout } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  CheckInMethod,
  ShareholderStatus,
  UserRole,
  useCheckInShareholder,
  useRegisterShareholder,
  useRegistrationByShareholder,
  useSearchShareholders,
} from "@/hooks/use-backend";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  QrCode,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PAGE_SIZE = BigInt(50);

const STATUS_FILTER_OPTIONS: {
  label: string;
  value: ShareholderStatus | null;
}[] = [
  { label: "All", value: null },
  { label: "Not Registered", value: ShareholderStatus.NotRegistered },
  { label: "In-Person", value: ShareholderStatus.RegisteredInPerson },
  { label: "Proxy", value: ShareholderStatus.RegisteredProxy },
  { label: "Checked In", value: ShareholderStatus.CheckedIn },
];

function maskId(id: string): string {
  if (id.length <= 4) return "•••••••";
  return "•".repeat(id.length - 4) + id.slice(-4);
}

function formatShares(n: bigint): string {
  return Number(n).toLocaleString();
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function exportCsv(items: Shareholder[], showId: boolean) {
  const headers = [
    "Shareholder #",
    "Full Name",
    "ID Number",
    "Shareholding",
    "Status",
  ];
  const rows = items.map((s) => [
    s.shareholderNumber,
    s.fullName,
    showId ? s.idNumber : maskId(s.idNumber),
    s.shareholding.toString(),
    s.status,
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${c}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "shareholders.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// --- QR Code Modal ---
function QrModal({
  shareholder,
  registration,
  onClose,
}: {
  shareholder: Shareholder;
  registration: Registration | null | undefined;
  onClose: () => void;
}) {
  const code = registration?.verificationCode ?? shareholder.shareholderNumber;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(code)}`;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      data-ocid="qr.dialog"
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-xs w-full mx-4 flex flex-col items-center gap-4">
        <div className="flex items-center justify-between w-full">
          <h3 className="font-display font-semibold text-foreground">
            QR Code
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-smooth"
            aria-label="Close QR modal"
            data-ocid="qr.close_button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <img
          src={qrUrl}
          alt={`QR code for ${shareholder.fullName}`}
          className="w-48 h-48 rounded-lg border border-border"
        />
        <div className="text-center">
          <p className="font-medium text-foreground">{shareholder.fullName}</p>
          <p className="text-sm text-muted-foreground">
            #{shareholder.shareholderNumber}
          </p>
          {registration && (
            <Badge variant="secondary" className="mt-2 font-mono text-xs">
              {registration.verificationCode}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Row Actions Panel ---
function RowActionsPanel({
  shareholder,
  canAct,
  isSuperAdmin,
  onClose,
  onFlash,
}: {
  shareholder: Shareholder;
  canAct: boolean;
  isSuperAdmin: boolean;
  onClose: () => void;
  onFlash: (id: string) => void;
}) {
  const { data: registration, isLoading } = useRegistrationByShareholder(
    shareholder.id,
  );
  const checkIn = useCheckInShareholder();
  const register = useRegisterShareholder();
  const [showQr, setShowQr] = useState(false);
  const [unmasked, setUnmasked] = useState(false);

  const isRegistered =
    shareholder.status === ShareholderStatus.RegisteredInPerson ||
    shareholder.status === ShareholderStatus.RegisteredProxy ||
    shareholder.status === ShareholderStatus.CheckedIn;

  const isCheckedIn = shareholder.status === ShareholderStatus.CheckedIn;

  async function handleQuickRegister() {
    await register.mutateAsync({
      shareholderId: shareholder.id,
      regType: RegistrationType.InPerson,
      proxyData: null,
    });
    onFlash(shareholder.id);
  }

  async function handleCheckIn() {
    if (!registration) return;
    await checkIn.mutateAsync({
      shareholderId: shareholder.id,
      registrationId: registration.id,
      method: CheckInMethod.Manual,
    });
    onFlash(shareholder.id);
  }

  return (
    <>
      {showQr && (
        <QrModal
          shareholder={shareholder}
          registration={registration}
          onClose={() => setShowQr(false)}
        />
      )}
      <div
        className="fixed inset-0 z-30 lg:hidden"
        role="button"
        tabIndex={-1}
        aria-label="Close panel"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      />
      <div
        className={cn(
          "fixed right-0 top-0 bottom-0 z-40 w-80 max-w-[85vw] bg-card border-l border-border shadow-2xl flex flex-col",
          "animate-in slide-in-from-right-4 duration-300",
        )}
        data-ocid="shareholders.action_panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <p className="font-display font-semibold text-foreground truncate max-w-[200px]">
              {shareholder.fullName}
            </p>
            <p className="text-sm text-muted-foreground">
              #{shareholder.shareholderNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-smooth min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close panel"
            data-ocid="shareholders.action_panel.close_button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Info */}
          <div className="bg-muted/40 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                ID Number
              </span>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setUnmasked((v) => !v)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  aria-label={unmasked ? "Mask ID" : "Unmask ID"}
                >
                  {unmasked ? (
                    <>
                      <EyeOff className="w-3 h-3" /> Hide
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3" /> Reveal
                    </>
                  )}
                </button>
              )}
            </div>
            <p className="font-mono text-sm text-foreground">
              {unmasked ? shareholder.idNumber : maskId(shareholder.idNumber)}
            </p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Shareholding
              </span>
              <span className="text-sm font-medium text-foreground">
                {formatShares(shareholder.shareholding)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Status
              </span>
              <StatusBadge status={shareholder.status} size="sm" />
            </div>
          </div>

          {/* Registration info */}
          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : registration ? (
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex flex-col gap-2">
              <p className="text-xs font-medium text-primary uppercase tracking-wider">
                Registration
              </p>
              <p className="text-xs text-muted-foreground">
                Type: {registration.registrationType}
              </p>
              <p className="text-xs text-muted-foreground">
                By: {registration.registeredBy}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">Code:</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {registration.verificationCode}
                </Badge>
              </div>
            </div>
          ) : null}

          {/* Actions */}
          {canAct && (
            <div className="flex flex-col gap-2">
              {!isRegistered && (
                <Button
                  className="w-full min-h-[44px] gap-2"
                  onClick={handleQuickRegister}
                  disabled={register.isPending}
                  data-ocid="shareholders.action_panel.register_button"
                >
                  <UserCheck className="w-4 h-4" />
                  {register.isPending ? "Registering..." : "Register In-Person"}
                </Button>
              )}
              {isRegistered && !isCheckedIn && (
                <Button
                  className="w-full min-h-[44px] gap-2"
                  onClick={handleCheckIn}
                  disabled={checkIn.isPending || !registration}
                  data-ocid="shareholders.action_panel.checkin_button"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {checkIn.isPending ? "Checking in..." : "Check In"}
                </Button>
              )}
              {isRegistered && (
                <Button
                  variant="outline"
                  className="w-full min-h-[44px] gap-2"
                  onClick={() => setShowQr(true)}
                  data-ocid="shareholders.action_panel.qr_button"
                >
                  <QrCode className="w-4 h-4" />
                  View QR Code
                </Button>
              )}
              {isCheckedIn && (
                <div className="flex items-center justify-center gap-2 py-3 text-primary">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-medium">Checked In</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// --- Table Row skeleton ---
function TableRowSkeleton() {
  return (
    <tr className="border-b border-border/50">
      {([160, 200, 120, 100, 100, 80] as const).map((w) => (
        <td key={w} className="px-4 py-3">
          <Skeleton className="h-4" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

// --- Mobile Card ---
function ShareholderCard({
  shareholder,
  canAct,
  isSuperAdmin,
  isFlashing,
  onClick,
}: {
  shareholder: Shareholder;
  canAct: boolean;
  isSuperAdmin: boolean;
  isFlashing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "bg-card border border-border rounded-xl p-4 flex flex-col gap-3 transition-smooth cursor-pointer w-full text-left",
        "hover:border-primary/40 hover:bg-card/80 active:scale-[0.99]",
        isFlashing && "animate-flash-green",
      )}
      onClick={onClick}
      data-ocid={`shareholders.card.${shareholder.shareholderNumber}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">
            {shareholder.fullName}
          </p>
          <p className="text-xs text-muted-foreground">
            #{shareholder.shareholderNumber}
          </p>
        </div>
        <StatusBadge status={shareholder.status} size="sm" />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          ID:{" "}
          {isSuperAdmin ? shareholder.idNumber : maskId(shareholder.idNumber)}
        </span>
        <span className="font-medium text-foreground">
          {formatShares(shareholder.shareholding)} shares
        </span>
      </div>
      {canAct && (
        <div className="pt-1 border-t border-border/50">
          <p className="text-xs text-primary">Tap to manage →</p>
        </div>
      )}
    </button>
  );
}

// --- Main Page ---
export default function ShareholdersPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === UserRole.SuperAdmin;
  const canAct =
    user?.role === UserRole.SuperAdmin ||
    user?.role === UserRole.RegistrationOfficer;

  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 200);
  const [statusFilter, setStatusFilter] = useState<ShareholderStatus | null>(
    null,
  );
  const [page, setPage] = useState(BigInt(0));
  const [selectedShareholder, setSelectedShareholder] =
    useState<Shareholder | null>(null);
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());
  const [unmaskedIds, setUnmaskedIds] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const {
    data: result,
    isLoading,
    refetch,
  } = useSearchShareholders(debouncedSearch, statusFilter, page, PAGE_SIZE);

  const shareholders = result?.items ?? [];
  const total = Number(result?.total ?? BigInt(0));
  const totalPages = Math.max(1, Math.ceil(total / Number(PAGE_SIZE)));
  const currentPage = Number(page);

  // 5s polling
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
      setLastUpdated(new Date());
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Reset page when search or filter changes — biome linter false-positive on these deps
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetting page is intentionally triggered by these
  useEffect(() => {
    setPage(BigInt(0));
  }, [debouncedSearch, statusFilter]);

  // Seconds-ago counter
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  const handleFlash = useCallback((id: string) => {
    setFlashingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setFlashingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  }, []);

  const handleManualRefresh = useCallback(() => {
    refetch();
    setLastUpdated(new Date());
    setSecondsAgo(0);
  }, [refetch]);

  const stats = useMemo(() => {
    const all = shareholders;
    return {
      total,
      registered: all.filter(
        (s) =>
          s.status === ShareholderStatus.RegisteredInPerson ||
          s.status === ShareholderStatus.RegisteredProxy ||
          s.status === ShareholderStatus.CheckedIn,
      ).length,
      checkedIn: all.filter((s) => s.status === ShareholderStatus.CheckedIn)
        .length,
      pending: all.filter((s) => s.status === ShareholderStatus.NotRegistered)
        .length,
    };
  }, [shareholders, total]);

  const toggleUnmask = useCallback(
    (id: string) => {
      if (!isSuperAdmin) return;
      setUnmaskedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [isSuperAdmin],
  );

  function handleExportCsv() {
    exportCsv(shareholders, isSuperAdmin);
  }

  // suppress unused warning — searchRef kept for potential imperative focus
  void searchRef;

  return (
    <Layout>
      <div className="flex flex-col gap-4" data-ocid="shareholders.page">
        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              { label: "Total", value: total, color: "text-foreground" },
              {
                label: "Registered",
                value: stats.registered,
                color: "text-primary",
              },
              {
                label: "Checked In",
                value: stats.checkedIn,
                color: "text-primary",
              },
              {
                label: "Pending",
                value: stats.pending,
                color: "text-muted-foreground",
              },
            ] as const
          ).map((stat) => (
            <div
              key={stat.label}
              className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col gap-1"
              data-ocid={`shareholders.stat.${stat.label.toLowerCase().replace(" ", "-")}`}
            >
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                {stat.label}
              </span>
              <span
                className={cn("text-2xl font-display font-bold", stat.color)}
              >
                {stat.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="text"
              placeholder="Search by name, shareholder #, or ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 min-h-[44px]"
              data-ocid="shareholders.search_input"
            />
            {searchInput && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                onClick={() => setSearchInput("")}
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  "flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg border transition-smooth min-h-[44px] whitespace-nowrap",
                  statusFilter === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                )}
                data-ocid={`shareholders.filter.${opt.label.toLowerCase().replace(/ /g, "-")}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              className="min-h-[44px] gap-2"
              data-ocid="shareholders.refresh_button"
              aria-label="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="min-h-[44px] gap-2"
              disabled={shareholders.length === 0}
              data-ocid="shareholders.export_button"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {total.toLocaleString()} shareholder{total !== 1 ? "s" : ""}
            {debouncedSearch || statusFilter ? " (filtered)" : ""}
          </span>
          <span>
            Last updated: {secondsAgo === 0 ? "just now" : `${secondsAgo}s ago`}
          </span>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Shareholder #
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Full Name
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    ID Number
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Shareholding
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  {canAct && (
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton, no stable key
                  [...Array(10)].map((_, i) => <TableRowSkeleton key={i} />)
                ) : shareholders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canAct ? 6 : 5}
                      className="px-4 py-16 text-center"
                      data-ocid="shareholders.empty_state"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center">
                          <Users className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <p className="font-medium text-foreground">
                          No shareholders found
                        </p>
                        <p className="text-muted-foreground text-sm max-w-xs">
                          {debouncedSearch || statusFilter
                            ? "No results match your search or filter."
                            : "Import your shareholder list to get started."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  shareholders.map((s, idx) => (
                    <tr
                      key={s.id}
                      className={cn(
                        "border-b border-border/50 cursor-pointer transition-smooth hover:bg-muted/30",
                        flashingIds.has(s.id) && "animate-flash-green",
                        selectedShareholder?.id === s.id && "bg-primary/10",
                      )}
                      onClick={() =>
                        setSelectedShareholder(
                          selectedShareholder?.id === s.id ? null : s,
                        )
                      }
                      onKeyDown={(e) =>
                        (e.key === "Enter" || e.key === " ") &&
                        setSelectedShareholder(
                          selectedShareholder?.id === s.id ? null : s,
                        )
                      }
                      tabIndex={0}
                      data-ocid={`shareholders.item.${idx + 1}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {s.shareholderNumber}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">
                        {s.fullName}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-foreground">
                            {unmaskedIds.has(s.id)
                              ? s.idNumber
                              : maskId(s.idNumber)}
                          </span>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleUnmask(s.id);
                              }}
                              className="p-1 rounded hover:bg-muted transition-smooth"
                              aria-label={
                                unmaskedIds.has(s.id) ? "Mask ID" : "Unmask ID"
                              }
                              data-ocid={`shareholders.unmask_button.${idx + 1}`}
                            >
                              {unmaskedIds.has(s.id) ? (
                                <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                              ) : (
                                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-foreground whitespace-nowrap">
                        {formatShares(s.shareholding)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} size="sm" />
                      </td>
                      {canAct && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedShareholder(
                                  selectedShareholder?.id === s.id ? null : s,
                                )
                              }
                              className="p-2 rounded-lg hover:bg-muted transition-smooth min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
                              aria-label="Manage shareholder"
                              data-ocid={`shareholders.manage_button.${idx + 1}`}
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden flex flex-col gap-3">
          {isLoading ? (
            [...Array(5)].map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton loader
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))
          ) : shareholders.length === 0 ? (
            <div
              className="bg-card border border-border rounded-xl px-6 py-16 flex flex-col items-center gap-3 text-center"
              data-ocid="shareholders.empty_state"
            >
              <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground">
                No shareholders found
              </p>
              <p className="text-sm text-muted-foreground">
                {debouncedSearch || statusFilter
                  ? "No results match your search."
                  : "Import your shareholder list to get started."}
              </p>
            </div>
          ) : (
            shareholders.map((s) => (
              <ShareholderCard
                key={s.id}
                shareholder={s}
                canAct={canAct}
                isSuperAdmin={isSuperAdmin}
                isFlashing={flashingIds.has(s.id)}
                onClick={() =>
                  setSelectedShareholder(
                    selectedShareholder?.id === s.id ? null : s,
                  )
                }
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              Page {currentPage + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(BigInt(Math.max(0, currentPage - 1)))}
                disabled={currentPage === 0}
                className="min-h-[44px]"
                data-ocid="shareholders.pagination_prev"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPage(BigInt(Math.min(totalPages - 1, currentPage + 1)))
                }
                disabled={currentPage >= totalPages - 1}
                className="min-h-[44px]"
                data-ocid="shareholders.pagination_next"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-in Action Panel */}
      {selectedShareholder && (
        <RowActionsPanel
          shareholder={selectedShareholder}
          canAct={canAct}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setSelectedShareholder(null)}
          onFlash={handleFlash}
        />
      )}
    </Layout>
  );
}
