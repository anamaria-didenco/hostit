import { useCallback, useEffect, useRef, useState } from "react";
import {
  LIST_PARAM_KEYS, clearFilters, defaultView, filtersKey, hasListParams, sameSort, sortFromParam, sortToParam,
  stateFromParams, stateToParams, viewDefaultSort,
  type EnquiryFilters, type EnquiryView, type ListSort, type ListState,
} from "@shared/enquiryFilters";

/** View and filters for this browser session (not the search): coming back from Calendar keeps your place. */
const SESSION_KEY = "vf_enquiry_list_v2";
/** The sort picked for each view: a preference, kept between visits. */
const SORT_KEY = "vf_enquiry_sort_v2";
/** The old list's saved table prefs; never read again. */
const OLD_PREFS_KEY = "vf_lead_table_prefs_v1";
const PATH = "/dashboard";

type Allowed = { statuses: readonly string[]; spaceIds: readonly number[] };

function readSortPrefs(): Partial<Record<EnquiryView, string>> {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    const o = raw ? JSON.parse(raw) : null;
    return o && typeof o === "object" ? o : {};
  } catch { return {}; }
}
function rememberedSort(view: EnquiryView): ListSort {
  return sortFromParam(readSortPrefs()[view]) ?? viewDefaultSort(view);
}
function saveSort(view: EnquiryView, sort: ListSort) {
  try {
    const prefs = readSortPrefs();
    if (sameSort(sort, viewDefaultSort(view))) delete prefs[view]; else prefs[view] = sortToParam(sort);
    localStorage.setItem(SORT_KEY, JSON.stringify(prefs));
  } catch { /* storage blocked */ }
}

function fromParams(sp: URLSearchParams, allowed: Allowed): ListState {
  const p = stateFromParams(sp, allowed);
  const view = p.view ?? "reply";
  return { view, filters: p.filters, q: p.q ?? "", searchIn: !!p.searchIn, sort: p.sort ?? viewDefaultSort(view) };
}

/** The list's params written into the page address, after `tab`, other params kept. */
function writeUrl(s: ListState) {
  if (window.location.pathname !== PATH) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("tab") !== "enquiries") return;
  const list = stateToParams(s);
  const out = new URLSearchParams();
  let placed = false;
  url.searchParams.forEach((v, k) => {
    if ((LIST_PARAM_KEYS as readonly string[]).includes(k)) return;
    out.append(k, v);
    if (k === "tab") { list.forEach((lv, lk) => out.append(lk, lv)); placed = true; }
  });
  if (!placed) list.forEach((lv, lk) => out.append(lk, lv));
  const qs = out.toString();
  const next = `${PATH}${qs ? `?${qs}` : ""}`;
  if (next !== `${url.pathname}${url.search}`) window.history.replaceState(window.history.state, "", next);
}

/**
 * The Enquiries list's state: view, filters, search and sort.
 *
 * Where it starts, once the enquiries have loaded:
 *  1. the page address, when it says anything about the list (bookmarks, tiles, the badge);
 *  2. else this browser session's last view and filters;
 *  3. else the first of Needs reply, Follow-up due, Open with something in it.
 *     Decided once, so a refetch never flips the view under you.
 *
 * While the Enquiries tab is showing, the state is written to the address
 * (replaced, not pushed; the search 300ms after typing stops), so a reload or a
 * shared link shows the same list, and Back from another tab brings it back.
 */
export function useEnquiryListState(opts: {
  tab: string;
  setTab: (t: "enquiries") => void;
  /** The enquiries, the venue's statuses and its spaces have loaded. */
  ready: boolean;
  /** View counts with nothing filtered, for the opening view. */
  getCounts: () => Record<EnquiryView, number>;
  getAllowed: () => Allowed;
}) {
  const o = useRef(opts);
  o.current = opts;
  const initialSearch = useRef(typeof window === "undefined" ? "" : window.location.search);
  const [state, setStateRaw] = useState<ListState>(() => {
    const sp = new URLSearchParams(initialSearch.current);
    const view = (stateFromParams(sp, { statuses: [], spaceIds: [] }).view) ?? "reply";
    return { view, filters: clearFilters(), q: sp.get("q") ?? "", sort: rememberedSort(view) };
  });
  const [decided, setDecided] = useState(false);
  const decidedRef = useRef(false);
  const decide = () => { if (!decidedRef.current) { decidedRef.current = true; setDecided(true); } };
  const setState = useCallback((fn: (s: ListState) => ListState) => { decide(); setStateRaw(fn); }, []);

  useEffect(() => { try { localStorage.removeItem(OLD_PREFS_KEY); } catch { /* blocked */ } }, []);

  // The opening view, once everything it depends on has loaded.
  useEffect(() => {
    if (decidedRef.current || !opts.ready) return;
    const sp = new URLSearchParams(initialSearch.current);
    if (hasListParams(sp)) { setState(() => fromParams(sp, o.current.getAllowed())); return; }
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved !== null) {
        const s = fromParams(new URLSearchParams(saved), o.current.getAllowed());
        setState(() => ({ ...s, q: "", searchIn: false, sort: rememberedSort(s.view) }));
        return;
      }
    } catch { /* storage blocked */ }
    const view = defaultView(o.current.getCounts());
    setState(s => ({ ...s, view, sort: rememberedSort(view) }));
  }, [opts.ready, setState]);

  // State → address (only while the list is the tab showing).
  const params = stateToParams(state).toString();
  const lastQ = useRef(state.q);
  useEffect(() => {
    if (!decided || opts.tab !== "enquiries") return;
    const typing = lastQ.current !== state.q;
    lastQ.current = state.q;
    // After the tab's own history entry is in place (useDashboardHistory).
    const t = setTimeout(() => writeUrl(state), typing ? 300 : 0);
    return () => clearTimeout(t);
  }, [decided, opts.tab, params]); // eslint-disable-line react-hooks/exhaustive-deps

  // View and filters → this session.
  const fKey = filtersKey(state.filters);
  useEffect(() => {
    if (!decided) return;
    try {
      sessionStorage.setItem(SESSION_KEY, stateToParams({ view: state.view, filters: state.filters, q: "", sort: viewDefaultSort(state.view) }).toString());
    } catch { /* storage blocked */ }
  }, [decided, state.view, fKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Back / Forward to an Enquiries entry: show the list that address describes. */
  const applyFromUrl = useCallback(() => {
    const sp = new URLSearchParams(window.location.search);
    if (window.location.pathname !== PATH || sp.get("tab") !== "enquiries") return;
    const next = fromParams(sp, o.current.getAllowed());
    lastQ.current = next.q;
    setState(() => next);
  }, [setState]);
  useEffect(() => {
    window.addEventListener("popstate", applyFromUrl);
    return () => window.removeEventListener("popstate", applyFromUrl);
  }, [applyFromUrl]);

  const setView = useCallback((view: EnquiryView) => setState(s => (
    s.q.trim()
      // Clicking a tab while searching narrows the results to it, and that tab stays when the search is cleared.
      ? { ...s, view, searchIn: true, sort: rememberedSort(view) }
      : { ...s, view, sort: rememberedSort(view) }
  )), [setState]);
  const setFilters = useCallback((f: EnquiryFilters | ((f: EnquiryFilters) => EnquiryFilters)) =>
    setState(s => ({ ...s, filters: typeof f === "function" ? f(s.filters) : f })), [setState]);
  const setQ = useCallback((q: string) => setState(s => ({ ...s, q, searchIn: q.trim() ? s.searchIn : false })), [setState]);
  const setSort = useCallback((sort: ListSort) => setState(s => {
    if (!s.q.trim() || s.searchIn) saveSort(s.view, sort);
    return { ...s, sort };
  }), [setState]);
  /** Open the Enquiries tab on a view: filters, search and sort reset to that view's own, plus `filters`. */
  const showEnquiries = useCallback((v: { view: EnquiryView; filters?: Partial<EnquiryFilters> }) => {
    setState(() => ({ view: v.view, filters: { ...clearFilters(), ...(v.filters ?? {}) }, q: "", searchIn: false, sort: viewDefaultSort(v.view) }));
    o.current.setTab("enquiries");
  }, [setState]);

  return { state, decided, setView, setFilters, setQ, setSort, showEnquiries, applyFromUrl, filtersKey: fKey };
}
