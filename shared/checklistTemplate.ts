/**
 * Checklist templates (Settings > Templates) are edited as one item per line.
 * Turning the lines back into items keeps each unchanged item's id and
 * details, so editing a template doesn't renumber everything.
 */

export type TemplateItem = { id: string; text: string; category?: string; required?: boolean };

/** The items as the text box shows them: one per line. */
export function templateItemsToText(items: readonly { text: string }[] | null | undefined): string {
  return (items ?? []).map(i => (i?.text ?? "").trim()).filter(Boolean).join("\n");
}

/**
 * The lines of the text box as items. A line matching an existing item (same
 * words, any case) keeps that item's id, category and "required"; a new line
 * gets the next free number as its id. Blank lines are skipped.
 */
export function templateItemsFromText(text: string, existing: readonly TemplateItem[] = []): TemplateItem[] {
  const key = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const taken = new Set<string>();
  const allIds = new Set(existing.map(e => String(e.id)));
  let next = existing.reduce((m, e) => Math.max(m, /^\d+$/.test(String(e.id)) ? Number(e.id) : 0), 0);
  const out: TemplateItem[] = [];
  for (const line of lines) {
    const same = existing.find(e => !taken.has(String(e.id)) && key(e.text) === key(line));
    if (same) {
      taken.add(String(same.id));
      out.push({ ...same, id: String(same.id), text: line });
      continue;
    }
    let id: string;
    do { id = String(++next); } while (allIds.has(id) || taken.has(id));
    taken.add(id);
    out.push({ id, text: line });
  }
  return out;
}
