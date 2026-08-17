import { timingSafeEqual } from "node:crypto";

export function isAuthorizedBotWorker(request: Request): boolean {
  const expected = process.env.BOT_WORKER_SECRET?.trim();
  const provided = request.headers.get("x-gnt-bot-worker-secret")?.trim();
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
