import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/hooks/use-auth";
import { useRegisterShareholder } from "@/hooks/use-backend";
import { RegistrationType } from "@/types";
import type { Registration, Shareholder } from "@/types";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
} from "lucide-react";
import { useState } from "react";

function generateVerificationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `AGM-${code}`;
}

interface InPersonFormProps {
  shareholder: Shareholder;
  onSuccess: (reg: Registration) => void;
}

export function InPersonForm({ shareholder, onSuccess }: InPersonFormProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [notes, setNotes] = useState("");
  const [verificationCode] = useState(generateVerificationCode);
  const [serverError, setServerError] = useState<string | null>(null);

  const register = useRegisterShareholder();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    try {
      const result = await register.mutateAsync({
        shareholderId: shareholder.id,
        regType: RegistrationType.InPerson,
        proxyData: null,
      });
      showToast("Shareholder registered successfully!", "success");
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
      data-ocid="registration.inperson_form"
    >
      {/* Shareholder info summary */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Full Name</span>
          <span className="font-medium text-foreground">
            {shareholder.fullName}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Shareholder #</span>
          <span className="font-medium text-foreground">
            {shareholder.shareholderNumber}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Shareholding</span>
          <span className="font-medium text-foreground">
            {Number(shareholder.shareholding).toLocaleString()} shares
          </span>
        </div>
        {user && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Registering Officer</span>
            <span className="font-medium text-foreground">{user.username}</span>
          </div>
        )}
      </div>

      {/* Verification code */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <ClipboardCheck className="w-3.5 h-3.5" />
          Auto-generated Verification Code
        </Label>
        <Input
          value={verificationCode}
          readOnly
          className="font-mono text-base tracking-widest bg-muted/50 text-muted-foreground cursor-not-allowed select-all"
          data-ocid="registration.verification_code"
        />
        <p className="text-xs text-muted-foreground">
          This code will be printed on the badge.
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="inperson-notes" className="text-sm font-medium">
          Notes{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          id="inperson-notes"
          data-ocid="registration.notes_textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any relevant notes…"
          rows={3}
          className="resize-none"
        />
      </div>

      {/* Error */}
      {serverError && (
        <div
          className="flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3"
          data-ocid="registration.error_state"
        >
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{serverError}</p>
        </div>
      )}

      <Button
        type="submit"
        data-ocid="registration.inperson_submit_button"
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
            Register In Person
          </>
        )}
      </Button>
    </form>
  );
}
