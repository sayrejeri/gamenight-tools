import type { DerivedMatch, Participant } from "@/components/bracket/bracket-model";

type BracketExportInput = {
  title: string;
  format: "single" | "three";
  seedingMode: "manual" | "random";
  participants: Participant[];
  rounds: DerivedMatch[][];
  champion: Participant | null;
  playerA?: Participant;
  playerB?: Participant;
  playerC?: Participant;
  m1Winner: Participant | null;
  m1Loser: Participant | null;
  m2Winner: Participant | null;
  m3Winner: Participant | null;
  threeChampion: Participant | null;
  threeReason: string;
};

function truncate(value: string, length = 26): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  context.stroke();
}

export function downloadBracketPng(input: BracketExportInput): string | null {
  if (input.format === "single" && !input.rounds.length) {
    return "Generate the bracket before exporting it.";
  }
  if (input.format === "three" && input.participants.length !== 3) {
    return "Three-player mode requires exactly three participants.";
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return "Your browser could not create the PNG.";

  if (input.format === "three") {
    canvas.width = 1200;
    canvas.height = 900;
    context.fillStyle = "#090b12";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f4f6fb";
    context.font = "700 44px system-ui";
    context.fillText(input.title || "Three-Player Tournament", 60, 75);
    context.fillStyle = "#aab2c8";
    context.font = "22px system-ui";
    context.fillText("Custom three-player advancement bracket", 60, 112);

    const matches = [
      { label: "Match 1", a: input.playerA, b: input.playerB, winner: input.m1Winner },
      { label: "Match 2", a: input.playerC, b: input.m1Loser, winner: input.m2Winner },
      { label: "Match 3", a: input.playerC, b: input.m1Winner, winner: input.m3Winner },
    ];

    matches.forEach((match, index) => {
      const x = 70 + index * 375;
      const y = 210;
      context.fillStyle = "#171c2c";
      context.strokeStyle = "#2b3247";
      context.lineWidth = 2;
      drawRoundedRect(context, x, y, 320, 230, 18);
      context.fillStyle = "#b8a9ff";
      context.font = "700 18px system-ui";
      context.fillText(match.label.toUpperCase(), x + 22, y + 38);
      context.font = "600 25px system-ui";
      context.fillStyle = match.winner?.id === match.a?.id ? "#63d3a5" : "#f4f6fb";
      context.fillText(truncate(match.a?.name ?? "TBD", 20), x + 22, y + 94);
      context.fillStyle = "#aab2c8";
      context.font = "18px system-ui";
      context.fillText("VS", x + 22, y + 128);
      context.font = "600 25px system-ui";
      context.fillStyle = match.winner?.id === match.b?.id ? "#63d3a5" : "#f4f6fb";
      context.fillText(truncate(match.b?.name ?? "TBD", 20), x + 22, y + 174);
    });

    context.fillStyle = "#111522";
    context.strokeStyle = "#7c5cff";
    drawRoundedRect(context, 70, 520, 1060, 250, 18);
    context.fillStyle = "#b8a9ff";
    context.font = "700 18px system-ui";
    context.fillText("ADVANCEMENT RESULT", 100, 565);
    context.fillStyle = "#f4f6fb";
    context.font = "700 38px system-ui";
    context.fillText(input.threeChampion ? `${truncate(input.threeChampion.name, 35)} advances` : "Result pending", 100, 625);
    context.fillStyle = "#aab2c8";
    context.font = "21px system-ui";
    const words = input.threeReason.split(" ");
    let line = "";
    let lineY = 675;
    for (const word of words) {
      const test = `${line}${word} `;
      if (context.measureText(test).width > 990) {
        context.fillText(line, 100, lineY);
        line = `${word} `;
        lineY += 32;
      } else {
        line = test;
      }
    }
    context.fillText(line, 100, lineY);
  } else {
    const firstMatches = input.rounds[0].length;
    const columnWidth = 285;
    const top = 150;
    const usableHeight = Math.max(560, firstMatches * 105);
    canvas.width = Math.max(1100, input.rounds.length * columnWidth + 120);
    canvas.height = top + usableHeight + 150;
    context.fillStyle = "#090b12";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f4f6fb";
    context.font = "700 44px system-ui";
    context.fillText(input.title || "Game Night Tournament", 55, 70);
    context.fillStyle = "#aab2c8";
    context.font = "21px system-ui";
    context.fillText(`${input.participants.length} participants • ${input.seedingMode === "random" ? "Random placement" : "Host placement"}`, 55, 108);

    input.rounds.forEach((round, roundIndex) => {
      const x = 55 + roundIndex * columnWidth;
      context.fillStyle = "#b8a9ff";
      context.font = "700 17px system-ui";
      const label = roundIndex === input.rounds.length - 1 ? "FINAL" : `ROUND ${roundIndex + 1}`;
      context.fillText(label, x, 142);

      const spacing = usableHeight / round.length;
      round.forEach((match, matchIndex) => {
        const y = top + spacing * matchIndex + spacing / 2 - 38;
        if (roundIndex > 0) {
          const previousSpacing = usableHeight / input.rounds[roundIndex - 1].length;
          const sourceY1 = top + previousSpacing * (matchIndex * 2) + previousSpacing / 2;
          const sourceY2 = top + previousSpacing * (matchIndex * 2 + 1) + previousSpacing / 2;
          const targetY = y + 38;
          context.strokeStyle = "#2b3247";
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(x - 35, sourceY1);
          context.lineTo(x - 18, sourceY1);
          context.lineTo(x - 18, targetY);
          context.lineTo(x, targetY);
          context.stroke();
          context.beginPath();
          context.moveTo(x - 35, sourceY2);
          context.lineTo(x - 18, sourceY2);
          context.lineTo(x - 18, targetY);
          context.stroke();
        }

        context.fillStyle = "#171c2c";
        context.strokeStyle = match.winner ? "#7c5cff" : "#2b3247";
        drawRoundedRect(context, x, y, 235, 76, 12);
        context.strokeStyle = "#2b3247";
        context.beginPath();
        context.moveTo(x, y + 38);
        context.lineTo(x + 235, y + 38);
        context.stroke();
        context.font = "600 17px system-ui";
        context.fillStyle = match.winner?.id === match.a?.id ? "#63d3a5" : "#f4f6fb";
        context.fillText(truncate(match.a?.name ?? "BYE", 22), x + 12, y + 25);
        context.fillStyle = match.winner?.id === match.b?.id ? "#63d3a5" : "#f4f6fb";
        context.fillText(truncate(match.b?.name ?? "BYE", 22), x + 12, y + 63);
      });
    });

    context.fillStyle = "#111522";
    context.strokeStyle = "#7c5cff";
    drawRoundedRect(context, 55, canvas.height - 110, Math.min(canvas.width - 110, 700), 65, 14);
    context.fillStyle = "#b8a9ff";
    context.font = "700 16px system-ui";
    context.fillText("CHAMPION", 75, canvas.height - 82);
    context.fillStyle = "#f4f6fb";
    context.font = "700 25px system-ui";
    context.fillText(input.champion ? truncate(input.champion.name, 38) : "Tournament in progress", 190, canvas.height - 74);
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(input.title || "gamenight-bracket").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gamenight-bracket"}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");

  return null;
}
