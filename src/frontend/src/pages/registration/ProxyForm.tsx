import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/context/ToastContext";
import { useRegisterShareholder } from "@/hooks/use-backend";
import { cn } from "@/lib/utils";
import { RegistrationType } from "@/types";
import type { Registration, Shareholder } from "@/types";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

function detectFraudFlags(file: File): string[] {
  const flags: string[] = [];
  if (file.size < 1024)
    flags.push("File too small — may not be a real document");
  if (file.size > MAX_FILE_SIZE) flags.push("File exceeds 10 MB limit");
  if (!ALLOWED_TYPES.includes(file.type))
    flags.push(`Unsupported format: ${file.type || "unknown"}`);
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (
    (file.type === "application/pdf" && ext !== "pdf") ||
    (file.type.startsWith("image/") &&
      !["jpg", "jpeg", "png", "webp"].includes(ext ?? ""))
  ) {
    flags.push("File extension does not match content type");
  }
  return flags;
}

interface ProxyFormProps {
  shareholder: Shareholder;
  onSuccess: (reg: Registration) => void;
}

interface FormErrors {
  proxyName?: string;
  proxyContact?: string;
  proofFile?: string;
}

export function ProxyForm({ shareholder, onSuccess }: ProxyFormProps) {
  const { showToast } = useToast();
  const [proxyName, setProxyName] = useState("");
  const [proxyContact, setProxyContact] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fraudFlags, setFraudFlags] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const register = useRegisterShareholder();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setProofFile(file);
    setValidated(false);
    setFraudFlags([]);
    setErrors((prev) => ({ ...prev, proofFile: undefined }));
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleRemoveFile = () => {
    setProofFile(null);
    setPreviewUrl(null);
    setFraudFlags([]);
    setValidated(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleValidate = async () => {
    if (!proofFile) {
      setErrors((prev) => ({
        ...prev,
        proofFile: "Please upload a proof document first",
      }));
      return;
    }
    setValidating(true);
    // Simulate async validation (real validation would call backend)
    await new Promise((r) => setTimeout(r, 600));
    const flags = detectFraudFlags(proofFile);
    setFraudFlags(flags);
    setValidated(true);
    setValidating(false);
    if (flags.length === 0) {
      showToast("Proxy proof validated — no issues found", "success");
    } else {
      showToast(`${flags.length} fraud flag(s) detected`, "warning");
    }
  };

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!proxyName.trim()) e.proxyName = "Proxy name is required";
    if (!proxyContact.trim())
      e.proxyContact = "Proxy contact (phone or email) is required";
    else if (
      !proxyContact.includes("@") &&
      !/^[\d+\-\s()]{6,}$/.test(proxyContact.trim())
    ) {
      e.proxyContact = "Enter a valid email or phone number";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setServerError(null);

    try {
      const result = await register.mutateAsync({
        shareholderId: shareholder.id,
        regType: RegistrationType.Proxy,
        proxyData: {
          proxyName: proxyName.trim(),
          proxyContact: proxyContact.trim(),
          proxyProofKey: proofFile
            ? `proof_${shareholder.id}_${Date.now()}`
            : undefined,
        },
      });
      showToast("Proxy registered successfully!", "success");
      onSuccess(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("REGISTRATION_IN_PROGRESS")) {
        setServerError(
          "Another officer is registering this shareholder. Please wait a moment and try again.",
        );
      } else if (msg.includes("ALREADY_REGISTERED")) {
        setServerError("This shareholder is already registered.");
      } else {
        setServerError(msg || "Registration failed. Please try again.");
      }
      showToast("Registration failed", "error");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
      data-ocid="registration.proxy_form"
    >
      {/* Proxy name */}
      <div className="space-y-1.5">
        <Label htmlFor="proxy-name">
          Proxy Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="proxy-name"
          data-ocid="registration.proxy_name_input"
          value={proxyName}
          onChange={(e) => {
            setProxyName(e.target.value);
            if (errors.proxyName)
              setErrors((p) => ({ ...p, proxyName: undefined }));
          }}
          onBlur={() =>
            !proxyName.trim() &&
            setErrors((p) => ({ ...p, proxyName: "Proxy name is required" }))
          }
          placeholder="Full name of proxy representative"
          className={cn(
            errors.proxyName &&
              "border-destructive focus-visible:ring-destructive",
          )}
        />
        {errors.proxyName && (
          <p
            className="text-xs text-destructive"
            data-ocid="registration.proxy_name.field_error"
          >
            {errors.proxyName}
          </p>
        )}
      </div>

      {/* Proxy contact */}
      <div className="space-y-1.5">
        <Label htmlFor="proxy-contact">
          Proxy Contact <span className="text-destructive">*</span>
        </Label>
        <Input
          id="proxy-contact"
          data-ocid="registration.proxy_contact_input"
          value={proxyContact}
          onChange={(e) => {
            setProxyContact(e.target.value);
            if (errors.proxyContact)
              setErrors((p) => ({ ...p, proxyContact: undefined }));
          }}
          onBlur={() =>
            !proxyContact.trim() &&
            setErrors((p) => ({
              ...p,
              proxyContact: "Proxy contact is required",
            }))
          }
          placeholder="Phone number or email address"
          className={cn(
            errors.proxyContact &&
              "border-destructive focus-visible:ring-destructive",
          )}
        />
        {errors.proxyContact && (
          <p
            className="text-xs text-destructive"
            data-ocid="registration.proxy_contact.field_error"
          >
            {errors.proxyContact}
          </p>
        )}
      </div>

      {/* Proof upload */}
      <div className="space-y-1.5">
        <Label>
          Proxy Proof Document{" "}
          <span className="text-muted-foreground font-normal">
            (PDF or image, max 10 MB)
          </span>
        </Label>

        {!proofFile ? (
          <button
            type="button"
            data-ocid="registration.proof_dropzone"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "w-full border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-smooth",
              errors.proofFile
                ? "border-destructive/60 bg-destructive/5"
                : "border-border hover:border-primary/50 hover:bg-primary/5",
            )}
          >
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">
              Click to upload proof document
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, JPEG, PNG, or WEBP
            </p>
          </button>
        ) : (
          <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Proof preview"
                  className="w-full max-h-48 object-contain bg-muted/20"
                />
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 border border-border flex items-center justify-center hover:bg-background transition-colors"
                  aria-label="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {proofFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(proofFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={handleFileChange}
          className="hidden"
          data-ocid="registration.proof_upload_button"
        />
        {errors.proofFile && (
          <p
            className="text-xs text-destructive"
            data-ocid="registration.proof.field_error"
          >
            {errors.proofFile}
          </p>
        )}
      </div>

      {/* Fraud flags */}
      {fraudFlags.length > 0 && (
        <div
          className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 space-y-2"
          data-ocid="registration.fraud_flags"
        >
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-semibold">
              {fraudFlags.length} Fraud Flag(s) Detected
            </span>
          </div>
          <ul className="space-y-1">
            {fraudFlags.map((flag) => (
              <li
                key={flag}
                className="text-xs text-amber-300/80 flex items-start gap-1.5"
              >
                <span className="mt-0.5">•</span> {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {validated && fraudFlags.length === 0 && (
        <div
          className="flex gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3"
          data-ocid="registration.validation_success_state"
        >
          <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-primary">
            Proof validated — no issues detected
          </p>
        </div>
      )}

      {/* Validate button */}
      {proofFile && (
        <Button
          type="button"
          variant="outline"
          data-ocid="registration.validate_proof_button"
          onClick={handleValidate}
          disabled={validating}
          className="w-full h-11"
        >
          {validating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Validating…
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4 mr-2" />
              Validate Proxy Proof
            </>
          )}
        </Button>
      )}

      {/* Server error */}
      {serverError && (
        <div
          className="flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3"
          data-ocid="registration.proxy.error_state"
        >
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{serverError}</p>
        </div>
      )}

      <Button
        type="submit"
        data-ocid="registration.proxy_submit_button"
        disabled={register.isPending}
        className="w-full h-12 text-base font-semibold"
      >
        {register.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Registering…
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Register Proxy
          </>
        )}
      </Button>
    </form>
  );
}
