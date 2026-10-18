import React from "react";
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle } from "lucide-react";
import { enquiryFit, fitOkCount, type FitTone, type FitSpace } from "@shared/enquiryFit";
import { eventFormatLabel, budgetRangeLabel } from "@shared/formFields";

/**
 * The three Option-C sections the enquiry drawer adds for a lead:
 *   • Worth quoting?  — the fit checklist (date / capacity / budget / client)
 *   • Event           — a compact facts band
 *   • Quote           — a package estimate against the space's minimum spend
 * All driven by real data passed in from the drawer.
 */

export interface DrawerPackage {
  id: number;
  name: string;
  pricePerHead: number | null;
  customPriceLabel?: string | null;
}

export interface EnquiryDrawerExtrasProps {
  lead: any;
  space: FitSpace | null;
  spaceLabel?: string | null;
  hasClash?: boolean;
  isWeekend?: boolean;
  returningCount?: number | null;
  packages: DrawerPackage[];
}

const TONE_FG: Record<FitTone, string> = { green: "#3f7350", amber: "#8a5f18", red: "#c0392b", gray: "#6a6256" };
const TONE_ICON: Record<FitTone, React.ComponentType<any>> = {
  green: CheckCircle2, red: XCircle, amber: AlertTriangle, gray: MinusCircle,
};

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-NZ")}`;
}

function SectionHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <h3 className="font-sans text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground flex-shrink-0">{title}</h3>
      <span className="h-px flex-1" style={{ background: "var(--vf-hair, #eee6d8)" }} />
      {meta && <span className="font-sans text-[11px] text-muted-foreground flex-shrink-0">{meta}</span>}
    </div>
  );
}

export default function EnquiryDrawerExtras(props: EnquiryDrawerExtrasProps) {
  const { lead, space, spaceLabel, hasClash, isWeekend, returningCount, packages } = props;

  const fit = React.useMemo(
    () => enquiryFit(
      { guestCount: lead.guestCount, budgetRange: lead.budgetRange, eventDate: lead.eventDate, dateFlexible: (lead as any).dateFlexible },
      space,
      { hasClash, isWeekend, returningCount, spaceLabel },
    ),
    [lead, space, hasClash, isWeekend, returningCount, spaceLabel],
  );
  const ok = fitOkCount(fit);

  const priced = packages.filter((p) => p.pricePerHead != null && p.pricePerHead > 0);
  const [pkgId, setPkgId] = React.useState<number | null>(priced[0]?.id ?? null);
  React.useEffect(() => { if (pkgId == null && priced.length) setPkgId(priced[0].id); }, [priced, pkgId]);
  const pkg = priced.find((p) => p.id === pkgId) ?? priced[0] ?? null;
  const guests = Number(lead.guestCount) || 0;
  const est = pkg && pkg.pricePerHead ? pkg.pricePerHead * guests : null;
  const minSpend = isWeekend ? (space?.minSpendWeekend ?? space?.minSpend ?? null) : (space?.minSpend ?? null);

  const dateStr = lead.eventDate
    ? new Date(lead.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })
    : (lead as any).dateFlexible ? "Flexible" : "TBC";
  const timeStr = lead.eventDate ? new Date(lead.eventDate).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" }) : "—";
  const band = [
    { label: "Date", value: dateStr },
    { label: "Time", value: timeStr },
    { label: "Guests", value: guests ? String(guests) : "—", inv: true },
    { label: "Space", value: space?.name ?? spaceLabel ?? "—" },
    { label: "Format", value: eventFormatLabel((lead as any).eventFormat) ?? "—" },
    { label: "Budget", value: budgetRangeLabel(lead.budgetRange) ?? "Not given" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Worth quoting? */}
      <div>
        <SectionHead title="Worth quoting?" meta={`${ok} of ${fit.length} look good`} />
        <div className="flex flex-col">
          {fit.map((f) => {
            const I = TONE_ICON[f.tone];
            return (
              <div key={f.key} className="grid items-baseline gap-2.5 py-2 border-b last:border-b-0" style={{ gridTemplateColumns: "20px 72px 1fr", borderColor: "var(--vf-hair, #eee6d8)" }}>
                <span style={{ color: TONE_FG[f.tone], position: "relative", top: 2 }}><I style={{ width: 16, height: 16 }} strokeWidth={2.4} aria-hidden /></span>
                <span className="font-sans text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{f.label}</span>
                <span className="font-sans text-[13px] text-muted-foreground leading-snug"><span className="font-bold" style={{ color: "#211d18" }}>{f.head}.</span> {f.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event facts band */}
      <div>
        <SectionHead title="Event" />
        <div className="grid grid-cols-3 rounded-[6px] overflow-hidden border-[1.5px]" style={{ borderColor: "var(--primary)" }}>
          {band.map((b, i) => (
            <div key={i} className="px-3 py-2.5" style={{
              background: b.inv ? "var(--primary)" : "var(--card)",
              color: b.inv ? "#fff" : "#211d18",
              borderRight: "1px solid var(--vf-line, #e3ddd0)",
              borderBottom: "1px solid var(--vf-line, #e3ddd0)",
            }}>
              <div className="font-sans text-[9px] font-extrabold uppercase tracking-[0.16em]" style={{ opacity: 0.8 }}>{b.label}</div>
              <div className="font-serif text-[16px] font-semibold truncate mt-0.5">{b.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quote estimate */}
      {priced.length > 0 && (
        <div>
          <SectionHead title="Quote" meta={pkg && pkg.pricePerHead ? `${pkg.name} · ${money(pkg.pricePerHead)} pp` : undefined} />
          <div className="flex gap-1.5 flex-wrap">
            {priced.map((p) => {
              const on = p.id === pkg?.id;
              return (
                <button key={p.id} onClick={() => setPkgId(p.id)}
                  className="h-[30px] px-2.5 rounded-[4px] font-sans text-[12px] font-bold border-[1.5px] transition-colors"
                  style={on ? { background: "var(--accent)", borderColor: "var(--primary)", color: "var(--primary)" } : { background: "var(--card)", borderColor: "var(--input)", color: "#211d18" }}>
                  {p.name} {money(p.pricePerHead as number)}
                </button>
              );
            })}
          </div>
          {est != null && (
            <div className="mt-2.5 flex items-baseline gap-2.5 flex-wrap">
              <span className="font-serif text-[26px] font-semibold" style={{ color: "#211d18" }}>{money(est)}</span>
              {minSpend != null && (
                <span className="font-sans text-[12.5px]" style={{ color: est >= minSpend ? "#3f7350" : "#8a5f18" }}>
                  {est >= minSpend ? `clears the ${money(minSpend)} minimum` : `${money(minSpend - est)} under the ${money(minSpend)} minimum`}
                </span>
              )}
              {!guests && <span className="font-sans text-[12.5px] text-muted-foreground">add a guest count for an estimate</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
