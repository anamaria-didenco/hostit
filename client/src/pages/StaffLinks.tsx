import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Copy, ExternalLink, Trash2, Link2, Calendar, MapPin, Eye } from "lucide-react";

export default function StaffLinks() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: links, isLoading } = trpc.staffPortal.listAll.useQuery();
  const deleteLink = trpc.staffPortal.deleteLink.useMutation({
    onSuccess: () => { toast.success("Link deleted"); utils.staffPortal.listAll.invalidate(); },
    onError: () => toast.error("Failed to delete link"),
  });
  const [filter, setFilter] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const now = Date.now();

  const filtered = (links ?? []).filter(l => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (l.runsheetTitle ?? "").toLowerCase().includes(q) ||
      (l.label ?? "").toLowerCase().includes(q) ||
      (l.venueName ?? "").toLowerCase().includes(q) ||
      (l.spaceName ?? "").toLowerCase().includes(q)
    );
  });

  function copy(token: string) {
    const url = `${origin}/staff/${token}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied to clipboard"),
      () => toast.error("Couldn't copy — try again"),
    );
  }

  function fmtDate(ts?: number | null): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-NZ", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function fmtEventDate(d: Date | string | null | undefined): string {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <button
          onClick={() => setLocation("/dashboard")}
          className="flex items-center gap-1.5 font-bebas tracking-widest text-xs text-ink/60 hover:text-ink mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> BACK TO DASHBOARD
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-cormorant text-3xl font-semibold text-ink">Staff portal links</h1>
            <p className="font-dm text-sm text-ink/60 mt-1">Every live link you've shared with staff. Copy, open or revoke from one place.</p>
          </div>
          <div className="font-bebas tracking-widest text-xs text-ink/40">
            {links?.length ?? 0} TOTAL
          </div>
        </div>

        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search by event, venue or label…"
          className="w-full mb-5 rounded-sm border border-gold/20 focus:outline-none focus:border-forest text-sm h-10 px-3 bg-white font-dm"
        />

        {isLoading ? (
          <div className="font-dm text-sm text-ink/50 py-12 text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-gold/30 px-6 py-16 text-center">
            <Link2 className="w-8 h-8 mx-auto mb-3 text-ink/20" />
            <div className="font-dm text-sm text-ink/60">
              {links?.length === 0
                ? "No staff portal links yet. Create one from any runsheet's Staff Portal panel."
                : "No links match your search."}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(l => {
              const expired = !!l.expiresAt && l.expiresAt < now;
              return (
                <div key={l.id} className="bg-white border border-gold/20 hover:border-forest/40 transition-colors">
                  <div className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => setLocation(`/runsheet?id=${l.runsheetId}`)}
                          className="font-cormorant text-lg font-semibold text-ink hover:text-forest text-left truncate"
                        >
                          {l.runsheetTitle ?? "(runsheet deleted)"}
                        </button>
                        {l.label && l.label !== "Staff Link" && l.label !== "Staff Portal" && (
                          <span className="font-bebas tracking-widest text-[10px] bg-cream text-ink/60 px-2 py-0.5">
                            {l.label}
                          </span>
                        )}
                        {expired && (
                          <span className="font-bebas tracking-widest text-[10px] bg-red-100 text-red-700 px-2 py-0.5">
                            EXPIRED
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 font-dm text-xs text-ink/60 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtEventDate(l.eventDate)}</span>
                        {(l.venueName || l.spaceName) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {[l.venueName, l.spaceName].filter(Boolean).join(" — ")}
                          </span>
                        )}
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Last opened {fmtDate(l.lastAccessedAt)}</span>
                        <span className="text-ink/40">Created {fmtDate(l.createdAt)}</span>
                      </div>
                      <div className="font-mono text-[10px] text-ink/40 mt-1.5 truncate">
                        {origin}/staff/{l.token}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => copy(l.token)}
                        title="Copy link"
                        className="h-9 w-9 flex items-center justify-center text-ink/50 hover:text-forest hover:bg-cream"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <a
                        href={`/staff/${l.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open link in new tab"
                        className="h-9 w-9 flex items-center justify-center text-ink/50 hover:text-forest hover:bg-cream"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => {
                          if (confirm(`Delete this staff portal link? Anyone holding the link will lose access.`)) {
                            deleteLink.mutate({ id: l.id });
                          }
                        }}
                        title="Delete link"
                        className="h-9 w-9 flex items-center justify-center text-ink/50 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
