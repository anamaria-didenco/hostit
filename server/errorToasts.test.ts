import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Error toasts stay until they are closed (client/src/components/ui/sonner.tsx),
// unless the call gives its own duration. That's only right for a pointer to
// errors that stay on the page anyway; an error that gives its own time (a
// failed download with an "Open printable page" button, say) vanishes before a
// slow reader, or a screen-reader user, has dealt with it (WCAG 2.2.1).
const CLIENT = path.resolve(__dirname, "../client/src");
// The enquiry form's "Please fill in …" pointer: the same message stays at the field.
const TIMED_POINTERS = ['id: "lead-form-invalid"'];

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
