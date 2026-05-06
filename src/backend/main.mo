import Shareholders "./shareholders";
import Registrations "./registrations";
import CheckIns "./checkins";
import Imports "./imports";
import Audit "./audit";
import Types "./types/agm-types";
import Users "./users";
import Settings "./settings";
import Map "mo:core/Map";

actor {

  // ─── All State ─────────────────────────────────────────────────────────────────

  let adminUsers = Map.empty<Text, Types.AppUser>();
  let adminSessions = Map.empty<Text, Users.Session>();
  var agmSettings : Types.AGMSettings = Settings.defaultSettings;

  let shareholderState = Shareholders.newState();
  let registrationState = Registrations.newState();
  let checkInState = CheckIns.newState();
  let importState = Imports.newState();
  let auditState = Audit.newState();

  // Seed default admin on every fresh canister start (idempotent — skips if already exists)
  Users.initDefaultAdmin(adminUsers);

  // ─── Auth Public API ─────────────────────────────────────────────────────────────

  public func login(username : Text, password : Text) : async { #ok : Users.LoginResponse; #err : Text } {
    Users.login(adminUsers, adminSessions, agmSettings, username, password);
  };

  public func validateSession(token : Text) : async { #ok : Users.Session; #err : Text } {
    Users.validateSession(adminSessions, agmSettings, token);
  };

  public func logout(token : Text) : async () {
    Users.logout(adminSessions, token);
  };

  public func changePassword(username : Text, oldPassword : Text, newPassword : Text) : async { #ok : (); #err : Text } {
    Users.changePassword(adminUsers, username, oldPassword, newPassword);
  };

  public func resetPasswordWithCode(username : Text, resetCode : Text, newPassword : Text) : async { #ok : (); #err : Text } {
    Users.resetPasswordWithCode(adminUsers, username, resetCode, newPassword);
  };

  // ─── User Management Public API ────────────────────────────────────────────────────────

  public func createUser(adminToken : Text, username : Text, password : Text, role : Types.UserRole) : async { #ok : Types.AppUser; #err : Text } {
    Users.createUser(adminUsers, adminSessions, agmSettings, adminToken, username, password, role);
  };

  public func updateUserRole(adminToken : Text, username : Text, role : Types.UserRole) : async { #ok : Types.AppUser; #err : Text } {
    Users.updateUserRole(adminUsers, adminSessions, agmSettings, adminToken, username, role);
  };

  public func deactivateUser(adminToken : Text, username : Text) : async { #ok : (); #err : Text } {
    Users.deactivateUser(adminUsers, adminSessions, agmSettings, adminToken, username);
  };

  public func getUsers(adminToken : Text) : async { #ok : [Types.AppUser]; #err : Text } {
    Users.getUsers(adminUsers, adminSessions, agmSettings, adminToken);
  };

  public func getActiveSessions(adminToken : Text) : async { #ok : [Users.Session]; #err : Text } {
    Users.getActiveSessions(adminUsers, adminSessions, agmSettings, adminToken);
  };

  public func forceLogout(adminToken : Text, username : Text) : async { #ok : (); #err : Text } {
    Users.forceLogout(adminUsers, adminSessions, agmSettings, adminToken, username);
  };

  // ─── Settings Public API ───────────────────────────────────────────────────────────

  public query func getSettings() : async Types.AGMSettings {
    Settings.getSettings(agmSettings);
  };

  public func updateSettings(adminToken : Text, newSettings : Types.AGMSettings) : async { #ok : Types.AGMSettings; #err : Text } {
    let settingsRef = { var value = agmSettings };
    let result = Settings.updateSettings(settingsRef, adminSessions, adminToken, newSettings);
    switch (result) {
      case (#ok _) { agmSettings := settingsRef.value };
      case (#err _) {};
    };
    result;
  };

  // ─── Shareholders ──────────────────────────────────────────────────────────────

  public shared func createShareholder(
    data : Shareholders.ShareholderInput,
    importedBy : Text,
  ) : async { #ok : Types.Shareholder; #err : Text } {
    let result = Shareholders.createShareholder(shareholderState, data, importedBy);
    ignore Audit.logAction(auditState, "CREATE_SHAREHOLDER", "shareholder",
      switch result { case (#ok s) s.id; case (#err _) "" },
      importedBy, "Shareholder created: " # data.shareholderNumber);
    result;
  };

  public query func getShareholder(id : Text) : async ?Types.Shareholder {
    Shareholders.getShareholder(shareholderState, id);
  };

  public query func getShareholderByNumber(shareholderNumber : Text) : async ?Types.Shareholder {
    Shareholders.getShareholderByNumber(shareholderState, shareholderNumber);
  };

  public query func searchShareholders(
    searchQuery : Text,
    statusFilter : ?Types.ShareholderStatus,
    page : Nat,
    pageSize : Nat,
  ) : async Shareholders.SearchResult {
    Shareholders.searchShareholders(shareholderState, searchQuery, statusFilter, page, pageSize);
  };

  public shared func updateShareholderStatus(
    id : Text,
    status : Types.ShareholderStatus,
    updatedBy : Text,
  ) : async { #ok : Types.Shareholder; #err : Text } {
    let result = Shareholders.updateShareholderStatus(shareholderState, id, status, updatedBy);
    ignore Audit.logAction(auditState, "UPDATE_STATUS", "shareholder", id, updatedBy,
      "Status updated");
    result;
  };

  public query func getDashboardMetrics(quorumThreshold : Nat) : async Types.DashboardMetrics {
    Shareholders.getDashboardMetrics(shareholderState, quorumThreshold);
  };

  public query func getAllShareholders() : async [Types.Shareholder] {
    Shareholders.getAllShareholders(shareholderState);
  };

  public shared func deleteAllShareholders(deletedBy : Text) : async { #ok : Nat; #err : Text } {
    let count = Shareholders.deleteAllShareholders(shareholderState);
    ignore Audit.logAction(auditState, "DELETE_ALL_SHAREHOLDERS", "shareholder", "*", deletedBy,
      "All shareholders deleted. Count: " # count.toText());
    #ok count;
  };

  public shared func bulkCreateShareholders(
    items : [Shareholders.ShareholderInput],
    importedBy : Text,
  ) : async Shareholders.BulkCreateResult {
    let result = Shareholders.bulkCreateShareholders(shareholderState, items, importedBy);
    ignore Audit.logAction(auditState, "BULK_IMPORT", "shareholder", "batch", importedBy,
      "Bulk import: created=" # result.created.toText() #
      " duplicates=" # result.duplicates.toText());
    result;
  };

  // ─── Registrations ─────────────────────────────────────────────────────────────

  public func registerShareholder(
    shareholderId : Text,
    regType : Types.RegistrationType,
    proxyData : ?Registrations.ProxyData,
    registeredBy : Text,
  ) : async { #ok : Types.Registration; #err : Text } {
    let result = Registrations.registerShareholder(registrationState, shareholderId, regType, proxyData, registeredBy);
    switch result {
      case (#ok reg) {
        let newStatus : Types.ShareholderStatus = switch (regType) {
          case (#InPerson) #RegisteredInPerson;
          case (#Proxy) #RegisteredProxy;
        };
        ignore Shareholders.updateShareholderStatus(shareholderState, shareholderId, newStatus, registeredBy);
        ignore Audit.logAction(auditState, "REGISTER_SHAREHOLDER", "registration", reg.id, registeredBy,
          "Registered: " # reg.verificationCode);
      };
      case _ {};
    };
    result;
  };

  public query func getRegistration(id : Text) : async ?Types.Registration {
    Registrations.getRegistration(registrationState, id);
  };

  public query func getRegistrationByShareholder(shareholderId : Text) : async ?Types.Registration {
    Registrations.getRegistrationByShareholder(registrationState, shareholderId);
  };

  public func updateRegistration(
    id : Text,
    updates : Registrations.RegistrationUpdate,
    updatedBy : Text,
  ) : async { #ok : Types.Registration; #err : Text } {
    let result = Registrations.updateRegistration(registrationState, id, updates, updatedBy);
    switch result {
      case (#ok reg) {
        ignore Audit.logAction(auditState, "UPDATE_REGISTRATION", "registration", reg.id, updatedBy, "Registration updated");
      };
      case _ {};
    };
    result;
  };

  public func validateProxyProof(
    registrationId : Text,
    validated : Bool,
    fraudFlags : [Text],
    validatedBy : Text,
  ) : async { #ok : Types.Registration; #err : Text } {
    let result = Registrations.validateProxyProof(registrationState, registrationId, validated, fraudFlags, validatedBy);
    switch result {
      case (#ok reg) {
        ignore Audit.logAction(auditState, "VALIDATE_PROXY", "registration", reg.id, validatedBy,
          "Proxy validated: " # debug_show(validated));
      };
      case _ {};
    };
    result;
  };

  public func cancelRegistration(
    id : Text,
    cancelledBy : Text,
    reason : Text,
  ) : async { #ok; #err : Text } {
    switch (Registrations.cancelRegistration(registrationState, id, cancelledBy, reason)) {
      case (#ok shareholderId) {
        ignore Shareholders.updateShareholderStatus(shareholderState, shareholderId, #NotRegistered, cancelledBy);
        ignore Audit.logAction(auditState, "CANCEL_REGISTRATION", "registration", id, cancelledBy,
          "Cancelled: " # reason);
        #ok;
      };
      case (#err e) #err e;
    };
  };

  public query func getAllRegistrations() : async [Types.Registration] {
    Registrations.getAllRegistrations(registrationState);
  };

  // ─── Check-Ins ───────────────────────────────────────────────────────────────

  public func checkInShareholder(
    shareholderId : Text,
    registrationId : Text,
    method : Types.CheckInMethod,
    checkedInBy : Text,
  ) : async { #ok : Types.CheckIn; #err : Text } {
    let regExists = switch (Registrations.getRegistration(registrationState, registrationId)) {
      case (?reg) reg.shareholderId == shareholderId;
      case null false;
    };
    let result = CheckIns.checkInShareholder(checkInState, shareholderId, registrationId, regExists, method, checkedInBy);
    switch result {
      case (#ok checkIn) {
        ignore Shareholders.updateShareholderStatus(shareholderState, shareholderId, #CheckedIn, checkedInBy);
        ignore Audit.logAction(auditState, "CHECK_IN", "checkin", checkIn.id, checkedInBy,
          "Checked in via " # debug_show(method));
      };
      case _ {};
    };
    result;
  };

  public query func getCheckIn(id : Text) : async ?Types.CheckIn {
    CheckIns.getCheckIn(checkInState, id);
  };

  public query func getCheckInByShareholder(shareholderId : Text) : async ?Types.CheckIn {
    CheckIns.getCheckInByShareholder(checkInState, shareholderId);
  };

  public func undoCheckIn(shareholderId : Text, undoneBy : Text) : async { #ok; #err : Text } {
    let result = CheckIns.undoCheckIn(checkInState, shareholderId, undoneBy);
    switch result {
      case (#ok) {
        let prevStatus : Types.ShareholderStatus = switch (Registrations.getRegistrationByShareholder(registrationState, shareholderId)) {
          case (?reg) switch (reg.registrationType) {
            case (#InPerson) #RegisteredInPerson;
            case (#Proxy) #RegisteredProxy;
          };
          case null #NotRegistered;
        };
        ignore Shareholders.updateShareholderStatus(shareholderState, shareholderId, prevStatus, undoneBy);
        ignore Audit.logAction(auditState, "UNDO_CHECK_IN", "checkin", shareholderId, undoneBy, "Check-in undone");
      };
      case _ {};
    };
    result;
  };

  public query func getAllCheckIns() : async [Types.CheckIn] {
    CheckIns.getAllCheckIns(checkInState);
  };

  // ─── Import Batches ─────────────────────────────────────────────────────────────

  public shared func createImportBatch(
    filename : Text,
    uploadedBy : Text,
    totalRows : Nat,
  ) : async Types.ImportBatch {
    let batch = Imports.createImportBatch(importState, filename, uploadedBy, totalRows);
    ignore Audit.logAction(auditState, "CREATE_IMPORT_BATCH", "import", batch.id, uploadedBy,
      "Import batch created: " # filename);
    batch;
  };

  public shared func updateImportBatchStatus(
    id : Text,
    status : Types.ImportStatus,
    importedRows : Nat,
    duplicates : Nat,
  ) : async { #ok : Types.ImportBatch; #err : Text } {
    Imports.updateImportBatchStatus(importState, id, status, importedRows, duplicates);
  };

  public query func getImportBatch(id : Text) : async ?Types.ImportBatch {
    Imports.getImportBatch(importState, id);
  };

  public query func getImportBatches() : async [Types.ImportBatch] {
    Imports.getImportBatches(importState);
  };

  // ─── Audit Log ───────────────────────────────────────────────────────────────

  public query func getAuditLog(
    entityType : ?Text,
    entityId : ?Text,
    limit : Nat,
  ) : async [Types.AuditEntry] {
    Audit.getAuditLog(auditState, entityType, entityId, limit);
  };

  public query func getAuditLogForExport() : async [Types.AuditEntry] {
    Audit.getAuditLogForExport(auditState);
  };

};
