import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { canManageSuggestions, getPlatformRole } from "@/lib/platform-access";
import { SuggestionsBoard } from "@/components/suggestions-board";

type SuggestionRow = RowDataPacket & {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  staff_note: string | null;
  author_name: string;
  score: number;
  upvotes: number;
  downvotes: number;
  viewer_vote: number;
  comment_count: number;
  created_at: Date;
  is_locked: number;
};
type CommentRow = RowDataPacket & { id: string; suggestion_id: string; body: string; author_name: string; is_staff_reply: number; created_at: Date };

export default async function SuggestionsPage() {
  const session = await requireSession();
  const [suggestions, comments, role] = await Promise.all([
    query<SuggestionRow[]>(
      `SELECT s.id, s.title, s.description, s.category, s.status, s.staff_note,
              COALESCE(u.site_username, u.global_name, u.username) AS author_name,
              COALESCE(SUM(sv.vote_value), 0) AS score,
              COALESCE(SUM(CASE WHEN sv.vote_value = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
              COALESCE(SUM(CASE WHEN sv.vote_value = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
              COALESCE(MAX(CASE WHEN sv.user_id = ? THEN sv.vote_value ELSE 0 END), 0) AS viewer_vote,
              (SELECT COUNT(*) FROM suggestion_comments sc WHERE sc.suggestion_id = s.id AND sc.is_deleted = 0) AS comment_count,
              s.created_at, s.is_locked
       FROM suggestions s
       INNER JOIN users u ON u.id = s.author_user_id
       LEFT JOIN suggestion_votes sv ON sv.suggestion_id = s.id
       WHERE s.scope_type = 'PLATFORM'
       GROUP BY s.id, s.title, s.description, s.category, s.status, s.staff_note,
                u.site_username, u.global_name, u.username, s.created_at, s.is_locked
       ORDER BY FIELD(s.status, 'IN_DEVELOPMENT', 'PLANNED', 'UNDER_REVIEW', 'NEW', 'NEEDS_INFO', 'RELEASED', 'DECLINED', 'DUPLICATE'), score DESC, s.created_at DESC
       LIMIT 100`,
      [session.userId],
    ),
    query<CommentRow[]>(
      `SELECT sc.id, sc.suggestion_id, sc.body,
              COALESCE(u.site_username, u.global_name, u.username) AS author_name,
              sc.is_staff_reply, sc.created_at
       FROM suggestion_comments sc INNER JOIN users u ON u.id = sc.author_user_id
       INNER JOIN suggestions s ON s.id = sc.suggestion_id
       WHERE s.scope_type = 'PLATFORM' AND sc.is_deleted = 0
       ORDER BY sc.created_at ASC`,
    ),
    getPlatformRole(session.userId),
  ]);

  const commentMap = new Map<string, CommentRow[]>();
  for (const comment of comments) commentMap.set(comment.suggestion_id, [...(commentMap.get(comment.suggestion_id) ?? []), comment]);

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Help shape the platform</span><h1>Suggestions</h1><p>Submit ideas, vote on what matters, discuss improvements, and follow features from review through release.</p></div></section>
      <SuggestionsBoard canManage={canManageSuggestions(role)} suggestions={suggestions.map((suggestion) => ({
        ...suggestion,
        score: Number(suggestion.score), upvotes: Number(suggestion.upvotes), downvotes: Number(suggestion.downvotes), viewer_vote: Number(suggestion.viewer_vote), comment_count: Number(suggestion.comment_count),
        created_at: new Date(suggestion.created_at).toISOString(),
        comments: (commentMap.get(suggestion.id) ?? []).map((comment) => ({ ...comment, created_at: new Date(comment.created_at).toISOString() })),
      }))} />
    </div>
  );
}
