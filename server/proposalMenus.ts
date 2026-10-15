/**
 * The menus on a proposal, for the client: each menu package on it, with the
 * description and full menu ("what's on it") the venue wrote for it.
 */
import { and, eq } from "drizzle-orm";
import { menuPackages } from "../drizzle/schema";
import { getDb } from "./db";
import { isPackageLine, packageLineDescription } from "@shared/proposalPackages";

export type ProposalMenu = { line: string; name: string; description: string | null; menu: string | null };

export async function proposalMenus(ownerId: number, lineItemsJson: string | null | undefined): Promise<ProposalMenu[]> {
  let lines: Array<{ description: string }> = [];
  try { const parsed = JSON.parse(lineItemsJson ?? "[]"); if (Array.isArray(parsed)) lines = parsed; } catch { return []; }
  const wanted = new Set(lines.map(l => l.description).filter(isPackageLine));
  if (wanted.size === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const pkgs = await db.select({ name: menuPackages.name, type: menuPackages.type, description: menuPackages.description, chefNotes: menuPackages.chefNotes })
    .from(menuPackages).where(and(eq(menuPackages.ownerId, ownerId)));
  const out: ProposalMenu[] = [];
  for (const line of Array.from(wanted)) {
    const pkg = pkgs.find(p => packageLineDescription(p) === line);
    if (pkg) out.push({ line, name: pkg.name, description: pkg.description ?? null, menu: menuBody(pkg.chefNotes, pkg.name, pkg.description) });
  }
  return out;
}

/** The menu text without its opening lines when they only repeat the
 *  package's name/price and description, which are shown as the heading. */
export function menuBody(text: string | null | undefined, name: string, description: string | null | undefined): string | null {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const n = norm(name);
  const d = norm(description ?? "");
  while (lines.length) {
    const first = norm(lines[0]);
    if (!first || (n && first.startsWith(n)) || (d && (first === d || first.startsWith(d)))) lines.shift();
    else break;
  }
  const body = lines.join("\n").trim();
  return body || null;
}
