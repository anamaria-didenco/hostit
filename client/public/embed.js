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
 *   - data-placement="floating" instead builds a corner bubble launcher (a
 *     full-height bottom sheet on narrow screens) that toggles the iframe
 *     open/closed — data-mount is ignored in this mode, since a floating
 *     widget is a fixed overlay, not something placed in the page flow
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
  // Floating widgets only: how to collapse each one back to its bubble when
  // its own iframe posts vf-close-widget (the card's × button).
  var closers = [];

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

    // A floating widget is a fixed overlay anchored to the viewport, not
    // something placed in the page's normal flow — data-mount doesn't apply.
    if (script.getAttribute("data-placement") === "floating") {
      mountFloating(script, venue, baseOrigin);
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

  function genFrameId(script) {
    return script.getAttribute("data-frame-id") || ("vf-" + Math.random().toString(36).slice(2, 9));
  }

  // ── Shared iframe-src / query-string building for both placements. ──────
  function buildIframeParams(script, frameId) {
    var parentParams = new URLSearchParams(window.location.search);
    var iframeParams = new URLSearchParams();
    iframeParams.set("embed", "1");

    var layout = script.getAttribute("data-layout");
    if (layout) iframeParams.set("layout", layout);

    // Styling API — accent, font ("inherit" or a Google Font), bg (hex or
    // "transparent"), text/label/border colours, corner radius, shadow ("off"),
    // and button style ("outline"/"ghost"). All optional; defaults unchanged.
    ["accent", "font", "bg", "text", "label", "border", "radius", "shadow", "button"].forEach(function (k) {
      var v = script.getAttribute("data-" + k);
      if (v) iframeParams.set(k, v);
    });

    CLICK_ID_PARAMS.forEach(function (p) {
      var v = parentParams.get(p);
      if (v) iframeParams.set(p, v);
    });
    UTM_PARAMS.forEach(function (p) {
      var v = parentParams.get(p);
      if (v) iframeParams.set(p, v);
    });

    var prefillEventType = script.getAttribute("data-event-type");
    var prefillDate = script.getAttribute("data-date");
    var prefillGuests = script.getAttribute("data-guests");
    var prefillFormat = script.getAttribute("data-format");
    if (prefillEventType) iframeParams.set("prefillEventType", prefillEventType);
    if (prefillDate) iframeParams.set("prefillDate", prefillDate);
    if (prefillGuests) iframeParams.set("prefillGuests", prefillGuests);
    if (prefillFormat) iframeParams.set("prefillFormat", prefillFormat);

    // Arbitrary field preselection: data-prefill='{"fieldId":"value",…}'. JSON
    // (not per-attribute) so field ids keep their exact camelCase — the DOM
    // lowercases attribute names, which would break e.g. eventType.
    var prefillJson = script.getAttribute("data-prefill");
    if (prefillJson) {
      try {
        var obj = JSON.parse(prefillJson);
        Object.keys(obj).forEach(function (k) { if (obj[k] != null) iframeParams.set("prefill_" + k, String(obj[k])); });
      } catch (e) {
        console.error("[VenueFlow embed.js] data-prefill is not valid JSON — ignoring.");
      }
    }

    if (frameId) iframeParams.set("frameId", frameId);
    iframeParams.set("parentOrigin", window.location.origin);
    return iframeParams;
  }

  var NARROW_QUERY = "(max-width: 560px)";

  // ── data-placement="floating" — a corner bubble launcher that opens the
  //    same enquire page in a fixed-position panel (or, on a narrow
  //    viewport, a full-height bottom sheet). Nothing here talks to a real
  //    calendar/availability backend; the panel is just the same iframe used
  //    for inline embeds, sized and positioned differently. ────────────────
  function mountFloating(script, venue, baseOrigin) {
    var frameId = genFrameId(script);
    var iframeParams = buildIframeParams(script, frameId);
    iframeParams.set("layout", iframeParams.get("layout") || "compact");
    iframeParams.set("placement", "floating");

    var accent = script.getAttribute("data-accent");
    var accentCss = accent ? "#" + accent.replace(/^#/, "") : "#2f5488";

    var bubble = document.createElement("button");
    bubble.type = "button";
    bubble.setAttribute("aria-label", "Open enquiry form");
    bubble.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483000;" +
      "display:flex;align-items:center;justify-content:center;width:56px;height:56px;" +
      "border-radius:50%;border:none;background:" + accentCss + ";color:#fff;cursor:pointer;" +
      "box-shadow:0 12px 28px -8px rgba(0,0,0,.35);font:0/0 sans-serif;";
    bubble.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    var backdrop = document.createElement("div");
    backdrop.style.cssText = "position:fixed;inset:0;z-index:2147482998;background:rgba(22,20,15,.38);display:none;";

    var panel = document.createElement("div");
    panel.style.cssText = "position:fixed;z-index:2147482999;display:none;" +
      "border-radius:12px;overflow:hidden;box-shadow:0 18px 44px -20px rgba(0,0,0,.45);";

    var iframe = document.createElement("iframe");
    iframe.title = "Event enquiry form";
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block;";
    iframe.setAttribute("frameborder", "0");
    panel.appendChild(iframe);

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    document.body.appendChild(bubble);

    var isOpen = false;
    var srcBuilt = false;

    function layoutPanel() {
      var narrow = window.matchMedia(NARROW_QUERY).matches;
      // display is always reset to none here — layoutPanel() only ever runs
      // while closed (see open()/the resize listener's isOpen guard), and
      // cssText replaces the whole style attribute, so leaving it out would
      // fall back to the browser default (visible) instead of staying hidden.
      if (narrow) {
        panel.style.cssText = "position:fixed;z-index:2147482999;left:0;right:0;bottom:0;display:none;" +
          "width:100%;max-height:88vh;border-radius:16px 16px 0 0;overflow-y:auto;overflow-x:hidden;" +
          "box-shadow:0 -8px 32px -8px rgba(0,0,0,.4);";
      } else {
        panel.style.cssText = "position:fixed;z-index:2147482999;right:20px;bottom:88px;display:none;" +
          "width:376px;max-height:640px;border-radius:12px;overflow-y:auto;overflow-x:hidden;" +
          "box-shadow:0 18px 44px -20px rgba(0,0,0,.45);";
      }
      iframeParams.set("sheet", narrow ? "1" : "0");
    }

    function open() {
      layoutPanel();
      if (!srcBuilt) {
        iframe.src = baseOrigin + "/enquire/" + encodeURIComponent(venue) + "?" + iframeParams.toString();
        srcBuilt = true;
        instances.push({ iframe: iframe, venue: venue, gadsLabel: script.getAttribute("data-gads-label") || null, origin: baseOrigin, frameId: frameId });
      }
      var narrow = window.matchMedia(NARROW_QUERY).matches;
      backdrop.style.display = narrow ? "block" : "none";
      panel.style.display = "block";
      bubble.style.display = "none";
      isOpen = true;
    }
    function close() {
      panel.style.display = "none";
      backdrop.style.display = "none";
      bubble.style.display = "flex";
      isOpen = false;
    }
    bubble.addEventListener("click", function () { isOpen ? close() : open(); });
    backdrop.addEventListener("click", close);
    // Re-decide corner-panel vs. bottom-sheet only while closed — resizing
    // mid-conversation out from under someone would be jarring.
    window.addEventListener("resize", function () { if (!isOpen) layoutPanel(); });

    closers.push({ iframeWindowOf: function () { return iframe.contentWindow; }, close: close });
  }

  function mountAndBuild(script, mount, venue, baseOrigin) {
    var frameId = genFrameId(script);
    var iframeParams = buildIframeParams(script, frameId);
    var height = script.getAttribute("data-height") || "640";
    var iframe = document.createElement("iframe");
    iframe.src = baseOrigin + "/enquire/" + encodeURIComponent(venue) + "?" + iframeParams.toString();
    iframe.title = "Event enquiry form";
    // Width is author-controllable so the form can be as wide or as narrow as
    // the host layout needs. data-width sets the frame width (default 100% of
    // the mount), data-max-width caps it (default 520px; "none"/"full" removes
    // the cap for a full-bleed form). A bare number is treated as px.
    var toLen = function (v, dflt) {
      if (v == null || v === "") return dflt;
      v = String(v).trim();
      if (v === "none" || v === "full" || v === "0") return "none";
      return /^\d+(\.\d+)?$/.test(v) ? v + "px" : v;
    };
    iframe.style.width = toLen(script.getAttribute("data-width"), "100%");
    iframe.style.maxWidth = toLen(script.getAttribute("data-max-width"), "520px");
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
      frameId: frameId,
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

    if (data.type === "vf-close-widget") {
      // The card's own × button (floating placement only) — collapse this
      // widget back to its bubble.
      for (var c = 0; c < closers.length; c++) {
        if (closers[c].iframeWindowOf() === event.source) { closers[c].close(); break; }
      }
      return;
    }

    if (data.type === "vf-step-changed") {
      // Funnel signal: which wizard step is showing. Host pages can use this
      // for drop-off analytics. Never a conversion.
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "vf_step_changed", step: data.step || null, frame_id: inst.frameId || null });
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
      window.dataLayer.push({ event: "vf_partial_captured", frame_id: inst.frameId || null });
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
        source: data.source || null,
        frame_id: inst.frameId || null,
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
