import {
  bracketChampion,
  deriveExpandedCompetitionMatches,
  deriveSingleElimination,
  expandedFormatLabel,
  getMatchSlotLabel,
  resolveThreePlayerAdvancement,
  type BracketDraft,
} from "@/components/bracket/bracket-model";

type BracketExportInput = { draft: BracketDraft };

function truncate(value: string, length = 26): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  context.stroke();
}

function finishDownload(canvas: HTMLCanvasElement, title: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(title || "gamenight-competition").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gamenight-competition"}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

export function downloadBracketPng({ draft }: BracketExportInput): string | null {
  if (draft.format === "single" && !draft.firstRound.length) return "Generate the bracket before exporting it.";
  if (draft.format === "three" && draft.participants.length !== 3) return "Three-player mode requires exactly three entrants.";
  if (["double", "round_robin", "groups"].includes(draft.format) && !draft.competitionMatches?.length) return "Generate the competition before exporting it.";

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return "Your browser could not create the PNG.";

  if (draft.format === "three") {
    const result = resolveThreePlayerAdvancement(draft.participants, draft.threeWinners);
    canvas.width = 1200;
    canvas.height = 900;
    context.fillStyle = "#090b12"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f4f6fb"; context.font = "700 44px system-ui"; context.fillText(draft.title || "Three-Player Tournament", 60, 75);
    context.fillStyle = "#aab2c8"; context.font = "22px system-ui"; context.fillText("Custom three-player advancement bracket", 60, 112);
    const matches = [
      { label: "Match 1", a: result.playerA, b: result.playerB, winner: result.m1Winner },
      { label: "Match 2", a: result.playerC, b: result.m1Loser, winner: result.m2Winner },
      { label: "Match 3", a: result.playerC, b: result.m1Winner, winner: result.m3Winner },
    ];
    matches.forEach((match, index) => {
      const x = 70 + index * 375; const y = 210;
      context.fillStyle = "#171c2c"; context.strokeStyle = "#2b3247"; context.lineWidth = 2; drawRoundedRect(context, x, y, 320, 230, 18);
      context.fillStyle = "#b8a9ff"; context.font = "700 18px system-ui"; context.fillText(match.label.toUpperCase(), x + 22, y + 38);
      context.font = "600 25px system-ui"; context.fillStyle = match.winner?.id === match.a?.id ? "#63d3a5" : "#f4f6fb"; context.fillText(truncate(match.a?.name ?? "TBD", 20), x + 22, y + 94);
      context.fillStyle = "#aab2c8"; context.font = "18px system-ui"; context.fillText("VS", x + 22, y + 128);
      context.font = "600 25px system-ui"; context.fillStyle = match.winner?.id === match.b?.id ? "#63d3a5" : "#f4f6fb"; context.fillText(truncate(match.b?.name ?? "TBD", 20), x + 22, y + 174);
    });
    context.fillStyle = "#111522"; context.strokeStyle = "#7c5cff"; drawRoundedRect(context, 70, 520, 1060, 250, 18);
    context.fillStyle = "#b8a9ff"; context.font = "700 18px system-ui"; context.fillText("ADVANCEMENT RESULT", 100, 565);
    context.fillStyle = "#f4f6fb"; context.font = "700 38px system-ui"; context.fillText(result.champion ? `${truncate(result.champion.name, 35)} advances` : "Result pending", 100, 625);
    context.fillStyle = "#aab2c8"; context.font = "21px system-ui"; context.fillText(truncate(result.reason, 90), 100, 680);
    finishDownload(canvas, draft.title);
    return null;
  }

  if (draft.format === "single") {
    const rounds = deriveSingleElimination(draft.firstRound, draft.winners);
    const champion = rounds.at(-1)?.[0]?.winner ?? null;
    const firstMatches = rounds[0].length; const columnWidth = 285; const top = 150; const usableHeight = Math.max(560, firstMatches * 105);
    canvas.width = Math.max(1100, rounds.length * columnWidth + 120); canvas.height = top + usableHeight + 150;
    context.fillStyle = "#090b12"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f4f6fb"; context.font = "700 44px system-ui"; context.fillText(draft.title || "Game Night Tournament", 55, 70);
    context.fillStyle = "#aab2c8"; context.font = "21px system-ui"; context.fillText(`${draft.participants.length} entrants • ${draft.seedingMode === "random" ? "Random placement" : "Host placement"}`, 55, 108);
    rounds.forEach((round, roundIndex) => {
      const x = 55 + roundIndex * columnWidth; context.fillStyle = "#b8a9ff"; context.font = "700 17px system-ui";
      context.fillText(roundIndex === rounds.length - 1 ? "FINAL" : `ROUND ${roundIndex + 1}`, x, 142);
      const spacing = usableHeight / round.length;
      round.forEach((match, matchIndex) => {
        const y = top + spacing * matchIndex + spacing / 2 - 38;
        context.fillStyle = "#171c2c"; context.strokeStyle = match.winner ? "#7c5cff" : "#2b3247"; drawRoundedRect(context, x, y, 235, 76, 12);
        context.strokeStyle = "#2b3247"; context.beginPath(); context.moveTo(x, y + 38); context.lineTo(x + 235, y + 38); context.stroke();
        context.font = "600 17px system-ui"; context.fillStyle = match.winner?.id === match.a?.id ? "#63d3a5" : "#f4f6fb"; context.fillText(truncate(getMatchSlotLabel(match, "a"), 22), x + 12, y + 25);
        context.fillStyle = match.winner?.id === match.b?.id ? "#63d3a5" : "#f4f6fb"; context.fillText(truncate(getMatchSlotLabel(match, "b"), 22), x + 12, y + 63);
      });
    });
    context.fillStyle = "#111522"; context.strokeStyle = "#7c5cff"; drawRoundedRect(context, 55, canvas.height - 110, Math.min(canvas.width - 110, 700), 65, 14);
    context.fillStyle = "#b8a9ff"; context.font = "700 16px system-ui"; context.fillText("CHAMPION", 75, canvas.height - 82);
    context.fillStyle = "#f4f6fb"; context.font = "700 25px system-ui"; context.fillText(champion ? truncate(champion.name, 38) : "Tournament in progress", 190, canvas.height - 74);
    finishDownload(canvas, draft.title);
    return null;
  }

  const matches = deriveExpandedCompetitionMatches(draft).filter((match) => match.active);
  const champion = bracketChampion(draft);
  const rows = Math.ceil(matches.length / 2);
  canvas.width = 1500;
  canvas.height = Math.max(900, 210 + rows * 150 + 140);
  context.fillStyle = "#090b12"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f4f6fb"; context.font = "700 46px system-ui"; context.fillText(draft.title || "Game Night Competition", 60, 76);
  context.fillStyle = "#aab2c8"; context.font = "22px system-ui"; context.fillText(`${expandedFormatLabel(draft.format)} • ${draft.participants.length} ${draft.entrantMode === "team" ? "teams" : "entrants"}`, 60, 116);
  if (champion) { context.fillStyle = "#63d3a5"; context.font = "700 24px system-ui"; context.fillText(`Champion: ${truncate(champion.name, 44)}`, 60, 158); }
  else { context.fillStyle = "#b8a9ff"; context.font = "700 20px system-ui"; context.fillText("Competition in progress", 60, 158); }

  matches.forEach((match, index) => {
    const column = index % 2; const row = Math.floor(index / 2); const x = 60 + column * 710; const y = 205 + row * 150;
    context.fillStyle = "#171c2c"; context.strokeStyle = match.winner ? "#7c5cff" : "#2b3247"; context.lineWidth = 2; drawRoundedRect(context, x, y, 660, 120, 15);
    context.fillStyle = "#b8a9ff"; context.font = "700 16px system-ui"; context.fillText(truncate(match.group ? `${match.label} · Group ${match.group}` : match.label, 54).toUpperCase(), x + 18, y + 26);
    context.font = "600 20px system-ui"; context.fillStyle = match.winner?.id === match.a?.id ? "#63d3a5" : "#f4f6fb"; context.fillText(truncate(match.a?.name ?? (match.aReady ? "BYE" : "TBD"), 35), x + 18, y + 61);
    context.fillStyle = match.winner?.id === match.b?.id ? "#63d3a5" : "#f4f6fb"; context.fillText(truncate(match.b?.name ?? (match.bReady ? "BYE" : "TBD"), 35), x + 18, y + 96);
  });

  finishDownload(canvas, draft.title);
  return null;
}
