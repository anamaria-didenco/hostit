import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The alerts bell: proposals opened, enquiries waiting for a reply,
 * automatic follow-ups, and so on (server/notify.ts writes them).
 *
 * Polls the unread count every 30s. When new alerts arrive and the browser
 * has already granted notification permission, it also shows a system
 * notification — except for new enquiries, which the enquiries list already
 * announces. It never asks for permission itself.
 */

type Alert = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

export function timeAgo(date: Date | string, now = Date.now()): string {
  const diff = now - new Date(date).getTime();
  if (!Number.isFinite(diff) || diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(date).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

// The enquiries list already pops a browser notification for these.
const NO_BROWSER_ALERT_KINDS = new Set(["new_enquiry"]);

export function NotificationBell({ variant, onOpenLink, side = "bottom", align = "end" }: {
  /** "sidebar" = light icon on the blue desktop sidebar; "light" = on white. */
  variant: "sidebar" | "light";
  onOpenLink: (link: string) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: unread = 0 } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
  const listQuery = trpc.notifications.list.useQuery({ limit: 30 }, { staleTime: 30_000 });
  const alerts = (listQuery.data ?? []) as Alert[];
  const markRead = trpc.notifications.markRead.useMutation({
    onSettled: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  // Count went up → fetch the list so the popover and browser alerts are current.
  const lastUnread = useRef<number | null>(null);
  useEffect(() => {
    if (lastUnread.current !== null && unread > lastUnread.current) void listQuery.refetch();
    lastUnread.current = unread;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  // Browser notification for alerts that arrived since the page loaded.
  const knownMaxId = useRef<number | null>(null);
  useEffect(() => {
    if (!listQuery.data) return;
    const maxId = alerts.reduce((m, a) => Math.max(m, a.id), 0);
    if (knownMaxId.current === null) { knownMaxId.current = maxId; return; }
    const fresh = alerts.filter(a => a.id > knownMaxId.current! && !a.readAt && !NO_BROWSER_ALERT_KINDS.has(a.kind));
    knownMaxId.current = Math.max(knownMaxId.current, maxId);
    if (fresh.length === 0 || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const a of fresh.slice(0, 3)) {
      try {
        const n = new Notification(a.title, { body: a.body ?? "", icon: "/logo-icon.png", tag: `vf-alert-${a.id}` });
        n.onclick = () => {
          window.focus();
          markRead.mutate({ id: a.id });
          if (a.link) onOpenLink(a.link);
          n.close();
        };
      } catch { /* some browsers only allow notifications from a service worker */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.data]);

  useEffect(() => { if (open) void listQuery.refetch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const openAlert = (a: Alert) => {
    if (!a.readAt) markRead.mutate({ id: a.id });
    setOpen(false);
    if (a.link) onOpenLink(a.link);
  };

  const label = unread > 0 ? `Alerts, ${unread} unread` : "Alerts, none unread";
  const badge = unread > 99 ? "99+" : String(unread);
  const iconColour = variant === "sidebar" ? (unread > 0 ? "#ffffff" : "#bcc8db") : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={`relative w-8 h-8 flex items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 ${
            variant === "sidebar" ? "hover:bg-white/10 focus-visible:ring-white" : "hover:bg-gray-100 focus-visible:ring-primary"
          }`}
        >
          <Bell aria-hidden="true" className={`w-4 h-4 ${variant === "light" ? (unread > 0 ? "text-sage-dark" : "text-gray-500") : ""}`} style={iconColour ? { color: iconColour } : undefined} />
          {unread > 0 && (
            <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none" style={{ background: "#c0392b" }}>
              {badge}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        collisionPadding={16}
        aria-label="Alerts"
        className="w-[360px] max-w-[calc(100vw-32px)] p-0 bg-white border border-border shadow-lg rounded-md overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <h2 className="font-bebas text-[11px] text-ink">Alerts</h2>
          <button
            type="button"
            onClick={() => markRead.mutate({})}
            disabled={unread === 0 || markRead.isPending}
            className="flex items-center gap-1 font-dm text-xs font-semibold text-sage-green hover:underline disabled:text-stone-400 disabled:no-underline disabled:cursor-default rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" /> Mark all read
          </button>
        </div>
        {listQuery.isLoading ? (
          <p className="px-4 py-6 font-dm text-sm text-stone-600">Loading…</p>
        ) : alerts.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <Bell className="w-7 h-7 mx-auto mb-2 text-stone-300" aria-hidden="true" />
            <p className="font-dm text-sm font-semibold text-ink">You're all caught up</p>
            <p className="font-dm text-xs text-stone-600 mt-1">New enquiries, enquiries waiting for a reply and proposal activity will show here.</p>
          </div>
        ) : (
          <ul className="max-h-[min(420px,60vh)] overflow-y-auto divide-y divide-stone-100">
            {alerts.map(a => {
              const isUnread = !a.readAt;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => openAlert(a)}
                    className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-stone-100 focus:outline-none focus-visible:bg-stone-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${isUnread ? "bg-sage-tint" : ""}`}
                  >
                    <span aria-hidden="true" className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: isUnread ? "#2f5488" : "transparent" }} />
                    <span className="min-w-0 flex-1">
                      <span className={`block font-dm text-sm text-ink leading-snug ${isUnread ? "font-semibold" : ""}`}>
                        {isUnread && <span className="sr-only">Unread: </span>}{a.title}
                      </span>
                      {a.body && <span className="block font-dm text-xs text-stone-600 mt-0.5 leading-snug line-clamp-2">{a.body}</span>}
                      <span className="block font-dm text-[11px] text-stone-600 mt-1">{timeAgo(a.createdAt)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
