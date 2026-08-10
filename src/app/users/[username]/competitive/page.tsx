import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { getDiscordAvatarUrl, readSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { currentCompetitiveSeason, loadPlayerCompetitiveProfile, loadPlayerLeaderboard } from "@/lib/competitive-stats";
import { BrandMark } from "@/components/brand-mark";
import { LocalDateTime } from "@/components/local-date-time";

type UserRow = RowDataPacket & {
  id: string;
  discord_id: string;
  username: string;
  global_name: string | null;
  site_username: string;
  avatar_hash: string | null;
  banner_url: string | null;
  profile_visibility: "PUBLIC" | "MEMBERS" | "PRIVATE";
  account_status: string;
  show_event_history: number;
};
type BlockRow = RowDataPacket & { blocker_user_id: string; blocked_user_id: string };

export const dynamic = "force-dynamic";

export default async function CompetitiveProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const viewer = await readSession();
  const { username } = await params;
  const users = await query<UserRow[]>(
    `SELECT u.id, u.discord_id, u.username, u.global_name, u.site_username, u.avatar_hash, u.banner_url,
            u.profile_visibility, u.account_status, COALESCE(up.show_event_history, 1) AS show_event_history
     FROM users u LEFT JOIN user_preferences up ON up.user_id = u.id
     WHERE LOWER(u.site_username) = LOWER(?) LIMIT 1`,
    [username],
  );
  const user = users[0];
  if (!user || user.account_status !== "ACTIVE") notFound();
  const isOwner = viewer?.userId === user.id;
  if (user.profile_visibility === "PRIVATE" && !isOwner) notFound();
  if (user.profile_visibility === "MEMBERS" && !viewer) notFound();
  if (!user.show_event_history && !isOwner) notFound();

  if (viewer && !isOwner) {
    const blocked = await query<BlockRow[]>(
      `SELECT blocker_user_id, blocked_user_id FROM user_blocks
       WHERE (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?)`,
      [viewer.userId, user.id, user.id, viewer.userId],
    );
    if (blocked.length) notFound();
  }

  const season = currentCompetitiveSeason();
  const [profile, allLeaderboard, seasonLeaderboard] = await Promise.all([
    loadPlayerCompetitiveProfile(user.id),
    loadPlayerLeaderboard(),
    loadPlayerLeaderboard({ from: season.start, to: season.end }),
  ]);
  const allRankIndex = allLeaderboard.findIndex((row) => row.userId === user.id);
  const seasonRankIndex = seasonLeaderboard.findIndex((row) => row.userId === user.id);
  const avatarUrl = getDiscordAvatarUrl(user.discord_id, user.avatar_hash);
  const displayName = user.global_name ?? user.username;

  return (
    <main className="public-shell section-stack competitive-profile-page">
      <header className="public-topbar"><BrandMark href="/" /><div className="button-row"><Link className="button button-secondary" href={`/users/${user.site_username}`}>Main profile</Link>{viewer ? <Link className="button" href="/dashboard/leaderboards">Leaderboards</Link> : <a className="button" href="/api/auth/discord/login">Sign in</a>}</div></header>

      <section className="competitive-profile-hero" style={user.banner_url ? { backgroundImage: `linear-gradient(100deg, rgba(9,11,18,.96), rgba(9,11,18,.68)), url(${user.banner_url})` } : undefined}>
        <div className="profile-hero-user">{avatarUrl ? <img className="profile-avatar" src={avatarUrl} alt="" /> : <span className="profile-avatar avatar-fallback">{displayName.slice(0, 1).toUpperCase()}</span>}<div><span className="eyebrow">Competitive profile · @{user.site_username}</span><h1>{displayName}</h1><p>{profile.allTime.matches ? `${profile.allTime.matches} recorded competitive matches across ${profile.allTime.eventsPlayed} events.` : "No completed competitive matches have been recorded yet."}</p><div className="button-row">{allRankIndex >= 0 ? <span className="badge">All-time rank #{allRankIndex + 1}</span> : null}{seasonRankIndex >= 0 ? <span className="badge">{profile.seasonLabel} rank #{seasonRankIndex + 1}</span> : null}{profile.allTime.championships ? <span className="badge">🏆 {profile.allTime.championships} title{profile.allTime.championships === 1 ? "" : "s"}</span> : null}</div></div></div>
      </section>

      <div className="competitive-profile-stat-grid">
        <div className="stat-card"><span>Career record</span><strong>{profile.allTime.wins}–{profile.allTime.losses}</strong><small>{profile.allTime.winRate}% win rate</small></div>
        <div className="stat-card"><span>Championships</span><strong>{profile.allTime.championships}</strong><small>{profile.allTime.eventsPlayed} competitive events</small></div>
        <div className="stat-card"><span>Current streak</span><strong>{profile.allTime.currentStreakType ? `${profile.allTime.currentStreakType}${profile.allTime.currentStreak}` : "—"}</strong><small>Best win streak: W{profile.allTime.bestWinStreak}</small></div>
        <div className="stat-card"><span>Attendance reliability</span><strong>{profile.attendance.reliability == null ? "—" : `${profile.attendance.reliability}%`}</strong><small>{profile.attendance.checkedIn} check-ins · {profile.attendance.noShows} no-shows</small></div>
      </div>

      <div className="dashboard-grid">
        <section className="panel section-stack"><div><span className="eyebrow">Current season</span><h2>{profile.seasonLabel}</h2><p className="muted">Quarterly seasonal stats reset on the leaderboard without erasing career history.</p></div><div className="competitive-season-record"><strong>{profile.season.wins}–{profile.season.losses}</strong><span>{profile.season.winRate}% win rate · {profile.season.championships} titles · {profile.season.eventsPlayed} events</span></div>{seasonRankIndex >= 0 ? <Link className="button button-secondary" href="/dashboard/leaderboards?scope=season">View season leaderboard</Link> : null}</section>
        <section className="panel section-stack"><div><span className="eyebrow">Highlights</span><h2>Competitive badges</h2><p className="muted">Badges are earned automatically from verified tournament history.</p></div>{profile.badges.length ? <div className="competitive-badge-grid">{profile.badges.map((badge) => <div className="competitive-badge" key={badge.key}><span>{badge.icon}</span><div><strong>{badge.name}</strong><small>{badge.description}</small></div></div>)}</div> : <div className="empty-state">Competitive badges will appear as this player builds tournament history.</div>}</section>
      </div>

      {profile.games.length ? <section className="panel section-stack"><div className="section-header"><div><span className="eyebrow">Game breakdown</span><h2>Most-played games</h2><p>Competitive records grouped by the event game.</p></div></div><div className="competitive-game-grid">{profile.games.map((game) => <div className="competitive-game-card" key={game.gameName}><strong>{game.gameName}</strong><span>{game.wins}–{game.losses}</span><small>{game.matches} matches · {game.winRate}% win rate</small></div>)}</div></section> : null}

      <div className="dashboard-grid competitive-history-grid">
        <section className="panel section-stack"><div><span className="eyebrow">Tournament history</span><h2>Recent finishes</h2><p className="muted">Recorded match results by competitive event.</p></div>{profile.history.length ? <div className="competitive-history-list">{profile.history.map((event) => <Link className="competitive-history-row" href={`/dashboard/events/${event.eventId}`} key={event.eventId}><span>{event.champion ? "🏆" : "🎮"}</span><div><strong>{event.eventName}</strong><small>{event.workspaceName} · {event.gameName}</small></div><div><strong>{event.champion ? "Champion" : `${event.wins}–${event.losses}`}</strong><small><LocalDateTime value={event.eventStartsAt ? new Date(event.eventStartsAt).toISOString() : null} /></small></div></Link>)}</div> : <div className="empty-state">No completed tournament history yet.</div>}</section>
        <section className="panel section-stack"><div><span className="eyebrow">Match history</span><h2>Recent opponents</h2><p className="muted">Latest confirmed or staff-decided head-to-head results.</p></div>{profile.recentMatches.length ? <div className="competitive-recent-list">{profile.recentMatches.map((match) => <div className="competitive-recent-row" key={match.matchId}><span className={`competitive-result ${match.won ? "win" : "loss"}`}>{match.won ? "W" : "L"}</span><div><strong>vs {match.opponentName}</strong><small>{match.eventName} · {match.gameName}</small></div><LocalDateTime value={match.decidedAt.toISOString()} /></div>)}</div> : <div className="empty-state">No completed matches yet.</div>}</section>
      </div>
    </main>
  );
}
