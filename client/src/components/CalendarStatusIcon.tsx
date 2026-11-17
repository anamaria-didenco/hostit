import type { CSSProperties } from "react";
import {
  AlertTriangle, ArrowLeftRight, Ban, Check, Circle, FileText, Flag, MessageCircle, Pause, Sparkles, X,
  type LucideIcon,
} from "lucide-react";

/**
 * A shape for each enquiry/event status, drawn on the Calendar's month chips
 * and in its legend next to the status colour, so a status never depends on
 * telling yellow from green. Statuses a venue adds itself get a dot.
 */
const STATUS_ICONS: Record<string, LucideIcon> = {
  new: Sparkles,
  contacted: MessageCircle,
  proposal_sent: FileText,
  negotiating: ArrowLeftRight,
  tentative: Pause, // "On Hold"
  booked: Check,
  confirmed: Check,
  finished: Flag,
  lost: X,
  cancelled: Ban,
};

export function CalendarStatusIcon({ status, overdue = false, className = "w-3 h-3", style }: {
  status: string;
  /** An enquiry whose follow-up is overdue: a warning sign, like its dark-red colour. */
  overdue?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const Icon = overdue ? AlertTriangle : STATUS_ICONS[status] ?? Circle;
  return <Icon aria-hidden="true" strokeWidth={2.75} className={className} style={style} />;
}
