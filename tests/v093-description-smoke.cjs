const assert = require("node:assert/strict");
const path = require("node:path");

const compiledPath = process.argv[2];
if (!compiledPath) throw new Error("Pass the compiled event-description.js path as argv[2].");
const description = require(path.resolve(compiledPath));

const context = {
  eventName: "Villagism PvP Tournament",
  eventStart: null,
  signupDeadline: null,
  checkInOpensAt: null,
  checkInDeadline: null,
  timezone: "America/Detroit",
  game: "Villagism",
  platform: "Roblox",
  format: "SINGLE_ELIMINATION",
  entrantMode: "PLAYER",
  seedingMode: "RANDOM",
  status: "SIGNUPS_OPEN",
  visibility: "SERVER",
  host: "Jeremiah",
  cohosts: ["Host Two", "Ref Three"],
  participants: 7,
  maxParticipants: 0,
  workspace: "Villagism",
};

assert.equal(description.resolveEventDescriptionValue("event.name", context), "Villagism PvP Tournament");
assert.equal(description.resolveEventDescriptionValue("event.format", context), "Single Elimination");
assert.equal(description.resolveEventDescriptionValue("event.entrant_mode", context), "Individual players");
assert.equal(description.resolveEventDescriptionValue("event.seeding", context), "Random");
assert.equal(description.resolveEventDescriptionValue("host", context), "Jeremiah");
assert.equal(description.resolveEventDescriptionValue("cohosts", context), "Host Two, Ref Three");
assert.equal(description.resolveEventDescriptionValue("participants", context), "7");
assert.equal(description.resolveEventDescriptionValue("max_participants", context), "Unlimited");
assert.equal(description.resolveEventDescriptionValue("event.start", context), "Not scheduled");
assert.equal(description.resolveEventDescriptionValue("event.deadline", context), "Not scheduled");
assert.equal(description.resolveEventDescriptionValue("event.signup_deadline", context), "Not scheduled");
assert.equal(description.resolveEventDescriptionValue("event.checkin_close", context), "Not scheduled");

const interpolated = description.interpolateEventDescription(
  "Hosted by {{host}} in {{workspace}}. {{participants}} / {{max_participants}}. {{unknown.value}}",
  context,
);
assert.equal(interpolated, "Hosted by Jeremiah in Villagism. 7 / Unlimited. {{unknown.value}}");

const plain = description.renderEventDescriptionPlainText(
  "# **Tournament**\n\n- *One loss*\n- __Random seeding__\n\n> Hosted by {{host}}\nUse `{{event.format}}` and ~~fight~~ compete.",
  context,
);
assert.equal(
  plain,
  "Tournament\n\n• One loss\n• Random seeding\n\nHosted by Jeremiah\nUse {{event.format}} and fight compete.",
);

const literalValueContext = { ...context, host: "a_b_c", cohosts: ["*Ace*", "Tick`Tock", "~~Ref~~"] };
const literalValuePlain = description.renderEventDescriptionPlainText(
  "**Host:** {{host}}\n**Co-hosts:** {{cohosts}}",
  literalValueContext,
);
assert.equal(literalValuePlain, "Host: a_b_c\nCo-hosts: *Ace*, Tick`Tock, ~~Ref~~");

const inlineCodePlain = description.renderEventDescriptionPlainText(
  "Inline `a_b_c`, `**not bold**`, and `{{host}}`; outside code: {{host}}.",
  literalValueContext,
);
assert.equal(inlineCodePlain, "Inline a_b_c, **not bold**, and {{host}}; outside code: a_b_c.");

const unknownTokenPlain = description.renderEventDescriptionPlainText(
  "Unknown {{future_a_b}} and spaced {{ future_more_values }} stay literal.",
  context,
);
assert.equal(unknownTokenPlain, "Unknown {{future_a_b}} and spaced {{ future_more_values }} stay literal.");

const combinedEmphasisPlain = description.renderEventDescriptionPlainText(
  "***Bold italic*** and **bold** plus *italic*.",
  context,
);
assert.equal(combinedEmphasisPlain, "Bold italic and bold plus italic.");

const nestedEmphasisPlain = description.renderEventDescriptionPlainText(
  "**bold and *italic*** plus *italic and **bold***, __underline and _italic___, and _italic and __underline___.",
  context,
);
assert.equal(
  nestedEmphasisPlain,
  "bold and italic plus italic and bold, underline and italic, and italic and underline.",
);

const capped = { ...context, maxParticipants: 32, cohosts: [] };
assert.equal(description.resolveEventDescriptionValue("max_participants", capped), "32");
assert.equal(description.resolveEventDescriptionValue("cohosts", capped), "None");

console.log("v0.9.3 event description smoke tests passed");
