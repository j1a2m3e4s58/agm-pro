import { createActor } from "@/backend";
import type {
  AGMSettings,
  AppUser,
  AuditEntry,
  BulkCreateResult,
  CheckIn,
  DashboardMetrics,
  ImportBatch,
  LoginResponse,
  ProxyData,
  Registration,
  RegistrationUpdate,
  SearchResult,
  Session,
  Shareholder,
  ShareholderInput,
} from "@/backend";
import {
  CheckInMethod,
  ImportStatus,
  RegistrationType,
  ShareholderStatus,
  UserRole,
} from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { storage } from "./storage";

// Re-export enums for convenience
export {
  CheckInMethod,
  ImportStatus,
  RegistrationType,
  ShareholderStatus,
  UserRole,
};
export type {
  AGMSettings,
  AppUser,
  AuditEntry,
  BulkCreateResult,
  CheckIn,
  DashboardMetrics,
  ImportBatch,
  LoginResponse,
  ProxyData,
  Registration,
  RegistrationUpdate,
  SearchResult,
  Session,
  Shareholder,
  ShareholderInput,
};

export class SessionExpiredError extends Error {
  constructor() {
    super("SESSION_EXPIRED");
    this.name = "SessionExpiredError";
  }
}

type OkErr<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

function unwrapResult<T>(result: OkErr<T>): T {
  if (result.__kind__ === "err") {
    if (
      result.err.includes("SESSION_EXPIRED") ||
      result.err.includes("Invalid session") ||
      result.err.includes("Session expired")
    ) {
      throw new SessionExpiredError();
    }
    throw new Error(result.err);
  }
  return result.ok;
}

// useBackendClient hook — returns a typed client from the actor
export function useBackendActor() {
  return useActor(createActor);
}

// Standalone client builder (for use in hooks)
export function buildClient(actor: ReturnType<typeof createActor>) {
  const token = () => storage.getSessionToken() ?? "";

  return {
    // Auth
    async login(username: string, password: string): Promise<LoginResponse> {
      const result = await actor.login(username, password);
      return unwrapResult(result);
    },
    async logout(): Promise<void> {
      const t = token();
      if (t) await actor.logout(t);
      storage.clearSession();
    },
    async changePassword(
      username: string,
      oldPassword: string,
      newPassword: string,
    ): Promise<void> {
      const result = await actor.changePassword(
        username,
        oldPassword,
        newPassword,
      );
      unwrapResult(result);
    },
    async resetPassword(
      username: string,
      resetCode: string,
      newPassword: string,
    ): Promise<void> {
      const result = await actor.resetPasswordWithCode(
        username,
        resetCode,
        newPassword,
      );
      unwrapResult(result);
    },
    async validateSession(): Promise<Session> {
      const result = await actor.validateSession(token());
      return unwrapResult(result);
    },

    // Settings
    async getSettings(): Promise<AGMSettings> {
      return actor.getSettings();
    },
    async updateSettings(settings: AGMSettings): Promise<AGMSettings> {
      const result = await actor.updateSettings(token(), settings);
      return unwrapResult(result);
    },

    // Dashboard
    async getDashboardMetrics(
      quorumThreshold: bigint,
    ): Promise<DashboardMetrics> {
      return actor.getDashboardMetrics(quorumThreshold);
    },

    // Shareholders
    async getAllShareholders(): Promise<Shareholder[]> {
      return actor.getAllShareholders();
    },
    async getShareholder(id: string): Promise<Shareholder | null> {
      return actor.getShareholder(id);
    },
    async getShareholderByNumber(num: string): Promise<Shareholder | null> {
      return actor.getShareholderByNumber(num);
    },
    async searchShareholders(
      query: string,
      status: ShareholderStatus | null,
      page: bigint,
      pageSize: bigint,
    ): Promise<SearchResult> {
      return actor.searchShareholders(query, status, page, pageSize);
    },
    async createShareholder(data: ShareholderInput): Promise<Shareholder> {
      const result = await actor.createShareholder(data, token());
      return unwrapResult(result);
    },
    async bulkCreateShareholders(
      items: ShareholderInput[],
    ): Promise<BulkCreateResult> {
      return actor.bulkCreateShareholders(items, token());
    },
    async updateShareholderStatus(
      id: string,
      status: ShareholderStatus,
    ): Promise<Shareholder> {
      const result = await actor.updateShareholderStatus(id, status, token());
      return unwrapResult(result);
    },
    async deleteAllShareholders(): Promise<bigint> {
      const result = await actor.deleteAllShareholders(token());
      return unwrapResult(result);
    },

    // Registration
    async getAllRegistrations(): Promise<Registration[]> {
      return actor.getAllRegistrations();
    },
    async getRegistration(id: string): Promise<Registration | null> {
      return actor.getRegistration(id);
    },
    async getRegistrationByShareholder(
      shareholderId: string,
    ): Promise<Registration | null> {
      return actor.getRegistrationByShareholder(shareholderId);
    },
    async registerShareholder(
      shareholderId: string,
      regType: RegistrationType,
      proxyData: ProxyData | null,
    ): Promise<Registration> {
      const result = await actor.registerShareholder(
        shareholderId,
        regType,
        proxyData,
        token(),
      );
      return unwrapResult(result);
    },
    async updateRegistration(
      id: string,
      updates: RegistrationUpdate,
    ): Promise<Registration> {
      const result = await actor.updateRegistration(id, updates, token());
      return unwrapResult(result);
    },
    async cancelRegistration(id: string, reason: string): Promise<void> {
      const result = await actor.cancelRegistration(id, token(), reason);
      unwrapResult(result);
    },
    async validateProxyProof(
      registrationId: string,
      validated: boolean,
      fraudFlags: string[],
    ): Promise<Registration> {
      const result = await actor.validateProxyProof(
        registrationId,
        validated,
        fraudFlags,
        token(),
      );
      return unwrapResult(result);
    },

    // Check-In
    async getAllCheckIns(): Promise<CheckIn[]> {
      return actor.getAllCheckIns();
    },
    async getCheckIn(id: string): Promise<CheckIn | null> {
      return actor.getCheckIn(id);
    },
    async getCheckInByShareholder(
      shareholderId: string,
    ): Promise<CheckIn | null> {
      return actor.getCheckInByShareholder(shareholderId);
    },
    async checkInShareholder(
      shareholderId: string,
      registrationId: string,
      method: CheckInMethod,
    ): Promise<CheckIn> {
      const result = await actor.checkInShareholder(
        shareholderId,
        registrationId,
        method,
        token(),
      );
      return unwrapResult(result);
    },
    async undoCheckIn(shareholderId: string): Promise<void> {
      const result = await actor.undoCheckIn(shareholderId, token());
      unwrapResult(result);
    },

    // Import Batches
    async getImportBatches(): Promise<ImportBatch[]> {
      return actor.getImportBatches();
    },
    async getImportBatch(id: string): Promise<ImportBatch | null> {
      return actor.getImportBatch(id);
    },
    async createImportBatch(
      filename: string,
      totalRows: bigint,
    ): Promise<ImportBatch> {
      return actor.createImportBatch(filename, token(), totalRows);
    },
    async updateImportBatchStatus(
      id: string,
      status: ImportStatus,
      importedRows: bigint,
      duplicates: bigint,
    ): Promise<ImportBatch> {
      const result = await actor.updateImportBatchStatus(
        id,
        status,
        importedRows,
        duplicates,
      );
      return unwrapResult(result);
    },

    // Users (Admin)
    async getUsers(): Promise<AppUser[]> {
      const result = await actor.getUsers(token());
      return unwrapResult(result);
    },
    async createUser(
      username: string,
      password: string,
      role: UserRole,
    ): Promise<AppUser> {
      const result = await actor.createUser(token(), username, password, role);
      return unwrapResult(result);
    },
    async updateUserRole(username: string, role: UserRole): Promise<AppUser> {
      const result = await actor.updateUserRole(token(), username, role);
      return unwrapResult(result);
    },
    async deactivateUser(username: string): Promise<void> {
      const result = await actor.deactivateUser(token(), username);
      unwrapResult(result);
    },
    async getActiveSessions(): Promise<Session[]> {
      const result = await actor.getActiveSessions(token());
      return unwrapResult(result);
    },
    async forceLogout(username: string): Promise<void> {
      const result = await actor.forceLogout(token(), username);
      unwrapResult(result);
    },

    // Audit
    async getAuditLog(
      entityType: string | null,
      entityId: string | null,
      limit: bigint,
    ): Promise<AuditEntry[]> {
      return actor.getAuditLog(entityType, entityId, limit);
    },
    async getAuditLogForExport(): Promise<AuditEntry[]> {
      return actor.getAuditLogForExport();
    },
  };
}
