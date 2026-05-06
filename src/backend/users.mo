import Map "mo:core/Map";
import List "mo:core/List";
import Time "mo:core/Time";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Int "mo:core/Int";
import Types "./types/agm-types";

module {

  public type Session = {
    token : Text;
    username : Text;
    role : Types.UserRole;
    expiresAt : Int;
  };

  public type LoginResponse = {
    token : Text;
    role : Types.UserRole;
    username : Text;
    mustChangePassword : Bool;
  };

  // ──────────────────────────────────────────────
  // Password Hashing
  // ──────────────────────────────────────────────

  /// Simple deterministic hash combining characters with salt "AGM2024".
  /// Returns a hex-like text representation.
  public func hashPassword(password : Text) : Text {
    let salt = "AGM2024";
    let combined = password # salt;
    var hash : Nat = 5381;
    for (c in combined.toIter()) {
      let code = Nat32.toNat(Char.toNat32(c));
      hash := ((hash * 33) + code) % 4294967296;
    };
    // produce an 8-char hex string
    let hexChars = ["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"];
    var remaining = hash;
    var result = "";
    for (_ in Nat.range(0, 9)) {
      let digit = remaining % 16;
      result := hexChars[digit] # result;
      remaining := remaining / 16;
    };
    result;
  };

  // ──────────────────────────────────────────────
  // Initialisation
  // ──────────────────────────────────────────────

  /// Seed the default admin into the users map.
  public func initDefaultAdmin(users : Map.Map<Text, Types.AppUser>) {
    let defaultUsername = "T4N4AMEG8F5";
    switch (users.get(defaultUsername)) {
      case (?_) {}; // already seeded
      case null {
        let admin : Types.AppUser = {
          principal = "";
          username = defaultUsername;
          passwordHash = hashPassword(defaultUsername);
          role = #SuperAdmin;
          isActive = true;
          mustChangePassword = true;
          createdAt = Time.now();
          lastLogin = null;
          sessionExpiry = null;
        };
        users.add(defaultUsername, admin);
      };
    };
  };

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  func generateToken(username : Text) : Text {
    let ts = Time.now();
    let tsText = ts.toText();
    let combined = tsText # username # "TOKEN";
    hashPassword(combined);
  };

  func getSessionTimeout(agmSettings : Types.AGMSettings) : Int {
    agmSettings.sessionTimeoutMinutes * 60 * 1_000_000_000;
  };

  // ──────────────────────────────────────────────
  // Auth
  // ──────────────────────────────────────────────

  public func login(
    users : Map.Map<Text, Types.AppUser>,
    sessions : Map.Map<Text, Session>,
    agmSettings : Types.AGMSettings,
    username : Text,
    password : Text,
  ) : { #ok : LoginResponse; #err : Text } {
    switch (users.get(username)) {
      case null { #err "INVALID_CREDENTIALS" };
      case (?user) {
        if (user.passwordHash != hashPassword(password)) {
          return #err "INVALID_CREDENTIALS";
        };
        if (not user.isActive) {
          return #err "ACCOUNT_DISABLED";
        };
        let token = generateToken(username);
        let expiresAt = Time.now() + getSessionTimeout(agmSettings);
        let session : Session = {
          token;
          username;
          role = user.role;
          expiresAt;
        };
        sessions.add(token, session);
        // update lastLogin
        let updated : Types.AppUser = { user with lastLogin = ?Time.now() };
        users.add(username, updated);
        #ok {
          token;
          role = user.role;
          username;
          mustChangePassword = user.mustChangePassword;
        };
      };
    };
  };

  public func validateSession(
    sessions : Map.Map<Text, Session>,
    agmSettings : Types.AGMSettings,
    token : Text,
  ) : { #ok : Session; #err : Text } {
    switch (sessions.get(token)) {
      case null { #err "INVALID_SESSION" };
      case (?session) {
        let now = Time.now();
        if (now > session.expiresAt) {
          sessions.remove(token);
          return #err "SESSION_EXPIRED";
        };
        // sliding window renewal
        let renewed : Session = {
          session with
          expiresAt = now + getSessionTimeout(agmSettings);
        };
        sessions.add(token, renewed);
        #ok renewed;
      };
    };
  };

  public func logout(
    sessions : Map.Map<Text, Session>,
    token : Text,
  ) {
    sessions.remove(token);
  };

  // ──────────────────────────────────────────────
  // Password Management
  // ──────────────────────────────────────────────

  public func changePassword(
    users : Map.Map<Text, Types.AppUser>,
    username : Text,
    oldPassword : Text,
    newPassword : Text,
  ) : { #ok : (); #err : Text } {
    switch (users.get(username)) {
      case null { #err "USER_NOT_FOUND" };
      case (?user) {
        if (user.passwordHash != hashPassword(oldPassword)) {
          return #err "INVALID_CREDENTIALS";
        };
        if (newPassword.size() < 8) {
          return #err "PASSWORD_TOO_SHORT";
        };
        let updated : Types.AppUser = {
          user with
          passwordHash = hashPassword(newPassword);
          mustChangePassword = false;
        };
        users.add(username, updated);
        #ok ();
      };
    };
  };

  public func resetPasswordWithCode(
    users : Map.Map<Text, Types.AppUser>,
    username : Text,
    resetCode : Text,
    newPassword : Text,
  ) : { #ok : (); #err : Text } {
    if (resetCode != "T4n4AMEg8f5") {
      return #err "INVALID_RESET_CODE";
    };
    switch (users.get(username)) {
      case null { #err "USER_NOT_FOUND" };
      case (?user) {
        if (newPassword.size() < 8) {
          return #err "PASSWORD_TOO_SHORT";
        };
        let updated : Types.AppUser = {
          user with
          passwordHash = hashPassword(newPassword);
          mustChangePassword = false;
        };
        users.add(username, updated);
        #ok ();
      };
    };
  };

  // ──────────────────────────────────────────────
  // User Management
  // ──────────────────────────────────────────────

  func requireSuperAdmin(
    sessions : Map.Map<Text, Session>,
    agmSettings : Types.AGMSettings,
    adminToken : Text,
  ) : { #ok : Session; #err : Text } {
    switch (validateSession(sessions, agmSettings, adminToken)) {
      case (#err e) { #err e };
      case (#ok session) {
        switch (session.role) {
          case (#SuperAdmin) { #ok session };
          case _ { #err "FORBIDDEN" };
        };
      };
    };
  };

  func requireAdmin(
    sessions : Map.Map<Text, Session>,
    agmSettings : Types.AGMSettings,
    adminToken : Text,
  ) : { #ok : Session; #err : Text } {
    switch (validateSession(sessions, agmSettings, adminToken)) {
      case (#err e) { #err e };
      case (#ok session) {
        switch (session.role) {
          case (#SuperAdmin) { #ok session };
          case (#RegistrationOfficer) { #ok session };
          case _ { #err "FORBIDDEN" };
        };
      };
    };
  };

  public func createUser(
    users : Map.Map<Text, Types.AppUser>,
    sessions : Map.Map<Text, Session>,
    agmSettings : Types.AGMSettings,
    adminToken : Text,
    username : Text,
    password : Text,
    role : Types.UserRole,
  ) : { #ok : Types.AppUser; #err : Text } {
    switch (requireSuperAdmin(sessions, agmSettings, adminToken)) {
      case (#err e) { #err e };
      case (#ok _) {
        if (users.containsKey(username)) {
          return #err "USERNAME_TAKEN";
        };
        let newUser : Types.AppUser = {
          principal = "";
          username;
          passwordHash = hashPassword(password);
          role;
          isActive = true;
          mustChangePassword = true;
          createdAt = Time.now();
          lastLogin = null;
          sessionExpiry = null;
        };
        users.add(username, newUser);
        #ok newUser;
      };
    };
  };

  public func updateUserRole(
    users : Map.Map<Text, Types.AppUser>,
    sessions : Map.Map<Text, Session>,
    agmSettings : Types.AGMSettings,
    adminToken : Text,
    username : Text,
    role : Types.UserRole,
  ) : { #ok : Types.AppUser; #err : Text } {
    switch (requireSuperAdmin(sessions, agmSettings, adminToken)) {
      case (#err e) { #err e };
      case (#ok _) {
        switch (users.get(username)) {
          case null { #err "USER_NOT_FOUND" };
          case (?user) {
            let updated : Types.AppUser = { user with role };
            users.add(username, updated);
            #ok updated;
          };
        };
      };
    };
  };

  public func deactivateUser(
    users : Map.Map<Text, Types.AppUser>,
    sessions : Map.Map<Text, Session>,
    agmSettings : Types.AGMSettings,
    adminToken : Text,
    username : Text,
  ) : { #ok : (); #err : Text } {
    switch (requireSuperAdmin(sessions, agmSettings, adminToken)) {
      case (#err e) { #err e };
      case (#ok _) {
        switch (users.get(username)) {
          case null { #err "USER_NOT_FOUND" };
          case (?user) {
            let updated : Types.AppUser = { user with isActive = false };
            users.add(username, updated);
            #ok ();
          };
        };
      };
    };
  };

  public func getUsers(
    users : Map.Map<Text, Types.AppUser>,
    sessions : Map.Map<Text, Session>,
    agmSettings : Types.AGMSettings,
    adminToken : Text,
  ) : { #ok : [Types.AppUser]; #err : Text } {
    switch (requireAdmin(sessions, agmSettings, adminToken)) {
      case (#err e) { #err e };
      case (#ok _) {
        let result = List.empty<Types.AppUser>();
        for ((_, user) in users.entries()) {
          // mask password hash
          result.add({ user with passwordHash = "" });
        };
        #ok (result.toArray());
      };
    };
  };

  public func getActiveSessions(
    _users : Map.Map<Text, Types.AppUser>,
    sessions : Map.Map<Text, Session>,
    agmSettings : Types.AGMSettings,
    adminToken : Text,
  ) : { #ok : [Session]; #err : Text } {
    switch (requireSuperAdmin(sessions, agmSettings, adminToken)) {
      case (#err e) { #err e };
      case (#ok _) {
        let now = Time.now();
        let result = List.empty<Session>();
        for ((_, s) in sessions.entries()) {
          if (s.expiresAt > now) {
            result.add(s);
          };
        };
        #ok (result.toArray());
      };
    };
  };

  public func forceLogout(
    _users : Map.Map<Text, Types.AppUser>,
    sessions : Map.Map<Text, Session>,
    agmSettings : Types.AGMSettings,
    adminToken : Text,
    username : Text,
  ) : { #ok : (); #err : Text } {
    switch (requireSuperAdmin(sessions, agmSettings, adminToken)) {
      case (#err e) { #err e };
      case (#ok _) {
        let toRemove = List.empty<Text>();
        for ((token, s) in sessions.entries()) {
          if (s.username == username) {
            toRemove.add(token);
          };
        };
        for (token in toRemove.values()) {
          sessions.remove(token);
        };
        #ok ();
      };
    };
  };

};
