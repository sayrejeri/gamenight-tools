export const PLATFORM_PERMISSIONS = [
  "REVIEW_PROFILES",
  "MODERATE_USERS",
  "VIEW_REPORTS",
  "VIEW_BASIC_AUDIT",
  "VIEW_FULL_AUDIT",
  "MANAGE_SERVERS",
  "MANAGE_TEAMS",
  "MANAGE_PLATFORM_STAFF",
  "ASSIGN_HIGH_ROLES",
  "EDIT_ACCESS_PERMISSIONS",
  "MANAGE_OWNERS",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const WORKSPACE_PERMISSIONS = [
  "HOST_EVENTS",
  "MANAGE_EVENTS",
  "APPROVE_EVENTS",
  "MANAGE_PARTICIPANTS",
  "MANAGE_BRACKETS",
  "MANAGE_TEAMS",
  "MANAGE_SERVER_PROFILE",
  "MANAGE_WEBHOOKS",
  "MANAGE_CHANNELS",
  "MANAGE_MESSAGES",
  "TIMEOUT_MEMBERS",
  "VIEW_STAFF_CHANNELS",
  "POST_ANNOUNCEMENTS",
  "MANAGE_MEMBERS",
  "MANAGE_CODES",
  "VIEW_REPORTS",
  "VIEW_BASIC_AUDIT",
  "VIEW_FULL_AUDIT",
  "ASSIGN_LOW_ROLES",
  "ASSIGN_HIGH_ROLES",
  "EDIT_ACCESS_PERMISSIONS",
  "MANAGE_OWNERS",
] as const;

export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

export type PermissionOverrides<T extends string = string> = {
  grants: T[];
  denies: T[];
};

export const PLATFORM_PERMISSION_INFO: Record<PlatformPermission, { label: string; description: string; risk?: "high" }> = {
  REVIEW_PROFILES: { label: "Review profiles", description: "Approve, deny, and request changes to server and team profile requests." },
  MODERATE_USERS: { label: "Moderate users", description: "Take moderation actions on website users and reported content." },
  VIEW_REPORTS: { label: "View reports", description: "See reports submitted by users." },
  VIEW_BASIC_AUDIT: { label: "View basic audit", description: "See normal administrative and moderation actions." },
  VIEW_FULL_AUDIT: { label: "View full audit", description: "See sensitive security, ownership, and permission changes.", risk: "high" },
  MANAGE_SERVERS: { label: "Manage server profiles", description: "Edit approved server profiles and their normal settings." },
  MANAGE_TEAMS: { label: "Manage team profiles", description: "Open and edit registered team profiles from platform staff administration without joining the roster." },
  MANAGE_PLATFORM_STAFF: { label: "Manage platform staff", description: "Add, edit, suspend, and remove normal platform staff roles." },
  ASSIGN_HIGH_ROLES: { label: "Assign Admin roles", description: "Grant or remove Admin-level access. This is owner-controlled by default.", risk: "high" },
  EDIT_ACCESS_PERMISSIONS: { label: "Edit permission overrides", description: "Customize another staff member's individual permissions.", risk: "high" },
  MANAGE_OWNERS: { label: "Manage Owners", description: "Add, remove, or modify Owner-level access.", risk: "high" },
};

export const WORKSPACE_PERMISSION_INFO: Record<WorkspacePermission, { label: string; description: string; risk?: "high" }> = {
  HOST_EVENTS: { label: "Host events", description: "Create and host game-night events for this server." },
  MANAGE_EVENTS: { label: "Manage events", description: "Edit event settings, stages, templates, and announcements." },
  APPROVE_EVENTS: { label: "Approve events", description: "Approve host-submitted events before signups open." },
  MANAGE_PARTICIPANTS: { label: "Manage participants", description: "Approve, remove, check in, or update event participants." },
  MANAGE_BRACKETS: { label: "Manage brackets", description: "Create brackets, seed players, score matches, and advance winners." },
  MANAGE_TEAMS: { label: "Manage teams", description: "Manage teams associated with this server when supported." },
  MANAGE_SERVER_PROFILE: { label: "Manage server profile", description: "Edit branding, links, saved games, and community settings." },
  MANAGE_WEBHOOKS: { label: "Manage webhooks", description: "Add, edit, test, disable, and delete Discord webhooks." },
  MANAGE_CHANNELS: { label: "Manage chat channels", description: "Create, edit, reorder, and archive server chat channels." },
  MANAGE_MESSAGES: { label: "Moderate messages", description: "Delete messages, pin messages, and moderate server chat content." },
  TIMEOUT_MEMBERS: { label: "Timeout chat members", description: "Temporarily prevent members from sending messages in this server." },
  VIEW_STAFF_CHANNELS: { label: "View staff channels", description: "Read and participate in staff-only server channels." },
  POST_ANNOUNCEMENTS: { label: "Post announcements", description: "Send messages in announcement-only channels." },
  MANAGE_MEMBERS: { label: "Manage members", description: "Add, edit, suspend, and remove normal server staff access." },
  MANAGE_CODES: { label: "Manage access codes", description: "Generate and manage staff, host, and event access codes." },
  VIEW_REPORTS: { label: "View server reports", description: "See reports scoped to this server when available." },
  VIEW_BASIC_AUDIT: { label: "View basic audit", description: "See normal server administration and moderation actions." },
  VIEW_FULL_AUDIT: { label: "View full audit", description: "See sensitive permission, ownership, and security actions.", risk: "high" },
  ASSIGN_LOW_ROLES: { label: "Assign normal roles", description: "Assign Staff, Host, Referee, and Viewer roles." },
  ASSIGN_HIGH_ROLES: { label: "Assign Admin roles", description: "Assign or remove Admin access. Owner-controlled by default.", risk: "high" },
  EDIT_ACCESS_PERMISSIONS: { label: "Edit permission overrides", description: "Customize another member's individual permissions.", risk: "high" },
  MANAGE_OWNERS: { label: "Manage Owners", description: "Add, remove, or modify server Owners.", risk: "high" },
};

export const PLATFORM_ROLE_DEFAULTS: Record<string, readonly PlatformPermission[]> = {
  OWNER: PLATFORM_PERMISSIONS,
  ADMIN: ["REVIEW_PROFILES", "MODERATE_USERS", "VIEW_REPORTS", "VIEW_BASIC_AUDIT", "MANAGE_SERVERS", "MANAGE_TEAMS", "MANAGE_PLATFORM_STAFF"],
  REVIEWER: ["REVIEW_PROFILES", "VIEW_BASIC_AUDIT"],
  MODERATOR: ["MODERATE_USERS", "VIEW_REPORTS", "VIEW_BASIC_AUDIT"],
  SUPPORT: ["VIEW_REPORTS"],
};

export const WORKSPACE_ROLE_DEFAULTS: Record<string, readonly WorkspacePermission[]> = {
  OWNER: WORKSPACE_PERMISSIONS,
  ADMIN: [
    "HOST_EVENTS", "MANAGE_EVENTS", "APPROVE_EVENTS", "MANAGE_PARTICIPANTS", "MANAGE_BRACKETS", "MANAGE_TEAMS",
    "MANAGE_SERVER_PROFILE", "MANAGE_WEBHOOKS", "MANAGE_CHANNELS", "MANAGE_MESSAGES", "TIMEOUT_MEMBERS",
    "VIEW_STAFF_CHANNELS", "POST_ANNOUNCEMENTS", "MANAGE_MEMBERS", "MANAGE_CODES",
    "VIEW_REPORTS", "VIEW_BASIC_AUDIT", "ASSIGN_LOW_ROLES",
  ],
  STAFF: [
    "HOST_EVENTS", "MANAGE_EVENTS", "APPROVE_EVENTS", "MANAGE_PARTICIPANTS", "MANAGE_BRACKETS", "MANAGE_CODES",
    "MANAGE_MESSAGES", "TIMEOUT_MEMBERS", "VIEW_STAFF_CHANNELS", "POST_ANNOUNCEMENTS", "VIEW_BASIC_AUDIT",
  ],
  HOST: ["HOST_EVENTS", "MANAGE_EVENTS", "MANAGE_PARTICIPANTS", "MANAGE_BRACKETS", "VIEW_STAFF_CHANNELS", "POST_ANNOUNCEMENTS"],
  REFEREE: ["MANAGE_PARTICIPANTS", "MANAGE_BRACKETS", "VIEW_STAFF_CHANNELS"],
  VIEWER: [],
};

export const HIGH_RISK_PLATFORM_PERMISSIONS: readonly PlatformPermission[] = ["VIEW_FULL_AUDIT", "ASSIGN_HIGH_ROLES", "EDIT_ACCESS_PERMISSIONS", "MANAGE_OWNERS"];
export const HIGH_RISK_WORKSPACE_PERMISSIONS: readonly WorkspacePermission[] = ["VIEW_FULL_AUDIT", "ASSIGN_HIGH_ROLES", "EDIT_ACCESS_PERMISSIONS", "MANAGE_OWNERS"];

export function parsePermissionOverrides<T extends string>(value: string | null | undefined, allowed: readonly T[]): PermissionOverrides<T> {
  if (!value) return { grants: [], denies: [] };
  try {
    const parsed = JSON.parse(value) as Partial<PermissionOverrides<string>>;
    const allowedSet = new Set<string>(allowed);
    return {
      grants: Array.isArray(parsed.grants) ? parsed.grants.filter((item): item is T => typeof item === "string" && allowedSet.has(item)) : [],
      denies: Array.isArray(parsed.denies) ? parsed.denies.filter((item): item is T => typeof item === "string" && allowedSet.has(item)) : [],
    };
  } catch {
    return { grants: [], denies: [] };
  }
}

export function getEffectivePermissions<T extends string>(defaults: readonly T[], overrides: PermissionOverrides<T>, allowed: readonly T[]): T[] {
  const result = new Set<T>(defaults);
  for (const permission of overrides.denies) result.delete(permission);
  for (const permission of overrides.grants) result.add(permission);
  return allowed.filter((permission) => result.has(permission));
}

export function buildPermissionOverrides<T extends string>(defaults: readonly T[], selected: readonly T[], allowed: readonly T[]): PermissionOverrides<T> {
  const defaultSet = new Set<T>(defaults);
  const selectedSet = new Set<T>(selected);
  return {
    grants: allowed.filter((permission) => selectedSet.has(permission) && !defaultSet.has(permission)),
    denies: allowed.filter((permission) => defaultSet.has(permission) && !selectedSet.has(permission)),
  };
}
