import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { CornerUpLeft, Paperclip } from "lucide-react";

/**
 * The email conversation on an enquiry: what we sent from VenueFlow and what
 * the client replied (filed from the venue's inbox by server/inbox.ts).
 * Inbound mail is attacker-controlled, so only its plain text is ever shown —
 * rendered as text, never as HTML.
 */

export type ConversationMessage = {
  id: number;
  direction: string;
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  bodyText: string | null;
  fullText: string | null;
  attachments: unknown;
  messageId: string;
  references: string | null;
  receivedAt: Date | string;
};

/** "just now", "5 min ago", "2h ago", "yesterday", "3 days ago", then "6 Oct". */
export function timeAgo(when: Date | string, now = Date.now()): string {
  const t = new Date(when).getTime();
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(when).toLocaleDateString("en-NZ", { day: "numeric", month: "short", ...(days > 300 ? { year: "numeric" } : {}) });
}

/** Subject and threading headers for replying to a message. */
export function buildReply(msg: Pick<ConversationMessage, "subject" | "messageId" | "references">) {
  const base = (msg.subject ?? "").replace(/^\s*((re|aw|fw|fwd)\s*:\s*)+/i, "").trim();
  const refs = (msg.references ?? "").match(/<[^<>\s]+>/g) ?? [];
  return {
    subject: `Re: ${base || "Your enquiry"}`,
    inReplyTo: msg.messageId,
    references: Array.from(new Set([...refs, msg.messageId])).slice(-20),
  };
}

/** Latest message per enquiry, refreshed every couple of minutes. */
export function useReplyStatus(enabled = true) {
  const { data } = trpc.inbox.replyStatus.useQuery(undefined, {
    enabled,
    refetchInterval: 120_000,
    retry: false,
  });
  return useMemo(() => {
    const map = new Map<number, { direction: "in" | "out"; at: Date }>();
    for (const r of data ?? []) map.set(r.leadId, { direction: r.direction, at: new Date(r.at) });
    return map;
  }, [data]);
}

/** Compact chip for list rows: the client's email is the latest word. */
export function RepliedChip({ at, name }: { at: Date; name?: string }) {
  const label = `${name ? `${name} replied` : "Client replied"} ${timeAgo(at)} — awaiting your reply`;
  return (
    <span title={label}
      className="font-bebas text-[10px] tracking-widest px-1.5 py-0.5 rounded bg-sage-tint text-sage-dark whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1">
      <CornerUpLeft className="w-3 h-3" aria-hidden="true" />
      REPLIED<span className="sr-only"> — awaiting your reply</span>
    </span>
  );
}

function attachmentNames(a: unknown): string[] {
  if (!Array.isArray(a)) return [];
  return a.map((x: any) => String(x?.filename ?? "")).filter(Boolean).slice(0, 20);
}

const COLLAPSED_CHARS = 420;
const RECENT = 3;

function MessageCard({ msg, clientFirstName, onReply }: {
  msg: ConversationMessage;
  clientFirstName: string;
  onReply?: (msg: ConversationMessage) => void;
}) {
  const inbound = msg.direction === "in";
  const body = (msg.bodyText ?? "").trim();
  const long = body.length > COLLAPSED_CHARS || body.split("\n").length > 8;
  const [expanded, setExpanded] = useState(false);
  // The whole email as received, quoted history included (when it had any).
  const [withQuotes, setWithQuotes] = useState(false);
  const shown = withQuotes && msg.fullText ? msg.fullText.trim()
    : expanded || !long ? body : `${body.slice(0, COLLAPSED_CHARS).trimEnd()}…`;
  const files = attachmentNames(msg.attachments);
  const who = inbound ? (clientFirstName || msg.fromName || msg.fromEmail || "Client") : "You";
  const when = timeAgo(msg.receivedAt);
  const exact = new Date(msg.receivedAt).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <li className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
      <article
        aria-label={`${inbound ? `${who} replied` : "You emailed"} ${when}`}
        className={`w-[92%] sm:w-[85%] border rounded-md px-3 py-2.5 ${inbound ? "bg-white border-stone-300" : "bg-sage-tint border-transparent"}`}>
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <span className={`font-bebas tracking-widest text-[11px] ${inbound ? "text-forest" : "text-sage-dark"}`}>
            {inbound ? `${who.toUpperCase()} REPLIED` : "YOU EMAILED"} · <time dateTime={new Date(msg.receivedAt).toISOString()} title={exact} className="normal-case">{when}</time>
          </span>
          {inbound && msg.fromEmail && (
            <span className="font-dm text-[11px] text-stone-600 truncate max-w-full">{msg.fromEmail}</span>
          )}
        </div>
        {msg.subject && <div className="font-dm text-sm font-semibold text-ink mt-1 break-words">{msg.subject}</div>}
        {shown && <p className="font-dm text-sm text-ink mt-1 whitespace-pre-wrap break-words leading-relaxed">{shown}</p>}
        {files.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Attachments">
            {files.map((f, i) => (
              <li key={i} title="Attachment names only — open the email in your inbox to download"
                className="inline-flex items-center gap-1 font-dm text-[11px] text-stone-700 bg-linen border border-stone-200 rounded px-1.5 py-0.5 max-w-full">
                <Paperclip className="w-3 h-3 flex-shrink-0" aria-hidden="true" /><span className="truncate">{f}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap">
          {long && !withQuotes && (
            <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
              className="font-bebas tracking-widest text-[11px] text-forest hover:underline focus-visible:outline-2 focus-visible:outline-forest">
              {expanded ? "SHOW LESS" : "SHOW FULL EMAIL"}
            </button>
          )}
          {msg.fullText && (
            <button type="button" onClick={() => setWithQuotes(v => !v)} aria-pressed={withQuotes}
              className="font-bebas tracking-widest text-[11px] text-forest hover:underline focus-visible:outline-2 focus-visible:outline-forest">
              {withQuotes ? "HIDE QUOTED EMAILS" : "SHOW QUOTED EMAILS"}
            </button>
          )}
          {inbound && onReply && (
            <button type="button" onClick={() => onReply(msg)}
              className="ml-auto inline-flex items-center gap-1 font-bebas tracking-widest text-[11px] px-2.5 py-1 border border-forest text-forest hover:bg-sage-tint focus-visible:outline-2 focus-visible:outline-forest">
              <CornerUpLeft className="w-3 h-3" aria-hidden="true" /> REPLY
            </button>
          )}
        </div>
      </article>
    </li>
  );
}

export default function LeadConversation({ leadId, clientFirstName, onReply, className = "" }: {
  leadId: number;
  clientFirstName?: string | null;
  /** Opens the email composer prefilled as a reply. Omit to hide Reply. */
  onReply?: (msg: ConversationMessage, reply: ReturnType<typeof buildReply>) => void;
  className?: string;
}) {
  const { data, isLoading, isError } = trpc.inbox.forLead.useQuery({ leadId }, {
    enabled: !!leadId,
    refetchInterval: 60_000,
    retry: false,
  });
  const messages = (data ?? []) as ConversationMessage[];
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setShowAll(false); }, [leadId]);
  const last = messages[messages.length - 1];
  const awaiting = last?.direction === "in";
  const first = (clientFirstName ?? "").trim();

  // Latest few by default; older ones behind a button rather than a nested scroll.
  const hidden = showAll ? 0 : Math.max(0, messages.length - RECENT);
  const visible = messages.slice(hidden);

  if (isError) return null;

  return (
    <section aria-labelledby={`convo-${leadId}`} className={className}>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 id={`convo-${leadId}`} className="font-bebas text-xs tracking-widest text-ink">
          CONVERSATION{messages.length ? ` · ${messages.length}` : ""}
        </h3>
        {awaiting ? (
          <span className="font-bebas text-[11px] tracking-widest px-2 py-0.5 rounded bg-sage-tint text-sage-dark">
            AWAITING YOUR REPLY
          </span>
        ) : last ? (
          <span className="font-dm text-[11px] text-stone-600">Waiting on {first || "the client"}</span>
        ) : null}
      </div>
      {isLoading ? (
        <p className="font-dm text-xs text-stone-600">Loading emails…</p>
      ) : messages.length === 0 ? (
        <p className="font-dm text-xs text-stone-600 leading-relaxed">
          Emails you send from VenueFlow show here. Client replies show too once your inbox is connected in Settings → Email.
        </p>
      ) : (
        <>
          {hidden > 0 && (
            <button type="button" onClick={() => setShowAll(true)}
              className="w-full mb-2 font-bebas tracking-widest text-[11px] py-1.5 border border-dashed border-stone-300 text-stone-700 hover:bg-linen focus-visible:outline-2 focus-visible:outline-forest">
              SHOW {hidden} EARLIER {hidden === 1 ? "EMAIL" : "EMAILS"}
            </button>
          )}
          <ol className="space-y-2" aria-label="Emails, oldest first">
            {visible.map(m => (
              <MessageCard key={m.id} msg={m} clientFirstName={first}
                onReply={onReply ? (msg) => onReply(msg, buildReply(msg)) : undefined} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
