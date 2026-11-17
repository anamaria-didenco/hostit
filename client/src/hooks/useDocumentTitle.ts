import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Set the browser-tab title while this screen is showing (build it with
 * pageTitle() from @shared/pageTitle). Pass null/undefined while the data the
 * title needs is still loading: the route's default title (set by
 * <RouteChange/> in App.tsx) stays until then.
 */
export function useDocumentTitle(title: string | null | undefined) {
  const [path] = useLocation();
  useEffect(() => {
    if (title) document.title = title;
  }, [title, path]);
}
