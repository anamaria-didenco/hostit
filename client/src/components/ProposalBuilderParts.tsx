import React from "react";
import { AlertTriangle, ArrowRight, Check, CheckCircle2 } from "lucide-react";

/**
 * Pieces of the proposal builder's layout: the section stepper, a section
 * wrapper with its "Next:" bar, section heads and callouts. The builder keeps
 * every section on one page (so every field stays reachable and the save
 * flow is unchanged); the stepper jumps between them and follows the scroll.
 */

export interface ProposalStep {
  id: string;
  label: string;
  /** Something has been filled in for this section. */
  filled: boolean;
  /** One plain line for the "Next:" bar that points here. */
  hint: string;
}

export const stepDomId = (id: string) => `pb-step-${id}`;

/** Scroll to a section and move focus to its heading (for keyboard users). */
export function goToStep(id: string) {
  const el = document.getElementById(stepDomId(id));
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true });
}

/** Which section is in view, by the top of the viewport. */
export function useActiveStep(ids: string[]): string {
  const [active, setActive] = React.useState(ids[0]);
  const key = ids.join("|");
  React.useEffect(() => {
    const onScroll = () => {
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(stepDomId(id));
        if (el && el.getBoundingClientRect().top <= 160) current = id;
      }
      // Scrolled to the very bottom, the last section is the one being read.
      // Only once the page has been scrolled: before the proposal has loaded the
      // page is short, so it "ends" on screen and the last step would be marked.
      const doc = document.documentElement;
      const scrolls = doc.scrollHeight > window.innerHeight + 4;
      if (scrolls && window.scrollY > 0 && window.innerHeight + window.scrollY >= doc.scrollHeight - 4) current = ids[ids.length - 1];
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // The sections fill in after the proposal loads (and grow as lines are
    // added): check again whenever the page changes size, not only on scroll.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => onScroll()) : null;
    ro?.observe(document.body);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); ro?.disconnect(); };
  }, [key]);
  return active;
}

function StepMark({ filled, active }: { filled: boolean; active: boolean }) {
  if (filled) return (
    <span className="w-5 h-5 rounded-full bg-[#3f7350] text-white flex items-center justify-center flex-shrink-0" aria-hidden>
      <Check className="w-3 h-3" strokeWidth={3} />
    </span>
  );
  return <span className={`w-5 h-5 rounded-full border-[1.5px] flex-shrink-0 ${active ? "border-primary" : "border-input"}`} aria-hidden />;
}

/** Section list: vertical in the left column on wide screens, a scrolling row otherwise. */
export function ProposalStepper({ steps, active, orientation, className = "" }: {
  steps: ProposalStep[]; active: string; orientation: "vertical" | "horizontal"; className?: string;
}) {
  if (orientation === "horizontal") return (
    <nav aria-label="Proposal sections" className={`bg-card border-[1.5px] border-border rounded-lg overflow-x-auto ${className}`}>
      <ol className="flex gap-1 p-1.5 m-0 list-none min-w-max">
        {steps.map((s, i) => {
          const on = s.id === active;
          return (
            <li key={s.id}>
              <button type="button" onClick={() => goToStep(s.id)} aria-current={on ? "step" : undefined}
                className={`flex items-center gap-2 h-9 px-3 rounded-md text-[13px] whitespace-nowrap transition-colors ${on ? "bg-accent text-primary font-bold" : "text-foreground hover:bg-muted"}`}>
                <StepMark filled={s.filled} active={on} />
                <span className="tabular-nums text-muted-foreground font-semibold" aria-hidden>{i + 1}</span>
                {s.label}
                {s.filled && <span className="sr-only">(filled in)</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
  return (
    <nav aria-label="Proposal sections" className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground px-3 pb-2">Sections</span>
      <ol className="flex flex-col gap-0.5 m-0 p-0 list-none">
        {steps.map(s => {
          const on = s.id === active;
          return (
            <li key={s.id}>
              <button type="button" onClick={() => goToStep(s.id)} aria-current={on ? "step" : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left text-[14px] transition-colors ${on ? "bg-accent text-primary font-bold" : "text-foreground hover:bg-muted"}`}>
                <StepMark filled={s.filled} active={on} />
                {s.label}
                {s.filled && <span className="sr-only">(filled in)</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 mx-1 p-3 rounded-lg bg-card border-[1.5px] border-border text-[12.5px] leading-relaxed text-muted-foreground">
        Drafts save as you go. Sent proposals update the client's page when you save.
      </p>
    </nav>
  );
}

/** A section of the builder: step eyebrow, title, its cards, and the "Next:" bar. */
export function ProposalSection({ step, index, total, next, disabled, children }: {
  step: ProposalStep; index: number; total: number; next?: ProposalStep; disabled: boolean; children: React.ReactNode;
}) {
  const headingId = `${stepDomId(step.id)}-title`;
  return (
    <section id={stepDomId(step.id)} aria-labelledby={headingId} className="scroll-mt-36 xl:scroll-mt-24 space-y-4 min-w-0">
      <div>
        <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground tabular-nums">Step {index + 1} of {total}</span>
        <h2 id={headingId} data-step-heading tabIndex={-1} className="font-sans text-[24px] font-semibold tracking-[-0.01em] text-foreground mt-1 mb-0 outline-none">{step.label}</h2>
      </div>
      {/* Read-only once the client has answered. */}
      <fieldset disabled={disabled} className="space-y-4 min-w-0 m-0 p-0 border-0">
        {children}
      </fieldset>
      {next && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3 rounded-lg bg-accent text-[13.5px]">
          <b className="text-primary">Next: {next.label}</b>
          <span className="text-foreground min-w-0 flex-1">{next.hint}</span>
          <button type="button" onClick={() => goToStep(next.id)}
            className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-primary/90">
            Continue <ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}

/** 12px tracked section head with a hairline that fills the row. */
export function PbSectionHead({ title, meta, as: Tag = "h3", children }: {
  title: string; meta?: React.ReactNode; as?: "h2" | "h3"; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Tag className="font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] text-primary m-0 flex-shrink-0">{title}</Tag>
      {children}
      <span className="h-[1.5px] flex-1 bg-border" aria-hidden />
      {meta && <span className="text-[12px] text-muted-foreground flex-shrink-0">{meta}</span>}
    </div>
  );
}

/** A tinted callout saying why something needs attention (or that it's fine). */
export function PbCallout({ tone, title, children, role = "note" }: {
  tone: "green" | "amber" | "red"; title: React.ReactNode; children?: React.ReactNode; role?: "note" | "alert";
}) {
  const style = tone === "green" ? { background: "#eef5f0", borderColor: "#cfe0d4", color: "#3f7350" }
    : tone === "amber" ? { background: "#f7efdd", borderColor: "#e9d7b3", color: "#8a5f18" }
    : { background: "#fbecea", borderColor: "#f0c7c2", color: "#c0392b" };
  const Icon = tone === "green" ? CheckCircle2 : AlertTriangle;
  return (
    <div role={role} className="flex gap-3 rounded-lg border-[1.5px] px-3.5 py-3" style={style}>
      <Icon className="w-[18px] h-[18px] flex-shrink-0 mt-px" strokeWidth={2} aria-hidden />
      <div className="min-w-0 text-[13.5px]">
        <div className="font-bold">{title}</div>
        {children && <div className="text-foreground mt-0.5">{children}</div>}
      </div>
    </div>
  );
}
