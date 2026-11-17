import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { toast } from "sonner";
import { errorToastId, errorToastOptions } from "../shared/errorToast";

// Error toasts stay until they are closed (client/src/components/ui/sonner.tsx),
// unless the call gives its own duration. That's only right for a pointer to
// errors that stay on the page anyway; an error that gives its own time (a
// failed download with an "Open printable page" button, say) vanishes before a
// slow reader, or a screen-reader user, has dealt with it (WCAG 2.2.1).
const CLIENT = path.resolve(__dirname, "../client/src");
// Pointers whose message also stays at the field: the enquiry form's "Please
// fill in …", the proposal's GST/deposit check, and the venue form's "Something
// in Basic Details needs fixing first" (shown with the fields to fix).
const TIMED_POINTERS = ['id: "lead-form-invalid"', 'id: "proposal-form-invalid"', 'id: "venue-details-invalid"'];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

// Every toast.error(...) call in the client, with its arguments.
function errorToastCalls() {
  const calls: { where: string; call: string }[] = [];
  for (const file of sourceFiles(CLIENT)) {
    const src = fs.readFileSync(file, "utf8");
    let i = 0;
    while ((i = src.indexOf("toast.error(", i)) !== -1) {
      let j = i + "toast.error(".length, depth = 1;
      while (j < src.length && depth) { if (src[j] === "(") depth++; else if (src[j] === ")") depth--; j++; }
      const line = src.slice(0, i).split("\n").length;
      calls.push({ where: `${path.relative(CLIENT, file)}:${line}`, call: src.slice(i, j) });
      i = j;
    }
  }
  return calls;
}

describe("error toasts", () => {
  it("are found in the client source", () => {
    expect(errorToastCalls().length).toBeGreaterThan(100);
  });

  it("don't set their own duration, apart from pointers to errors shown at the field", () => {
    const timed = errorToastCalls()
      .filter(c => /\bduration\s*:/.test(c.call) && !TIMED_POINTERS.some(t => c.call.includes(t)))
      .map(c => `${c.where}  ${c.call.replace(/\s+/g, " ").slice(0, 120)}`);
    expect(timed).toEqual([]);
  });
});

// sonner.tsx raises every error toast with errorToastOptions(). These run the
// options through Sonner's own toast store, which is what decides whether a
// call adds a toast or updates one already there.
describe("an error toast raised again", () => {
  // toast.dismiss() hands its work to the next animation frame; Node has none.
  globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) => setTimeout(cb, 0)) as typeof requestAnimationFrame;
  const raise = (message: string, data?: { id?: string; duration?: number }) => toast.error(message, errorToastOptions(message, data));
  const showing = (message: string) => toast.getToasts().filter(t => "title" in t && t.title === message).length;

  it("replaces the copy already showing instead of stacking another", () => {
    // A failing run sheet autosave raises this on every save attempt.
    for (let i = 0; i < 6; i++) raise("Auto-save failed — click Save now");
    expect(showing("Auto-save failed — click Save now")).toBe(1);
  });

  it("shows again after the first copy was closed", () => {
    const id = raise("Pick a space first. The Space field is now showing under Details.");
    toast.dismiss(id);
    expect(showing("Pick a space first. The Space field is now showing under Details.")).toBe(0);
    raise("Pick a space first. The Space field is now showing under Details.");
    expect(showing("Pick a space first. The Space field is now showing under Details.")).toBe(1);
  });

  it("keeps different errors apart", () => {
    raise("Couldn't save the day title");
    raise("Couldn't release the hold");
    expect(showing("Couldn't save the day title")).toBe(1);
    expect(showing("Couldn't release the hold")).toBe(1);
  });

  it("keeps an id the call gives (a loading toast turned into its error)", () => {
    expect(raise("Upload failed", { id: "upload-7" })).toBe("upload-7");
    expect(raise("Upload failed", { id: "upload-8" })).toBe("upload-8");
    expect(showing("Upload failed")).toBe(2);
  });

  it("stays until closed, unless the call gives its own time", () => {
    expect(errorToastOptions("Send failed").duration).toBe(Infinity);
    expect(errorToastOptions("Please fill in Email", { id: "lead-form-invalid", duration: 6000 }).duration).toBe(6000);
  });

  it("only takes an id from a plain-text message", () => {
    expect(errorToastId("  Send failed ")).toBe(errorToastId("Send failed"));
    expect(errorToastId("")).toBeUndefined();
    expect(errorToastId(undefined)).toBeUndefined();
  });
});
