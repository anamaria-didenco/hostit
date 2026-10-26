import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Event page: what the client submitted through their portal — confirmed final
 * numbers, dietaries, and any files they uploaded. Only renders once the client
 * has actually sent something. Files open via a short-lived blob URL fetched on
 * demand (owner-scoped), so large base64 isn't loaded until a staff member looks.
 */
export default function ClientSubmissionPanel({ bookingId }: { bookingId: number }) {
  const utils = trpc.useUtils();
  const { data } = trpc.portal.clientSubmission.useQuery({ bookingId }, { enabled: bookingId > 0 });
  if (!data) return null;
  const hasDetails = data.submittedAt != null || data.finalGuestCount != null || data.dietaries.length > 0 || !!data.notes;
  if (!hasDetails && data.uploads.length === 0) return null;

  const openFile = async (id: number) => {
    try {
      const r = await utils.portal.uploadData.fetch({ id });
      const b64 = r.dataUrl.split(",")[1] ?? "";
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: r.contentType }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't open that file.");
    }
  };

  return (
    <div className="dante-card p-6">
      <div className="gold-rule max-w-xs mb-4"><span>FROM YOUR CLIENT</span></div>
      {data.submittedAt && (
        <p className="font-dm text-xs text-ink/60 mb-3">
          Submitted {new Date(data.submittedAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })} via the client portal.
        </p>
      )}
      <div className="space-y-3 font-dm text-sm text-ink">
        {data.finalGuestCount != null && (
          <div><span className="text-ink/60">Final guest count: </span><span className="font-semibold">{data.finalGuestCount}</span></div>
        )}
        {data.dietaries.length > 0 && (
          <div>
            <div className="text-ink/60 mb-1">Dietaries</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {data.dietaries.map((d, i) => <li key={i}>{d.count}× {d.name}{d.notes ? ` — ${d.notes}` : ""}</li>)}
            </ul>
          </div>
        )}
        {data.notes && <div><span className="text-ink/60">Notes: </span>{data.notes}</div>}
        {data.uploads.length > 0 && (
          <div>
            <div className="text-ink/60 mb-1">Files ({data.uploads.length})</div>
            <ul className="flex flex-wrap gap-2">
              {data.uploads.map(u => (
                <li key={u.id}>
                  <button onClick={() => openFile(u.id)}
                    className="inline-flex items-center gap-1.5 border border-gold/30 rounded-lg px-3 py-1.5 text-xs hover:bg-gold/10"
                    title={`${u.filename} — ${(u.size / 1024).toFixed(0)} KB`}>
                    <span aria-hidden>{(u.contentType ?? "").startsWith("image/") ? "🖼️" : "📄"}</span>
                    <span className="max-w-[160px] truncate">{u.filename}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
