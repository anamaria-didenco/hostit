import React from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { CalendarDays, Mail, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type FinderStage = { key: string; label: string; swatch?: string };

/** A status as a small coloured chip: dot + label, so results make sense at a glance. */
export function StatusChip({ status, stages }: { status: string; stages?: FinderStage[] }) {
  const stage = stages?.find(s => s.key === status);
  const label = stage?.label ?? status.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
  return (
    <span className="inline-flex items-center gap-1 font-bebas tracking-widest text-[10px] px-1.5 py-0.5 border border-gray-200 bg-white text-ink/80 whitespace-nowrap">
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: stage?.swatch ?? "#9ca3af" }} />
      {label.toUpperCase()}
    </span>
  );
}

const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : null;

type Item =
  | { kind: "lead"; id: number; key: string; name: string; sub: string; status: string; date: string | null }
  | { kind: "event"; id: number; key: string; name: string; sub: string; status: string; date: string | null };

/**
 * Cmd/Ctrl-K finder, available on every Dashboard tab: type a name, email,
 * phone or company and jump straight to the enquiry or the event. Staff
 * logins only ever see events (the server enforces it).
 */
export default function GlobalFinder({
  open, onOpenChange, isStaff, stages, onOpenLead, onOpenEvent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isStaff?: boolean;
  stages?: FinderStage[];
  onOpenLead: (id: number) => void;
  onOpenEvent: (id: number) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const activeRef = React.useRef<HTMLLIElement | null>(null);

  // Ctrl/Cmd-K toggles from anywhere on the page.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  React.useEffect(() => { if (open) { setQuery(""); setDebounced(""); setActive(0); } }, [open]);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  const ready = debounced.length >= 2;
  const { data, isFetching, isError } = trpc.search.global.useQuery(
    { q: debounced, limit: 8 },
    { enabled: open && ready, placeholderData: keepPreviousData, staleTime: 15_000 },
  );

  const { leadItems, eventItems } = React.useMemo(() => {
    const leadIds = new Set((data?.enquiries ?? []).map(e => e.id));
    const leadItems: Item[] = (data?.enquiries ?? []).map(e => ({
      kind: "lead", id: e.id, key: `l${e.id}`, name: e.name, status: e.status, date: fmtDate(e.eventDate),
      sub: [e.company, e.email, e.phone, e.eventType].filter(Boolean).join(" · "),
    }));
    // An event whose enquiry is already listed is the same person: don't list them twice.
    const eventItems: Item[] = (data?.events ?? []).filter(e => !(e.leadId && leadIds.has(e.leadId))).map(e => ({
      kind: "event", id: e.id, key: `e${e.id}`, name: e.name, status: e.status, date: fmtDate(e.eventDate),
      sub: [e.spaceName, e.eventType, e.email].filter(Boolean).join(" · "),
    }));
    return { leadItems, eventItems };
  }, [data]);
  const items = [...leadItems, ...eventItems];

  React.useEffect(() => { setActive(0); }, [data]);
  React.useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [active, data]);

  const choose = (it: Item | undefined) => {
    if (!it) return;
    onOpenChange(false);
    if (it.kind === "lead") onOpenLead(it.id); else onOpenEvent(it.id);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") { e.preventDefault(); if (items.length) setActive(a => (a + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (items.length) setActive(a => (a - 1 + items.length) % items.length); }
    else if (e.key === "Home" && items.length) { e.preventDefault(); setActive(0); }
    else if (e.key === "End" && items.length) { e.preventDefault(); setActive(items.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
  };

  const optionId = (it: Item) => `${listId}-${it.key}`;
  const status = !ready
    ? "Type at least 2 characters."
    : isError ? "Search isn't available right now."
    : isFetching && !data ? "Searching…"
    : items.length === 0 ? "No matches."
    : `${items.length} result${items.length === 1 ? "" : "s"}.`;

  const renderGroup = (label: string, icon: React.ReactNode, group: Item[]) => group.length === 0 ? null : (
    <li role="presentation" key={label}>
      <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 font-bebas tracking-widest text-xs text-ink/60" id={`${listId}-${label}`}>{icon}{label.toUpperCase()}</div>
      <ul role="group" aria-labelledby={`${listId}-${label}`}>
        {group.map(it => {
          const isActive = items[active]?.key === it.key;
          return (
            <li key={it.key} id={optionId(it)} role="option" aria-selected={isActive}
              ref={isActive ? activeRef : undefined}
              onMouseMove={() => { const i = items.findIndex(x => x.key === it.key); if (i !== active) setActive(i); }}
              onClick={() => choose(it)}
              className={`mx-2 px-2 py-2 rounded-md cursor-pointer flex items-start gap-3 ${isActive ? "bg-forest/10" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="font-cormorant font-semibold text-base text-ink truncate">{it.name}</div>
                {it.sub && <div className="font-dm text-xs text-ink/60 truncate">{it.sub}</div>}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <StatusChip status={it.status} stages={it.kind === "lead" ? stages : undefined} />
                {it.date && <span className="font-dm text-[11px] text-ink/60 whitespace-nowrap">{it.date}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </li>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[10000]"
        className="z-[10001] top-[12%] translate-y-0 p-0 gap-0 overflow-hidden sm:max-w-xl"
      >
        <DialogTitle className="sr-only">{isStaff ? "Find an event" : "Find an enquiry or event"}</DialogTitle>
        <DialogDescription className="sr-only">
          {isStaff ? "Search events by name or space." : "Search by name, email, phone or company. Use the arrow keys to choose a result and Enter to open it."}
        </DialogDescription>
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-200">
          <Search className="w-4 h-4 text-ink/60 flex-shrink-0" aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={items[active] ? optionId(items[active]) : undefined}
            aria-label={isStaff ? "Search events" : "Search enquiries and events"}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={isStaff ? "Search events by name or space…" : "Search name, email, phone or company…"}
            autoComplete="off" autoCorrect="off" spellCheck={false}
            className="flex-1 h-11 px-1 rounded-sm bg-transparent font-dm text-sm text-ink placeholder:text-ink/50 focus:outline-none"
          />
          <kbd className="hidden sm:inline font-dm text-[10px] text-ink/60 border border-gray-200 rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto pb-2 empty:hidden">
          {renderGroup("Enquiries", <Mail className="w-3 h-3" aria-hidden="true" />, leadItems)}
          {renderGroup("Events", <CalendarDays className="w-3 h-3" aria-hidden="true" />, eventItems)}
        </ul>
        <div role="status" aria-live="polite" className={`px-4 py-3 font-dm text-xs text-ink/60 ${items.length ? "sr-only" : ""}`}>{status}</div>
        {items.length > 0 && (
          <div aria-hidden="true" className="hidden sm:flex items-center gap-3 px-4 py-2 border-t border-gray-200 font-dm text-[11px] text-ink/60">
            <span>↑↓ to move</span><span>Enter to open</span><span>Esc to close</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
