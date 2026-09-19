/*!
 * VenueFlow Embed SDK v1 — one-line loader for the enquiry form widget.
 *
 *   <script src="https://venueflowhq.com/embed.js"
 *           data-venue="bar-franco"
 *           data-accent="F00000"
 *           data-mount="#vf-enquiry"></script>
 *
 * What this file does, and nothing else:
 *   - builds the iframe src (venue slug + branding + click-id/UTM capture +
 *     prefill + this page's own origin, so the form can postMessage back to
 *     it specifically instead of "*")
 *   - mounts the iframe (at data-mount, or a div it creates right after the
 *     script tag if data-mount is absent) and auto-resizes it
 *   - on a successful submit, pushes a dataLayer event, calls gtag() if
 *     present (including an optional Google Ads conversion), and calls
 *     window.VenueFlow.onSubmit if the venue defined one
 *   - on step 1 of the wizard being completed (a name + email saved, even
 *     if the visitor never finishes), pushes a separate, lighter dataLayer
 *     event/gtag call — a secondary signal for the ads to learn from while
 *     full submissions are rare, distinct from a real conversion
 *
 * Supports multiple venue script tags on one page. Safe to load once.
 */
(function () {
  "use strict";

  var CLICK_ID_PARAMS = ["gclid", "gbraid", "wbraid", "fbclid"];
  var UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

  // iframe.contentWindow -> { iframe: HTMLIFrameElement, venue: string, gadsLabel: string|null }
  var instances = [];

  function originOf(url) {
    try { return new URL(url, window.location.href).origin; } catch (e) { return null; }
  }

  function initOne(script) {
    if (script.getAttribute("data-vf-initialized") === "1") return;
    script.setAttribute("data-vf-initialized", "1");

    var venue = script.getAttribute("data-venue");
    if (!venue) {
      console.error("[VenueFlow embed.js] missing required data-venue attribute — skipping this script tag.");
      return;
    }
    var baseOrigin = originOf(script.src);
    if (!baseOrigin) {
      console.error("[VenueFlow embed.js] couldn't determine the loader's own origin from its src — skipping.");
      return;
    }

    // ── Mount point: an explicit CSS selector, or a div dropped right after
    //    the script tag so a venue never has to add a second element. If a
    //    selector is given but the script runs before that element exists
    //    yet (e.g. pasted in <head>, target further down the page), wait for
    //    DOMContentLoaded and try once more before giving up. ─────────────
    var mountSelector = script.getAttribute("data-mount");
    if (!mountSelector) {
      var div = document.createElement("div");
      if (script.parentNode) script.parentNode.insertBefore(div, script.nextSibling);
      mountAndBuild(script, div, venue, baseOrigin);
      return;
    }
    var found = document.querySelector(mountSelector);
    if (found) { mountAndBuild(script, found, venue, baseOrigin); return; }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function retry() {
        document.removeEventListener("DOMContentLoaded", retry);
        var el = document.querySelector(mountSelector);
        if (el) mountAndBuild(script, el, venue, baseOrigin);
        else console.error('[VenueFlow embed.js] data-mount="' + mountSelector + '" matched no element — skipping.');
      });
    } else {
      console.error('[VenueFlow embed.js] data-mount="' + mountSelector + '" matched no element — skipping.');
    }
  }

  function mountAndBuild(script, mount, venue, baseOrigin) {
    // ── Click-id / UTM capture — read off THIS (parent) page's URL. The
    //    iframe is cross-origin and can never see this, which is the whole
    //    reason the loader has to do it and pass the values through. ───────
    var parentParams = new URLSearchParams(window.location.search);
    var iframeParams = new URLSearchParams();
    iframeParams.set("embed", "1");

    var accent = script.getAttribute("data-accent");
    var font = script.getAttribute("data-font");
    var bg = script.getAttribute("data-bg");
    var layout = script.getAttribute("data-layout");
    if (accent) iframeParams.set("accent", accent);
    if (font) iframeParams.set("font", font);
    if (bg) iframeParams.set("bg", bg);
    if (layout) iframeParams.set("layout", layout);

    CLICK_ID_PARAMS.forEach(function (p) {
      var v = parentParams.get(p);
      if (v) iframeParams.set(p, v);
    });
    UTM_PARAMS.forEach(function (p) {
      var v = parentParams.get(p);
      if (v) iframeParams.set(p, v);
    });

    // ── Prefill — e.g. a Christmas landing page opening the form already on
    //    "Christmas Party". The form does its own loose matching against the
    //    real option list, so exact spelling/casing here doesn't matter. ───
    var prefillEventType = script.getAttribute("data-event-type");
    var prefillDate = script.getAttribute("data-date");
    var prefillGuests = script.getAttribute("data-guests");
    var prefillFormat = script.getAttribute("data-format");
    if (prefillEventType) iframeParams.set("prefillEventType", prefillEventType);
    if (prefillDate) iframeParams.set("prefillDate", prefillDate);
    if (prefillGuests) iframeParams.set("prefillGuests", prefillGuests);
    if (prefillFormat) iframeParams.set("prefillFormat", prefillFormat);

    // Lets the form's postMessage calls target this exact origin instead of
    // "*" — see LeadForm.tsx's paramParentOrigin.
    iframeParams.set("parentOrigin", window.location.origin);

    var height = script.getAttribute("data-height") || "640";
    var iframe = document.createElement("iframe");
    iframe.src = baseOrigin + "/enquire/" + encodeURIComponent(venue) + "?" + iframeParams.toString();
    iframe.title = "Event enquiry form";
    iframe.style.width = "100%";
    iframe.style.maxWidth = "520px";
    iframe.style.border = "none";
    iframe.style.display = "block";
    iframe.style.height = height + "px";
    iframe.setAttribute("frameborder", "0");
    mount.appendChild(iframe);

    instances.push({
      iframe: iframe,
      venue: venue,
      gadsLabel: script.getAttribute("data-gads-label") || null,
      origin: baseOrigin,
    });
  }

  function handleMessage(event) {
    // Only ever trust messages from the exact origin this widget's iframes
    // were loaded from, and only from a window we actually mounted.
    var inst = null;
    for (var i = 0; i < instances.length; i++) {
      if (instances[i].iframe.contentWindow === event.source) { inst = instances[i]; break; }
    }
    if (!inst || event.origin !== inst.origin) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "vf-embed-height" && data.height) {
      inst.iframe.style.height = data.height + "px";
      return;
    }

    if (data.type === "vf-partial-captured") {
      // A visitor gave a name + email but hasn't finished the enquiry yet.
      // Pushed under its own event name (never "generate_lead") so it can't
      // be mistaken for a real submission in reporting, and deliberately
      // does NOT fire inst.gadsLabel's conversion action — that's reserved
      // for a completed enquiry. Still worth a signal: full submissions are
      // rare, and this gives the ads something to learn from in the
      // meantime (set up a secondary Google Ads conversion action off this
      // GA4/GTM event if useful).
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "vf_partial_captured" });
      if (typeof window.gtag === "function") {
        window.gtag("event", "generate_lead_partial");
      }
      return;
    }

    if (data.type === "vf-enquiry-submitted") {
      var payload = {
        event_type: data.eventType || null,
        guest_count: data.guestCount || null,
        budget_range: data.budgetRange || null,
        event_format: data.eventFormat || null,
      };

      // ── Conversion tracking, on by default ──────────────────────────────
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: "vf_enquiry_submitted" }, payload));

      if (typeof window.gtag === "function") {
        window.gtag("event", "generate_lead", payload);
        if (inst.gadsLabel) {
          window.gtag("event", "conversion", { send_to: inst.gadsLabel });
        }
      }

      window.VenueFlow = window.VenueFlow || {};
      if (typeof window.VenueFlow.onSubmit === "function") {
        try {
          window.VenueFlow.onSubmit(Object.assign({ venue: inst.venue }, payload));
        } catch (e) {
          console.error("[VenueFlow embed.js] window.VenueFlow.onSubmit threw:", e);
        }
      }
    }
  }

  window.VenueFlow = window.VenueFlow || {};
  window.addEventListener("message", handleMessage);

  var scripts = document.querySelectorAll("script[data-venue]");
  for (var i = 0; i < scripts.length; i++) initOne(scripts[i]);
})();
