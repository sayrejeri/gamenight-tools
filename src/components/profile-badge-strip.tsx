export type ProfileBadgeItem = {
  key: string;
  label: string;
  description: string;
  icon: string;
};

export function ProfileBadgeStrip({ badges }: { badges: ProfileBadgeItem[] }) {
  if (!badges.length) return null;
  return (
    <div className="profile-badge-strip" aria-label="Profile badges">
      {badges.map((badge) => (
        <span className="profile-mini-badge" key={badge.key} tabIndex={0} title={`${badge.label} — ${badge.description}`} aria-label={`${badge.label}: ${badge.description}`}>
          <span aria-hidden="true">{badge.icon}</span>
          <span className="profile-mini-badge-tooltip"><strong>{badge.label}</strong><small>{badge.description}</small></span>
        </span>
      ))}
    </div>
  );
}
