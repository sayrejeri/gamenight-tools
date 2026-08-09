import type { Participant } from "@/components/bracket/bracket-model";

export function ThreeMatch({
  label,
  a,
  b,
  winner,
  onChoose,
  readOnly = false,
  disabled = false,
}: {
  label: string;
  a: Participant | undefined | null;
  b: Participant | undefined | null;
  winner: Participant | null;
  onChoose?: (participant: Participant) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <article className="match-card three-match">
      <span className="card-kicker">{label}</span>
      {[a, b].map((participant, index) => {
        const content = (
          <>
            <span>{participant?.name ?? "Waiting for prior result"}</span>
            {winner?.id === participant?.id ? <strong>Winner</strong> : null}
          </>
        );
        const className = `match-participant${winner?.id === participant?.id ? " winner" : ""}${!participant ? " bye" : ""}`;
        if (readOnly) return <div className={className} key={`${label}-${index}`}>{content}</div>;
        return (
          <button
            className={className}
            key={`${label}-${index}`}
            type="button"
            disabled={disabled || !a || !b || !participant}
            onClick={() => participant && onChoose?.(participant)}
          >
            {content}
          </button>
        );
      })}
    </article>
  );
}
