import { Layout } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/hooks/use-auth";
import {
  useRegistrationByShareholder,
  useSearchShareholders,
} from "@/hooks/use-backend";
import { cn } from "@/lib/utils";
import { RegistrationType, ShareholderStatus, UserRole } from "@/types";
import type { Registration, Shareholder } from "@/types";
import { Search, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CancelRegistrationModal } from "./registration/CancelRegistrationModal";
import { ExistingRegistration } from "./registration/ExistingRegistration";
import { InPersonForm } from "./registration/InPersonForm";
import { ProxyForm } from "./registration/ProxyForm";
import { SuccessCard } from "./registration/SuccessCard";

function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function ShareholderRow({
  shareholder,
  selected,
  onSelect,
  index,
}: {
  shareholder: Shareholder;
  selected: boolean;
  onSelect: () => void;
  index: number;
}) {
  return (
    <button
      type="button"
      data-ocid={`registration.shareholder_row.${index}`}
      onClick={onSelect}
      className={cn(
        "w-full px-4 py-3 cursor-pointer transition-smooth border-b border-border last:border-b-0 flex items-start gap-3 text-left",
        selected
          ? "bg-primary/20 border-l-2 border-l-primary"
          : "hover:bg-muted/60",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground truncate">
          {shareholder.fullName}
        </div>
        <div className="text-sm text-muted-foreground">
          # {shareholder.shareholderNumber}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {Number(shareholder.shareholding).toLocaleString()} shares
        </div>
      </div>
      <StatusBadge status={shareholder.status} size="sm" />
    </button>
  );
}

export default function RegistrationPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Shareholder | null>(null);
  const [activeTab, setActiveTab] = useState<RegistrationType>(
    RegistrationType.InPerson,
  );
  const [successReg, setSuccessReg] = useState<Registration | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query);

  const canEdit =
    user?.role === UserRole.SuperAdmin ||
    user?.role === UserRole.RegistrationOfficer;

  const { data: searchResult, isLoading: searchLoading } =
    useSearchShareholders(debouncedQuery, null, BigInt(0), BigInt(20));

  const { data: existingReg, refetch: refetchReg } =
    useRegistrationByShareholder(selected?.id ?? "");

  const shareholders = (searchResult?.items ?? []).filter(
    (s) =>
      s.status === ShareholderStatus.NotRegistered ||
      s.status === ShareholderStatus.RegisteredInPerson ||
      s.status === ShareholderStatus.RegisteredProxy,
  );

  const handleSelectShareholder = useCallback((s: Shareholder) => {
    setSelected(s);
    setSuccessReg(null);
    setActiveTab(RegistrationType.InPerson);
  }, []);

  const handleRegistrationSuccess = useCallback(
    (reg: Registration) => {
      setSuccessReg(reg);
      refetchReg();
    },
    [refetchReg],
  );

  const handleRegisterAnother = useCallback(() => {
    setSelected(null);
    setSuccessReg(null);
    setQuery("");
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  return (
    <Layout>
      <div
        data-ocid="registration.page"
        className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] overflow-hidden"
      >
        {/* LEFT PANEL — Search */}
        <div className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col border-r border-border bg-card">
          {/* Search header */}
          <div className="p-4 border-b border-border">
            <h2 className="font-display font-semibold text-lg text-foreground mb-3">
              Find Shareholder
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchInputRef}
                data-ocid="registration.search_input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, shareholder #, or ID…"
                className="pl-9 pr-9 h-11 text-base bg-muted/40 border-input focus:bg-background"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {searchResult && (
              <p className="text-xs text-muted-foreground mt-2">
                {Number(searchResult.total)} result
                {Number(searchResult.total) !== 1 ? "s" : ""} found
              </p>
            )}
          </div>

          {/* Results list */}
          <div
            className="flex-1 overflow-y-auto"
            data-ocid="registration.shareholder_list"
          >
            {searchLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-16 rounded-lg bg-muted/50 animate-pulse"
                  />
                ))}
              </div>
            ) : shareholders.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center h-48 text-center px-6"
                data-ocid="registration.empty_state"
              >
                <Users className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {query
                    ? "No shareholders match your search"
                    : "Type to search shareholders"}
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {shareholders.map((s, idx) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <ShareholderRow
                      shareholder={s}
                      selected={selected?.id === s.id}
                      onSelect={() => handleSelectShareholder(s)}
                      index={idx + 1}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* RIGHT PANEL — Form */}
        <div className="flex-1 overflow-y-auto bg-background">
          <AnimatePresence mode="wait">
            {!selected ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-6"
                data-ocid="registration.right_panel.empty_state"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-primary/60" />
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                  Select a Shareholder
                </h3>
                <p className="text-muted-foreground max-w-xs">
                  Search and select a shareholder on the left to begin
                  registration.
                </p>
              </motion.div>
            ) : successReg ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="p-6 max-w-xl mx-auto"
              >
                <SuccessCard
                  registration={successReg}
                  shareholder={selected}
                  onRegisterAnother={handleRegisterAnother}
                />
              </motion.div>
            ) : existingReg ? (
              <motion.div
                key="existing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-6 max-w-xl mx-auto"
              >
                <ExistingRegistration
                  registration={existingReg}
                  shareholder={selected}
                  canEdit={canEdit}
                  onCancelClick={() => setShowCancelModal(true)}
                  onEditSuccess={(reg) => {
                    showToast("Registration updated", "success");
                    refetchReg();
                    setSuccessReg(reg);
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-6 max-w-xl mx-auto"
              >
                {/* Shareholder header */}
                <div className="mb-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-bold text-foreground">
                        {selected.fullName}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        # {selected.shareholderNumber} &bull;{" "}
                        {Number(selected.shareholding).toLocaleString()} shares
                      </p>
                    </div>
                    <StatusBadge status={selected.status} />
                  </div>
                </div>

                {/* Tab picker */}
                <div
                  className="flex rounded-lg border border-border bg-muted/40 p-1 mb-6 gap-1"
                  data-ocid="registration.type_tab"
                >
                  {[
                    { value: RegistrationType.InPerson, label: "In Person" },
                    { value: RegistrationType.Proxy, label: "Proxy" },
                  ].map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      data-ocid={`registration.tab.${tab.value.toLowerCase()}`}
                      onClick={() => setActiveTab(tab.value)}
                      className={cn(
                        "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-smooth min-h-[44px]",
                        activeTab === tab.value
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted",
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Form content */}
                <AnimatePresence mode="wait">
                  {activeTab === RegistrationType.InPerson ? (
                    <motion.div
                      key="inperson"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                    >
                      <InPersonForm
                        shareholder={selected}
                        onSuccess={handleRegistrationSuccess}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="proxy"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                    >
                      <ProxyForm
                        shareholder={selected}
                        onSuccess={handleRegistrationSuccess}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Cancel confirmation modal */}
      {showCancelModal && selected && existingReg && (
        <CancelRegistrationModal
          registration={existingReg}
          shareholder={selected}
          onClose={() => setShowCancelModal(false)}
          onSuccess={() => {
            setShowCancelModal(false);
            setSelected(null);
            setSuccessReg(null);
            showToast("Registration cancelled", "success");
            refetchReg();
          }}
        />
      )}
    </Layout>
  );
}
