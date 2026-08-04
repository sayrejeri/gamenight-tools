import type { Participant } from "@/components/bracket/bracket-model";

export function ThreeMatch({
  label,
  a,
  b,
  winner,
  onChoose,
}: {
  label: string;
  a: Participant | undefined | null;
  b: Participant | undefined | null;
  winner: Participant | null;
  onChoose: (participant: Participant) => void;
}) {
  return (
    <article className="match-card three-match">
      <span className="card-kicker">{label}</span>
      {[a, b].map((participant, index) => (
        <button
          className={`match-participant${winner?.id === participant?.id ? " winner" : ""}${!participant ? " bye" : ""}`}
          key={`${label}-${index}`}
          type="button"
          disabled={!a || !b || !participant}
          onClick={() => participant && onChoose(participant)}
        >
          <span>{participant?.name ?? "Waiting for prior result"}</span>
          {winner?.id === participant?.id ? <strong>Winner</strong> : null}
        </button>
      ))}
    </article>
  );
}
