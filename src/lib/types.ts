export type WorkspaceRole = "OWNER" | "ADMIN" | "STAFF" | "HOST" | "REFEREE" | "VIEWER";
export type InviteCodeType = "STAFF" | "HOST" | "EVENT";
export type EventStatus =
  | "DRAFT"
  | "AWAITING_APPROVAL"
  | "SIGNUPS_OPEN"
  | "CHECK_IN_OPEN"
  | "LIVE"
  | "COMPLETED"
  | "CANCELLED";

export type EventVisibility = "SERVER" | "CODE_ONLY" | "UNLISTED" | "PUBLIC" | "STAFF_ONLY";

export type SessionUser = {
  userId: string;
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
};

export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type DiscordGuild = {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
};

export type DiscordConnection = {
  id: string;
  name: string;
  type: string;
  verified?: boolean;
  visibility?: number;
};
