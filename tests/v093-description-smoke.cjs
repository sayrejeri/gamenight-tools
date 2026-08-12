const assert = require("node:assert/strict");
const path = require("node:path");

const descriptionCompiledPath = process.argv[2];
const gameCompiledPath = process.argv[3];
if (!descriptionCompiledPath) throw new Error("Pass the compiled event-description.js path as argv[2].");
if (!gameCompiledPath) throw new Error("Pass the compiled event-game.js path as argv[3].");
const description = require(path.resolve(descriptionCompiledPath));
const eventGame = require(path.resolve(gameCompiledPath));

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

assert.equal(description.canOpenUnderscoreEmphasis("_italic_", 0), true);
assert.equal(description.canCloseUnderscoreEmphasis("_italic_", 7), true);
assert.equal(description.canOpenUnderscoreEmphasis("foo _italic_ bar", 4), true);
assert.equal(description.canOpenUnderscoreEmphasis("game_mode_value", 4), false);
assert.equal(description.canOpenUnderscoreEmphasis("a_b_c", 1), false);
assert.equal(description.canOpenUnderscoreEmphasis("https://example.test/a_b_c", 22), false);
assert.equal(description.canOpenUnderscoreEmphasis("__underline__", 0), true);
assert.equal(description.canCloseUnderscoreEmphasis("__underline__", 11), true);

assert.equal(
  eventGame.resolveUpdatedGameName({
    submittedSubgameName: null,
    submittedPlatformName: null,
    gameFieldsTouched: false,
    existingGameName: "Legacy Game",
    existingPlatformName: null,
    existingSubgameName: null,
  }),
  "Legacy Game",
);
assert.equal(
  eventGame.resolveUpdatedGameName({
    submittedSubgameName: null,
    submittedPlatformName: null,
    gameFieldsTouched: true,
    existingGameName: "Legacy Game",
    existingPlatformName: null,
    existingSubgameName: null,
  }),
  null,
);
assert.equal(
  eventGame.resolveUpdatedGameName({
    submittedSubgameName: "Current Game",
    submittedPlatformName: "Roblox",
    gameFieldsTouched: true,
    existingGameName: "Legacy Game",
    existingPlatformName: null,
    existingSubgameName: null,
  }),
  "Current Game",
);
assert.equal(
  eventGame.resolveUpdatedGameName({
    submittedSubgameName: null,
    submittedPlatformName: "Roblox",
    gameFieldsTouched: true,
    existingGameName: "Legacy Game",
    existingPlatformName: null,
    existingSubgameName: null,
  }),
  "Roblox",
);

const capped = { ...context, maxParticipants: 32, cohosts: [] };
assert.equal(description.resolveEventDescriptionValue("max_participants", capped), "32");
assert.equal(description.resolveEventDescriptionValue("cohosts", capped), "None");

console.log("v0.9.3 event description and legacy-game smoke tests passed");
