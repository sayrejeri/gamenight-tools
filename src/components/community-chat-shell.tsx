"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ScopeType = "WORKSPACE" | "TEAM";
type ChannelType = "CHAT" | "ANNOUNCEMENT" | "STAFF";

type Channel = {
  id: string;
  name: string;
  slug: string;
  channelType: ChannelType;
  topic: string | null;
  position: number;
  slowmodeSeconds: number;
  unreadCount: number;
  pinnedCount: number;
};

type Permissions = {
  canSend: boolean;
  canManageChannels: boolean;
  canManageMessages: boolean;
  canTimeoutMembers: boolean;
  canViewStaffChannels: boolean;
  canPostAnnouncements: boolean;
};

type Reaction = { emoji: string; count: number; reacted: boolean };
type Message = {
  id: string;
  channelId: string;
  authorUserId: string;
  author: { displayName: string; siteUsername: string | null; discordUsername: string; avatarUrl: string | null };
  body: string | null;
  isAnnouncement: boolean;
  isPinned: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  reply: { id: string; authorName: string | null; body: string | null } | null;
  reactions: Reaction[];
};

type ChannelResponse = {
  scope: { type: ScopeType; id: string; name: string; chatEnabled: boolean };
  permissions: Permissions;
  channels: Channel[];
  error?: string;
};

type MessagesResponse = {
  channel: { id: string; name: string; channelType: ChannelType; topic: string | null; slowmodeSeconds: number };
  permissions: Pick<Permissions, "canSend" | "canManageMessages" | "canTimeoutMembers" | "canPostAnnouncements">;
  timeout: { expiresAt: string; reason: string | null } | null;
  messages: Message[];
  error?: string;
};

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "🎮", "🏆"];

function channelIcon(type: ChannelType) {
  if (type === "ANNOUNCEMENT") return "📣";
  if (type === "STAFF") return "🔒";
  return "#";
}

function formatTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return date.toLocaleString(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function CommunityChatShell({
  scopeType,
  scopeId,
  currentUserId,
  initialChannelId,
}: {
  scopeType: ScopeType;
  scopeId: string;
  currentUserId: string;
  initialChannelId?: string | null;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [scopeName, setScopeName] = useState("");
  const [chatEnabled, setChatEnabled] = useState(true);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(initialChannelId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagePermissions, setMessagePermissions] = useState<MessagesResponse["permissions"] | null>(null);
  const [timeout, setTimeout] = useState<MessagesResponse["timeout"]>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showChannelCreator, setShowChannelCreator] = useState(false);
  const [showChannelEditor, setShowChannelEditor] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollRef = useRef(true);

  const activeChannel = useMemo(() => channels.find((channel) => channel.id === activeChannelId) ?? null, [channels, activeChannelId]);

  const loadChannels = useCallback(async (preserveSelection = true) => {
    const response = await fetch(`/api/community/channels?scopeType=${scopeType}&scopeId=${encodeURIComponent(scopeId)}`, { cache: "no-store" });
    const body = await response.json() as ChannelResponse;
    if (!response.ok) throw new Error(body.error ?? "Community channels could not be loaded.");
    setScopeName(body.scope.name);
    setChatEnabled(body.scope.chatEnabled);
    setPermissions(body.permissions);
    setChannels(body.channels);
    setActiveChannelId((current) => {
      if (preserveSelection && current && body.channels.some((channel) => channel.id === current)) return current;
      if (initialChannelId && body.channels.some((channel) => channel.id === initialChannelId)) return initialChannelId;
      return body.channels.find((channel) => channel.unreadCount > 0)?.id ?? body.channels[0]?.id ?? null;
    });
  }, [scopeId, scopeType, initialChannelId]);

  const markRead = useCallback(async (channelId: string) => {
    await fetch("/api/community/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    }).catch(() => null);
  }, []);

  const loadMessages = useCallback(async (channelId: string, scroll = false) => {
    const response = await fetch(`/api/community/messages?channelId=${encodeURIComponent(channelId)}`, { cache: "no-store" });
    const body = await response.json() as MessagesResponse;
    if (!response.ok) throw new Error(body.error ?? "Messages could not be loaded.");
    setMessages(body.messages);
    setMessagePermissions(body.permissions);
    setTimeout(body.timeout);
    if (scroll) shouldScrollRef.current = true;
    await markRead(channelId);
    setChannels((current) => current.map((channel) => channel.id === channelId ? { ...channel, unreadCount: 0 } : channel));
  }, [markRead]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadChannels(false)
      .catch((error) => { if (!cancelled) setStatus(error instanceof Error ? error.message : "Community chat could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadChannels]);

  useEffect(() => {
    if (!activeChannelId) { setMessages([]); return; }
    shouldScrollRef.current = true;
    setReplyTo(null);
    setPinnedOnly(false);
    loadMessages(activeChannelId, true).catch((error) => setStatus(error instanceof Error ? error.message : "Messages could not be loaded."));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadMessages(activeChannelId).catch(() => null);
        loadChannels(true).catch(() => null);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeChannelId, loadMessages, loadChannels]);

  useEffect(() => {
    if (shouldScrollRef.current) {
      endRef.current?.scrollIntoView({ block: "end" });
      shouldScrollRef.current = false;
    }
  }, [messages]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeChannelId || !draft.trim() || sending) return;
    setSending(true); setStatus("");
    try {
      const response = await fetch("/api/community/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: activeChannelId, body: draft.trim(), replyToMessageId: replyTo?.id ?? null }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Message could not be sent.");
      setDraft(""); setReplyTo(null); shouldScrollRef.current = true;
      await Promise.all([loadMessages(activeChannelId, true), loadChannels(true)]);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Message could not be sent."); }
    finally { setSending(false); }
  }

  async function editMessage(message: Message) {
    if (!message.body) return;
    const next = window.prompt("Edit message", message.body);
    if (next === null || !next.trim() || next.trim() === message.body) return;
    const response = await fetch(`/api/community/messages/${message.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: next.trim() }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) return setStatus(body.error ?? "Message could not be edited.");
    if (activeChannelId) await loadMessages(activeChannelId);
  }

  async function deleteMessage(message: Message) {
    const moderating = message.authorUserId !== currentUserId;
    if (!window.confirm(moderating ? `Remove ${message.author.displayName}'s message?` : "Delete your message?")) return;
    const reason = moderating ? (window.prompt("Optional moderation reason", "") ?? "") : "";
    const response = await fetch(`/api/community/messages/${message.id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) return setStatus(body.error ?? "Message could not be deleted.");
    if (activeChannelId) await loadMessages(activeChannelId);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const response = await fetch(`/api/community/messages/${messageId}/reactions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }),
    });
    if (response.ok && activeChannelId) await loadMessages(activeChannelId);
  }

  async function togglePin(message: Message) {
    const response = await fetch(`/api/community/messages/${message.id}/pin`, { method: "POST" });
    const body = await response.json() as { error?: string };
    if (!response.ok) return setStatus(body.error ?? "Pin could not be changed.");
    if (activeChannelId) await Promise.all([loadMessages(activeChannelId), loadChannels(true)]);
  }

  async function reportMessage(message: Message) {
    const details = window.prompt("Tell platform staff what is wrong with this message. Do not include passwords or other secrets.", "");
    if (details === null) return;
    const response = await fetch("/api/reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "MESSAGE", targetId: message.id, reason: "OTHER", details: details.trim() }),
    });
    const body = await response.json() as { error?: string };
    setStatus(response.ok ? "Message reported to platform staff." : (body.error ?? "Report could not be submitted."));
  }

  async function timeoutMember(message: Message) {
    const rawMinutes = window.prompt(`Timeout ${message.author.displayName} for how many minutes?`, "10");
    if (rawMinutes === null) return;
    const durationMinutes = Number(rawMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 10080) {
      setStatus("Enter a timeout from 1 minute to 10,080 minutes (7 days)."); return;
    }
    const reason = window.prompt("Optional timeout reason", "") ?? "";
    const response = await fetch("/api/community/timeouts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeType, scopeId, userId: message.authorUserId, durationMinutes, reason }),
    });
    const body = await response.json() as { error?: string };
    setStatus(response.ok ? `${message.author.displayName} was timed out.` : (body.error ?? "Timeout could not be applied."));
  }

  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/community/channels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scopeType,
        scopeId,
        name: form.get("name"),
        channelType: form.get("channelType"),
        topic: form.get("topic"),
        slowmodeSeconds: Number(form.get("slowmodeSeconds") ?? 0),
      }),
    });
    const body = await response.json() as { error?: string; id?: string };
    if (!response.ok) return setStatus(body.error ?? "Channel could not be created.");
    event.currentTarget.reset(); setShowChannelCreator(false); await loadChannels(false); if (body.id) setActiveChannelId(body.id);
  }

  async function updateChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeChannel) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/community/channels/${activeChannel.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"), channelType: form.get("channelType"), topic: form.get("topic"),
        slowmodeSeconds: Number(form.get("slowmodeSeconds") ?? 0), position: activeChannel.position,
      }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) return setStatus(body.error ?? "Channel could not be updated.");
    setShowChannelEditor(false); await loadChannels(true);
  }

  async function archiveChannel() {
    if (!activeChannel || !window.confirm(`Archive #${activeChannel.name}? Messages are retained but the channel will disappear from normal chat.`)) return;
    const response = await fetch(`/api/community/channels/${activeChannel.id}`, { method: "DELETE" });
    const body = await response.json() as { error?: string };
    if (!response.ok) return setStatus(body.error ?? "Channel could not be archived.");
    setActiveChannelId(null); await loadChannels(false);
  }

  const visibleMessages = pinnedOnly ? messages.filter((message) => message.isPinned && !message.deletedAt) : messages;

  if (loading) return <section className="panel"><p className="muted">Loading community chat…</p></section>;

  return (
    <div className="community-chat-layout">
      <aside className="chat-sidebar panel">
        <div className="chat-sidebar-heading"><div><span className="eyebrow">Community</span><h2>{scopeName || "Chat"}</h2></div>{permissions?.canManageChannels ? <button className="button button-secondary chat-small-button" type="button" onClick={() => setShowChannelCreator((value) => !value)}>+ Channel</button> : null}</div>
        {!chatEnabled ? <div className="error-banner">Chat is disabled for this community. A community manager can enable it from profile settings.</div> : null}
        {showChannelCreator ? <form className="chat-channel-form" onSubmit={createChannel}><input name="name" placeholder="Channel name" maxLength={80} required /><select name="channelType" defaultValue="CHAT"><option value="CHAT">Normal chat</option><option value="ANNOUNCEMENT">Announcements</option><option value="STAFF">Staff only</option></select><input name="topic" placeholder="Topic (optional)" maxLength={240} /><label>Slow mode (seconds)<input name="slowmodeSeconds" type="number" min="0" max="300" defaultValue="0" /></label><button className="button">Create channel</button></form> : null}
        <nav className="chat-channel-list" aria-label="Community channels">
          {channels.map((channel) => <button className={`chat-channel-button${channel.id === activeChannelId ? " active" : ""}`} type="button" key={channel.id} onClick={() => setActiveChannelId(channel.id)}><span>{channelIcon(channel.channelType)}</span><span className="chat-channel-name">{channel.name}</span>{channel.unreadCount > 0 ? <span className="chat-unread-count">{channel.unreadCount > 99 ? "99+" : channel.unreadCount}</span> : null}</button>)}
        </nav>
      </aside>

      <section className="chat-main panel">
        {activeChannel ? <>
          <header className="chat-room-header"><div><div className="chat-room-title"><span>{channelIcon(activeChannel.channelType)}</span><h2>{activeChannel.name}</h2>{activeChannel.slowmodeSeconds ? <span className="badge">Slow {activeChannel.slowmodeSeconds}s</span> : null}</div><p>{activeChannel.topic ?? (activeChannel.channelType === "STAFF" ? "Staff-only conversation" : "Community conversation")}</p></div><div className="button-row"><button className={`button button-secondary${pinnedOnly ? " active" : ""}`} type="button" onClick={() => setPinnedOnly((value) => !value)}>📌 {activeChannel.pinnedCount || "Pinned"}</button>{permissions?.canManageChannels ? <button className="button button-secondary" type="button" onClick={() => setShowChannelEditor((value) => !value)}>Channel settings</button> : null}</div></header>

          {showChannelEditor && permissions?.canManageChannels ? <form className="chat-channel-editor" onSubmit={updateChannel}><div className="two-column"><input name="name" defaultValue={activeChannel.name} required maxLength={80} /><select name="channelType" defaultValue={activeChannel.channelType}><option value="CHAT">Normal chat</option><option value="ANNOUNCEMENT">Announcements</option><option value="STAFF">Staff only</option></select></div><input name="topic" defaultValue={activeChannel.topic ?? ""} placeholder="Channel topic" maxLength={240} /><div className="button-row"><label className="chat-inline-field">Slow mode <input name="slowmodeSeconds" type="number" min="0" max="300" defaultValue={activeChannel.slowmodeSeconds} /></label><button className="button">Save channel</button><button className="button button-danger" type="button" onClick={archiveChannel}>Archive</button></div></form> : null}

          <div className="chat-message-list" aria-live="polite">
            {visibleMessages.length ? visibleMessages.map((message) => <article className={`chat-message${message.isPinned ? " pinned" : ""}${message.deletedAt ? " deleted" : ""}`} key={message.id}>
              {message.author.avatarUrl ? <img className="chat-avatar" src={message.author.avatarUrl} alt="" /> : <div className="chat-avatar avatar-fallback">{message.author.displayName.slice(0, 1)}</div>}
              <div className="chat-message-content">
                <div className="chat-message-meta"><strong>{message.author.displayName}</strong>{message.author.siteUsername ? <span>@{message.author.siteUsername}</span> : <span>@{message.author.discordUsername}</span>}<time>{formatTime(message.createdAt)}</time>{message.editedAt ? <span>edited</span> : null}{message.isAnnouncement ? <span className="badge">Announcement</span> : null}{message.isPinned ? <span className="badge">Pinned</span> : null}</div>
                {message.reply ? <button className="chat-reply-preview" type="button"><strong>↪ {message.reply.authorName ?? "Message"}</strong><span>{message.reply.body ?? "Original message was removed."}</span></button> : null}
                {message.deletedAt ? <p className="chat-deleted-message">Message removed.</p> : <p className="chat-message-body">{message.body}</p>}
                {!message.deletedAt ? <div className="chat-reaction-row">{message.reactions.map((reaction) => <button className={`chat-reaction${reaction.reacted ? " reacted" : ""}`} key={reaction.emoji} type="button" onClick={() => toggleReaction(message.id, reaction.emoji)}>{reaction.emoji} {reaction.count}</button>)}<details className="chat-reaction-picker"><summary>＋</summary><div>{QUICK_REACTIONS.map((emoji) => <button type="button" key={emoji} onClick={() => toggleReaction(message.id, emoji)}>{emoji}</button>)}</div></details></div> : null}
              </div>
              {!message.deletedAt ? <div className="chat-message-actions"><button type="button" onClick={() => setReplyTo(message)}>Reply</button>{message.authorUserId === currentUserId || messagePermissions?.canManageMessages ? <button type="button" onClick={() => editMessage(message)}>Edit</button> : null}{message.authorUserId === currentUserId || messagePermissions?.canManageMessages ? <button type="button" onClick={() => deleteMessage(message)}>Delete</button> : null}{messagePermissions?.canManageMessages ? <button type="button" onClick={() => togglePin(message)}>{message.isPinned ? "Unpin" : "Pin"}</button> : null}{message.authorUserId !== currentUserId ? <button type="button" onClick={() => reportMessage(message)}>Report</button> : null}{message.authorUserId !== currentUserId && messagePermissions?.canTimeoutMembers ? <button type="button" onClick={() => timeoutMember(message)}>Timeout</button> : null}</div> : null}
            </article>) : <div className="empty-state">{pinnedOnly ? "No pinned messages in this channel." : "No messages yet. Start the conversation."}</div>}
            <div ref={endRef} />
          </div>

          <footer className="chat-composer-area">
            {timeout ? <div className="error-banner">You are timed out until {new Date(timeout.expiresAt).toLocaleString()}{timeout.reason ? ` · ${timeout.reason}` : ""}.</div> : null}
            {replyTo ? <div className="chat-replying"><span>Replying to <strong>{replyTo.author.displayName}</strong>: {replyTo.body?.slice(0, 100)}</span><button type="button" onClick={() => setReplyTo(null)}>×</button></div> : null}
            {messagePermissions?.canSend ? <form className="chat-composer" onSubmit={sendMessage}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={activeChannel.channelType === "ANNOUNCEMENT" ? `Post an announcement in #${activeChannel.name}` : `Message #${activeChannel.name}`} maxLength={4000} rows={2} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="button" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button></form> : <div className="empty-state">You can read this channel, but you do not have permission to send messages here.</div>}
            <small className="muted">Use @siteusername to mention someone. Enter sends · Shift+Enter adds a new line.</small>
          </footer>
        </> : <div className="empty-state">No channel is available.</div>}
        {status ? <div className="chat-status" role="status">{status}<button type="button" onClick={() => setStatus("")}>×</button></div> : null}
      </section>
    </div>
  );
}
