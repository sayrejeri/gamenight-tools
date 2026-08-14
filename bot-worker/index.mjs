const APP_URL = (process.env.GNT_APP_URL || "").replace(/\/$/, "");
const WORKER_SECRET = process.env.BOT_WORKER_SECRET || "";
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const WORKER_ID = (process.env.BOT_WORKER_ID || `four-seasons-${process.pid}`).slice(0, 120);
const WORKER_VERSION = (process.env.BOT_WORKER_VERSION || "1.0.0-beta.1").slice(0, 40);
const POLL_MS = Math.max(5000, Math.min(60000, Number(process.env.BOT_POLL_SECONDS || 10) * 1000));
const SCHEDULE_MS = Math.max(30000, Math.min(300000, Number(process.env.BOT_SCHEDULE_SECONDS || 60) * 1000));
const DISCORD_API_BASE = "https://discord.com/api/v10";

if (!APP_URL || !WORKER_SECRET || !DISCORD_BOT_TOKEN) {
  console.error("Missing GNT_APP_URL, BOT_WORKER_SECRET, or DISCORD_BOT_TOKEN.");
  process.exit(1);
}

let stopping = false;
let lastScheduleAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function websiteRequest(path, body) {
  const response = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-gnt-bot-worker-secret": WORKER_SECRET,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; }
  catch { parsed = { error: text || `HTTP ${response.status}` }; }
  if (!response.ok) throw new Error(parsed.error || `Game Night Tools returned HTTP ${response.status}.`);
  return parsed;
}

async function discordRequest(path, options = {}, retried = false) {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (response.status === 429 && !retried) {
    const body = await response.json().catch(() => ({}));
    const retryAfterMs = Math.max(250, Math.min(15000, Number(body.retry_after || 1) * 1000));
    await sleep(retryAfterMs);
    return discordRequest(path, options, true);
  }

  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; }
  catch { body = text || null; }

  if (!response.ok) {
    const error = new Error(`Discord HTTP ${response.status}${body?.message ? `: ${body.message}` : ""}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function normalizeMessagePayload(payload) {
  const content = typeof payload?.content === "string" ? payload.content.slice(0, 1900) : undefined;
  const embeds = Array.isArray(payload?.embeds) ? payload.embeds.slice(0, 10) : undefined;
  if (!content && !embeds?.length) throw new Error("Bot job does not contain a message payload.");
  return {
    ...(content ? { content } : {}),
    ...(embeds?.length ? { embeds } : {}),
    allowed_mentions: { parse: [] },
  };
}

async function sendDirectMessage(discordUserId, payload) {
  if (!discordUserId) throw new Error("DM job has no Discord user ID.");
  const dm = await discordRequest("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!dm?.id) throw new Error("Discord did not return a DM channel.");
  await discordRequest(`/channels/${dm.id}/messages`, {
    method: "POST",
    body: JSON.stringify(normalizeMessagePayload(payload)),
  });
}

async function sendAnnouncement(channelId, payload) {
  if (!channelId) throw new Error("Announcement job has no configured Discord channel ID.");
  await discordRequest(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(normalizeMessagePayload(payload)),
  });
}

async function executeJob(job) {
  if (job.jobType.startsWith("DM_")) {
    await sendDirectMessage(job.targetDiscordId, job.payload);
    return;
  }
  if (job.jobType.startsWith("ANNOUNCE_")) {
    await sendAnnouncement(job.announcementChannelId, job.payload);
    return;
  }
  throw new Error(`Job type ${job.jobType} is queued before its worker handler is enabled.`);
}

function retryableError(error) {
  const status = Number(error?.status || 0);
  if (status === 400 || status === 401 || status === 403 || status === 404) return false;
  return true;
}

async function report(jobId, success, error = null) {
  await websiteRequest("/api/internal/bot/jobs/report", {
    jobId,
    success,
    retryable: error ? retryableError(error) : true,
    error: error ? String(error.message || error).slice(0, 1000) : null,
  });
}

async function runSchedulerIfDue() {
  const now = Date.now();
  if (now - lastScheduleAt < SCHEDULE_MS) return;
  const result = await websiteRequest("/api/internal/bot/schedule", { workerId: WORKER_ID });
  lastScheduleAt = now;
  if (result.queued) console.log(`[scheduler] queued ${result.queued} bot job(s)`);
}

async function runOnce() {
  await runSchedulerIfDue();
  const claim = await websiteRequest("/api/internal/bot/jobs/claim", {
    workerId: WORKER_ID,
    workerVersion: WORKER_VERSION,
    metadata: { node: process.version, platform: process.platform, arch: process.arch },
    limit: 10,
  });
  const jobs = Array.isArray(claim.jobs) ? claim.jobs : [];
  for (const job of jobs) {
    try {
      await executeJob(job);
      await report(job.id, true);
      console.log(`[sent] ${job.jobType} ${job.id}`);
    } catch (error) {
      console.error(`[failed] ${job.jobType} ${job.id}:`, error?.message || error);
      try { await report(job.id, false, error); }
      catch (reportError) { console.error(`[report-failed] ${job.id}:`, reportError?.message || reportError); }
    }
  }
  return jobs.length;
}

async function main() {
  console.log(`Game Night Tools bot worker ${WORKER_VERSION} started as ${WORKER_ID}. Polling every ${POLL_MS / 1000}s; scheduler every ${SCHEDULE_MS / 1000}s.`);
  while (!stopping) {
    try {
      const count = await runOnce();
      if (!count) await sleep(POLL_MS);
    } catch (error) {
      console.error("Worker poll failed:", error?.message || error);
      await sleep(Math.min(POLL_MS * 2, 60000));
    }
  }
  console.log("Game Night Tools bot worker stopped.");
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

await main();
