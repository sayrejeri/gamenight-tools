const DISCORD_API_BASE = "https://discord.com/api/v10";

const PERMISSIONS = {
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  EMBED_LINKS: 1n << 14n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MANAGE_ROLES: 1n << 28n,
} as const;

export type DiscordBotValidationStatus = "PASS" | "WARN" | "FAIL" | "SKIP";

export type DiscordBotValidationCheck = {
  key: string;
  label: string;
  status: DiscordBotValidationStatus;
  detail: string;
};

export type DiscordBotValidationInput = {
  guildId: string;
  announcementsEnabled: boolean;
  temporaryMatchChannelsEnabled: boolean;
  roleSyncEnabled: boolean;
  announcementChannelId: string;
  matchCategoryId: string;
  competitorRoleId: string;
  championRoleId: string;
};

type DiscordRole = {
  id: string;
  name: string;
  position: number;
  permissions: string;
  managed: boolean;
};

type DiscordPermissionOverwrite = {
  id: string;
  type: 0 | 1;
  allow: string;
  deny: string;
};

type DiscordChannel = {
  id: string;
  guild_id?: string;
  name?: string;
  type: number;
  permission_overwrites?: DiscordPermissionOverwrite[];
};

type DiscordUser = { id: string; username?: string };
type DiscordMember = { roles: string[] };
type DiscordGuild = { id: string; name: string };

type DiscordFetchResult<T> = { ok: true; value: T } | { ok: false; status: number; detail: string };

function parsePermissions(value: string | undefined): bigint {
  try { return BigInt(value ?? "0"); }
  catch { return 0n; }
}

function hasPermission(permissions: bigint, permission: bigint): boolean {
  return (permissions & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR || (permissions & permission) === permission;
}

async function discordFetch<T>(path: string): Promise<DiscordFetchResult<T>> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return { ok: false, status: 500, detail: "DISCORD_BOT_TOKEN is not configured on this deployment." };
  try {
    const response = await fetch(`${DISCORD_API_BASE}${path}`, {
      headers: { Authorization: `Bot ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, status: response.status, detail: body ? body.slice(0, 240) : `Discord returned HTTP ${response.status}.` };
    }
    return { ok: true, value: await response.json() as T };
  } catch (error) {
    return { ok: false, status: 0, detail: error instanceof Error ? error.message : "Discord request failed." };
  }
}

function baseGuildPermissions(guildId: string, roles: DiscordRole[], memberRoleIds: string[]): bigint {
  let permissions = parsePermissions(roles.find((role) => role.id === guildId)?.permissions);
  for (const role of roles) {
    if (memberRoleIds.includes(role.id)) permissions |= parsePermissions(role.permissions);
  }
  return permissions;
}

function effectiveChannelPermissions(input: {
  guildId: string;
  botUserId: string;
  roles: DiscordRole[];
  memberRoleIds: string[];
  channel: DiscordChannel;
}): bigint {
  let permissions = baseGuildPermissions(input.guildId, input.roles, input.memberRoleIds);
  if (hasPermission(permissions, PERMISSIONS.ADMINISTRATOR)) return permissions;

  const overwrites = input.channel.permission_overwrites ?? [];
  const everyone = overwrites.find((overwrite) => overwrite.type === 0 && overwrite.id === input.guildId);
  if (everyone) permissions = (permissions & ~parsePermissions(everyone.deny)) | parsePermissions(everyone.allow);

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type !== 0 || !input.memberRoleIds.includes(overwrite.id)) continue;
    roleAllow |= parsePermissions(overwrite.allow);
    roleDeny |= parsePermissions(overwrite.deny);
  }
  permissions = (permissions & ~roleDeny) | roleAllow;

  const member = overwrites.find((overwrite) => overwrite.type === 1 && overwrite.id === input.botUserId);
  if (member) permissions = (permissions & ~parsePermissions(member.deny)) | parsePermissions(member.allow);
  return permissions;
}

function roleCheck(label: string, guildId: string, roleId: string, syncEnabled: boolean, roles: DiscordRole[], botHighestPosition: number, canManageRoles: boolean): DiscordBotValidationCheck {
  if (!roleId) {
    return {
      key: label.toLowerCase().replaceAll(" ", "-"),
      label,
      status: syncEnabled ? "WARN" : "SKIP",
      detail: syncEnabled ? `No ${label.toLowerCase()} is configured. That part of role sync will stay inactive.` : "No role configured.",
    };
  }
  if (roleId === guildId) return { key: roleId, label, status: "FAIL", detail: "@everyone cannot be used as a synchronized competition role." };
  const role = roles.find((item) => item.id === roleId);
  if (!role) return { key: roleId, label, status: "FAIL", detail: "Discord could not find this role in the connected server." };
  if (role.managed) return { key: roleId, label, status: "FAIL", detail: `${role.name} is managed by Discord/an integration and cannot be assigned normally.` };
  if (!canManageRoles) return { key: roleId, label, status: "FAIL", detail: "The bot does not currently have Manage Roles in this server." };
  if (role.position >= botHighestPosition) return { key: roleId, label, status: "FAIL", detail: `${role.name} is not below the bot's highest role. Move the bot role above it.` };
  return { key: roleId, label, status: "PASS", detail: `${role.name} exists and is below the bot's highest role.` };
}

export async function validateDiscordBotWorkspaceTargets(input: DiscordBotValidationInput): Promise<DiscordBotValidationCheck[]> {
  const checks: DiscordBotValidationCheck[] = [];
  const [guildResult, userResult, rolesResult] = await Promise.all([
    discordFetch<DiscordGuild>(`/guilds/${encodeURIComponent(input.guildId)}`),
    discordFetch<DiscordUser>("/users/@me"),
    discordFetch<DiscordRole[]>(`/guilds/${encodeURIComponent(input.guildId)}/roles`),
  ]);

  if (!guildResult.ok) {
    return [{ key: "guild", label: "Discord server", status: "FAIL", detail: `The bot cannot access this Discord server (${guildResult.status || "network error"}).` }];
  }
  checks.push({ key: "guild", label: "Discord server", status: "PASS", detail: `Connected to ${guildResult.value.name}.` });

  if (!userResult.ok || !rolesResult.ok) {
    checks.push({ key: "bot-access", label: "Bot access", status: "FAIL", detail: "Discord bot user/role information could not be read, so permissions cannot be validated." });
    return checks;
  }

  const memberResult = await discordFetch<DiscordMember>(`/guilds/${encodeURIComponent(input.guildId)}/members/${encodeURIComponent(userResult.value.id)}`);
  if (!memberResult.ok) {
    checks.push({ key: "bot-member", label: "Bot membership", status: "FAIL", detail: "The bot is not readable as a member of this server." });
    return checks;
  }

  const roles = rolesResult.value;
  const memberRoleIds = memberResult.value.roles;
  const basePermissions = baseGuildPermissions(input.guildId, roles, memberRoleIds);
  const botHighestPosition = roles
    .filter((role) => memberRoleIds.includes(role.id))
    .reduce((highest, role) => Math.max(highest, role.position), 0);
  const canManageRoles = hasPermission(basePermissions, PERMISSIONS.MANAGE_ROLES);

  if (input.announcementChannelId) {
    const channelResult = await discordFetch<DiscordChannel>(`/channels/${encodeURIComponent(input.announcementChannelId)}`);
    if (!channelResult.ok || channelResult.value.guild_id !== input.guildId) {
      checks.push({ key: "announcement-channel", label: "Announcement channel", status: "FAIL", detail: "The configured channel was not found in this connected Discord server." });
    } else if (![0, 5].includes(channelResult.value.type)) {
      checks.push({ key: "announcement-channel", label: "Announcement channel", status: "FAIL", detail: "Choose a normal text channel or announcement channel." });
    } else {
      const permissions = effectiveChannelPermissions({ guildId: input.guildId, botUserId: userResult.value.id, roles, memberRoleIds, channel: channelResult.value });
      const requiredPermissions: Array<[string, bigint]> = [
        ["View Channel", PERMISSIONS.VIEW_CHANNEL],
        ["Send Messages", PERMISSIONS.SEND_MESSAGES],
        ["Embed Links", PERMISSIONS.EMBED_LINKS],
        ["Read Message History", PERMISSIONS.READ_MESSAGE_HISTORY],
      ];
      const missing = requiredPermissions.filter(([, permission]) => !hasPermission(permissions, permission)).map(([name]) => name);
      checks.push({
        key: "announcement-channel",
        label: "Announcement channel",
        status: missing.length ? "FAIL" : "PASS",
        detail: missing.length ? `Missing effective permissions: ${missing.join(", ")}.` : `#${channelResult.value.name ?? "configured-channel"} is reachable with the required message permissions.`,
      });
    }
  } else {
    checks.push({ key: "announcement-channel", label: "Announcement channel", status: input.announcementsEnabled ? "FAIL" : "SKIP", detail: input.announcementsEnabled ? "Select an announcement channel before enabling announcements." : "Announcements are disabled and no channel is configured." });
  }

  if (input.matchCategoryId) {
    const categoryResult = await discordFetch<DiscordChannel>(`/channels/${encodeURIComponent(input.matchCategoryId)}`);
    if (!categoryResult.ok || categoryResult.value.guild_id !== input.guildId) {
      checks.push({ key: "match-category", label: "Match category", status: "FAIL", detail: "The configured category was not found in this connected Discord server." });
    } else if (categoryResult.value.type !== 4) {
      checks.push({ key: "match-category", label: "Match category", status: "FAIL", detail: "The configured ID is not a Discord category." });
    } else {
      const permissions = effectiveChannelPermissions({ guildId: input.guildId, botUserId: userResult.value.id, roles, memberRoleIds, channel: categoryResult.value });
      const valid = hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL) && hasPermission(permissions, PERMISSIONS.MANAGE_CHANNELS);
      checks.push({ key: "match-category", label: "Match category", status: valid ? "PASS" : "FAIL", detail: valid ? `${categoryResult.value.name ?? "Configured category"} is reachable and the bot can manage channels there.` : "The bot needs View Channel and Manage Channels for this category." });
    }
  } else {
    checks.push({ key: "match-category", label: "Match category", status: input.temporaryMatchChannelsEnabled ? "FAIL" : "SKIP", detail: input.temporaryMatchChannelsEnabled ? "Select a category before enabling temporary match channels." : "Temporary match channels are disabled and no category is configured." });
  }

  const validateRoles = input.roleSyncEnabled || Boolean(input.competitorRoleId || input.championRoleId);
  if (validateRoles) {
    checks.push(roleCheck("Competitor role", input.guildId, input.competitorRoleId, input.roleSyncEnabled, roles, botHighestPosition, canManageRoles));
    checks.push(roleCheck("Champion role", input.guildId, input.championRoleId, input.roleSyncEnabled, roles, botHighestPosition, canManageRoles));
  } else {
    checks.push({ key: "role-sync", label: "Synced roles", status: "SKIP", detail: "Role sync is disabled and no roles are configured." });
  }

  return checks;
}
