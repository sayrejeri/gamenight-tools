import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const WEBHOOK_PREFIX = "gnt1";

function encryptionKey(): Buffer {
  const source = process.env.WEBHOOK_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!source || source.length < 32) {
    throw new Error("AUTH_SECRET or WEBHOOK_ENCRYPTION_KEY must contain at least 32 characters.");
  }
  return createHash("sha256").update(source).digest();
}

export function isDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "discord.com" || url.hostname === "discordapp.com")
      && /^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function webhookUrlHint(value: string): string {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const webhookId = parts.at(-2) ?? "unknown";
    return `Discord webhook …${webhookId.slice(-6)}`;
  } catch {
    return "Discord webhook";
  }
}

export function encryptWebhookUrl(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [WEBHOOK_PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptWebhookUrl(value: string): string {
  const [prefix, ivValue, tagValue, encryptedValue] = value.split(".");
  if (prefix !== WEBHOOK_PREFIX || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Stored webhook value is invalid.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

type DiscordWebhookMessage = {
  content?: string;
  username?: string | null;
  avatarUrl?: string | null;
  embed?: {
    title: string;
    description?: string;
    url?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  };
};

export async function sendDiscordWebhook(url: string, message: DiscordWebhookMessage): Promise<number> {
  if (!isDiscordWebhookUrl(url)) throw new Error("The saved Discord webhook URL is not valid.");
  const payload: Record<string, unknown> = {};
  if (message.content) payload.content = message.content;
  if (message.username) payload.username = message.username;
  if (message.avatarUrl) payload.avatar_url = message.avatarUrl;
  if (message.embed) {
    payload.embeds = [{
      title: message.embed.title,
      description: message.embed.description,
      url: message.embed.url,
      color: message.embed.color ?? 0x7c5cff,
      fields: message.embed.fields,
      timestamp: new Date().toISOString(),
    }];
  }

  const response = await fetch(`${url}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord returned ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`);
  }
  return response.status;
}
