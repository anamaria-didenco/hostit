import { useEffect, useRef, useState } from "react";

export type DrawerRef = { kind: "lead" | "booking"; id: number } | null;

const PATH = "/dashboard";
const HISTORY_FLAG = "vfDrawer";

function readUrl() {
  const qp = new URLSearchParams(window.location.search);
  const num = (k: string) => { const n = parseInt(qp.get(k) ?? "", 10); return Number.isFinite(n) && n > 0 ? n : null; };
  const leadId = num("leadId");
  const bookingId = num("bookingId");
  const drawer: DrawerRef = leadId ? { kind: "lead", id: leadId } : bookingId ? { kind: "booking", id: bookingId } : null;
  return { rawTab: qp.get("tab"), drawer };
}

/**
 * Puts the Dashboard's active tab and open record in the URL (?tab=, ?leadId=,
 * ?bookingId=) so the browser Back/Forward buttons move between them instead of
 * leaving the app, and a reload or shared link lands in the same place.
 *
 *  - A tab change, or opening a record, adds a history entry.
 *  - Swapping one record for another, and the first sync after load, replace it.
 *  - Closing a record that this hook opened goes Back, so no stray entry is left.
 *  - Back/Forward (popstate) re-applies the URL: tab, and record open or closed.
 *
 * Other query params (?sub=, ?rtab=, ...) are left exactly as they are.
 * The Dashboard itself restores a ?leadId= on first load (once its leads have
 * arrived); this hook restores ?bookingId=, and everything on popstate.
 */
export function useDashboardHistory<T extends string>(opts: {
  tab: T;
  setTab: (t: T) => void;
  /** Map ?tab= to a tab this user may see (null: unknown value). */
  normalizeTab: (raw: string | null) => T | null;
  /** False for tabs that redirect elsewhere (pipeline, or any tab for staff): they never get an entry. */
  isTabAllowed: (t: T) => boolean;
  drawer: DrawerRef;
  closeDrawer: () => void;
  openLead: (id: number) => Promise<boolean> | boolean;
  openBooking: (id: number) => Promise<boolean> | boolean;
  /** The leads have loaded, so the Dashboard's own ?leadId= restore has had its chance. */
  leadsLoaded: boolean;
}) {
  const o = useRef(opts);
  o.current = opts;
  const { tab, drawer, leadsLoaded } = opts;
  const drawerKey = drawer ? `${drawer.kind}:${drawer.id}` : "";

  const [ready, setReady] = useState(false);
  const restoring = useRef(false);
  const synced = useRef<{ tab: T; drawerKey: string } | null>(null);
  const initialDrawer = useRef(readUrl().drawer);
  const drawerRefLatest = useRef<DrawerRef>(drawer);
  drawerRefLatest.current = drawer;

  // First load: a ?bookingId= needs fetching; a ?leadId= is opened by the
  // Dashboard once its leads arrive. Either way, don't touch the URL until
  // that has happened (or definitely won't).
  useEffect(() => {
    const d = initialDrawer.current;
    if (!d) { setReady(true); return; }
    if (d.kind === "booking") {
      restoring.current = true;
      Promise.resolve(o.current.openBooking(d.id)).catch(() => false).finally(() => { restoring.current = false; setReady(true); });
    }
  }, []);
  useEffect(() => {
    if (!ready && initialDrawer.current?.kind === "lead" && leadsLoaded) setReady(true);
  }, [leadsLoaded, ready]);

  // State → URL.
  useEffect(() => {
    if (!ready || restoring.current) return;
    if (window.location.pathname !== PATH) return;
    const prev = synced.current;
    const url = new URL(window.location.href);
    const qp = new URLSearchParams(url.search);
    // The default tab keeps the bare /dashboard URL.
    if (tab === "overview") qp.delete("tab"); else qp.set("tab", tab);
    qp.delete("leadId"); qp.delete("bookingId");
    if (drawer) qp.set(drawer.kind === "lead" ? "leadId" : "bookingId", String(drawer.id));
    const qs = qp.toString();
    const next = `${PATH}${qs ? `?${qs}` : ""}`;
    synced.current = { tab, drawerKey };
    if (next === `${url.pathname}${url.search}`) return;

    const tabChanged = !!prev && prev.tab !== tab;
    const opened = !!prev && !prev.drawerKey && !!drawerKey;
    const closed = !!prev && !!prev.drawerKey && !drawerKey;
    // First sync, a swap between records, or leaving a redirecting tab: replace.
    const replace = !prev || !o.current.isTabAllowed(prev.tab) || (!tabChanged && !opened && !closed);
    if (!replace && closed && !tabChanged && window.history.state?.[HISTORY_FLAG]) {
      // We pushed this record's entry; its close is Back.
      window.history.back();
      return;
    }
    if (replace || closed) window.history.replaceState(window.history.state?.[HISTORY_FLAG] && !closed ? window.history.state : null, "", next);
    else window.history.pushState(opened ? { [HISTORY_FLAG]: true } : null, "", next);
  }, [ready, tab, drawerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL → state, for Back / Forward.
  useEffect(() => {
    const onPop = async () => {
      if (window.location.pathname !== PATH) return;
      const { rawTab, drawer: want } = readUrl();
      const cur = o.current;
      restoring.current = true;
      try {
        const t = cur.normalizeTab(rawTab) ?? ("overview" as T);
        if (t !== cur.tab) cur.setTab(t);
        const have = drawerRefLatest.current;
        if (!want) { if (have) cur.closeDrawer(); }
        else if (!have || have.kind !== want.kind || have.id !== want.id) {
          const ok = await (want.kind === "lead" ? cur.openLead(want.id) : cur.openBooking(want.id));
          if (!ok) {
            // The record is gone: drop the dead param instead of showing nothing.
            const qp = new URLSearchParams(window.location.search);
            qp.delete("leadId"); qp.delete("bookingId");
            window.history.replaceState(null, "", `${PATH}${qp.toString() ? `?${qp}` : ""}`);
          }
        }
      } finally {
        restoring.current = false;
        // What the URL now says is what the state will say.
        const { rawTab: rt, drawer: wd } = readUrl();
        synced.current = { tab: cur.normalizeTab(rt) ?? ("overview" as T), drawerKey: wd ? `${wd.kind}:${wd.id}` : "" };
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}
