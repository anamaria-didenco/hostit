import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { SignedOutBanner, SignedOutNotice, watchForSignOut } from "./lib/sessionExpiry";
import "./index.css";
import "./lib/installPrompt"; // starts listening for the browser's "install" offer straight away
import { isPublicClientPath } from "@shared/pwaScope";
import { ENQUIRY_REQUEST_TIMEOUT_MS } from "@shared/enquiryTiming";
import { withEnquiryTimeout } from "./lib/requestTimeout";

// Installable app. The manifest is linked on staff screens only: a client opening a proposal or the
// enquiry form must not be offered "install" (the app opens the staff dashboard).
if (!isPublicClientPath(window.location.pathname)) {
  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = "/manifest.webmanifest";
  document.head.appendChild(manifest);
}

// The service worker makes the site installable and shows an offline page.
// Production only, and not when embedded in another site's iframe (the enquiry form embed).
// A new version takes over quietly (sw.js skipWaiting + clients.claim) and nothing here
// reloads the page when it does, so an update can never throw away what someone is typing.
if ("serviceWorker" in navigator && import.meta.env.PROD && window.self === window.top) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(err => console.warn("[PWA] service worker not registered", err));
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

// "Not signed in" from the API: keeps a page with typing on it instead of jumping to
// sign-in and losing it (see lib/sessionExpiry.ts).
watchForSignOut(queryClient);

// The enquiry form's own requests give up after ENQUIRY_REQUEST_TIMEOUT_MS, so a
// stalled SUBMIT comes back with "Your connection dropped" instead of spinning
// for as long as the browser keeps the connection open. Nothing else is limited.
const timedFetch = withEnquiryTimeout((input, init) => globalThis.fetch(input, init), ENQUIRY_REQUEST_TIMEOUT_MS);

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return timedFetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
      <SignedOutNotice />
      <SignedOutBanner />
    </QueryClientProvider>
  </trpc.Provider>
);
