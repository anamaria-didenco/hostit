import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { X, Upload, FileText, AlertCircle, CheckCircle2, ChevronDown } from "lucide-react";

type LeadField = {
  key: string;
  label: string;
  required?: boolean;
};

const LEAD_FIELDS: LeadField[] = [
  { key: "fullName", label: "First & Last Name", required: true },
  { key: "eventTitle", label: "Event Title" },
  { key: "eventDate", label: "Event Date" },
  { key: "occasion", label: "Occasion" },
  { key: "guestCount", label: "Guests" },
  { key: "eventSpace", label: "Event Space" },
  { key: "status", label: "Status" },
  { key: "email", label: "Contact Email Address" },
];

const STATUS_VALUES = ["new", "contacted", "proposal_sent", "negotiating", "booked", "lost", "cancelled"];

function normalizeStatus(raw: string): typeof STATUS_VALUES[number] {
  const s = raw.toLowerCase().replace(/[\s_\-]+/g, "");
  const map: Record<string, typeof STATUS_VALUES[number]> = {
    new: "new", enquiry: "new", newenquiry: "new", newinquiry: "new",
    inquiry: "new", open: "new", received: "new", pending: "new",
    contacted: "contacted", inprogress: "contacted", followup: "contacted",
    followingup: "contacted", intouch: "contacted", active: "contacted",
    proposalsent: "proposal_sent", proposal: "proposal_sent", quoted: "proposal_sent",
    quote: "proposal_sent", quotesent: "proposal_sent", sent: "proposal_sent",
    negotiating: "negotiating", negotiation: "negotiating", reviewing: "negotiating",
    underreview: "negotiating", considering: "negotiating",
    booked: "booked", confirmed: "booked", won: "booked", closed: "booked",
    booking: "booked", secured: "booked", accepted: "booked",
    lost: "lost", declined: "lost", rejected: "lost", notproceeding: "lost",
    noproceeding: "lost", unsuccessful: "lost",
    cancelled: "cancelled", canceled: "cancelled", withdrawn: "cancelled",
  };
  return map[s] ?? "new";
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-\.&]+/g, "");
}

function autoMapColumn(header: string): string {
  const n = normalizeHeader(header);
  const map: Record<string, string> = {
    firstlastname: "fullName", name: "fullName", fullname: "fullName", clientname: "fullName",
    firstname: "fullName", attendeename: "fullName", guestname: "fullName",
    eventtitle: "eventTitle", title: "eventTitle", eventname: "eventTitle", functionname: "eventTitle",
    eventdate: "eventDate", date: "eventDate", functiondate: "eventDate", eventday: "eventDate",
    occasion: "occasion", eventtype: "occasion", type: "occasion", function: "occasion",
    eventkind: "occasion", category: "occasion", packagetype: "occasion",
    guests: "guestCount", guestcount: "guestCount", pax: "guestCount",
    attendees: "guestCount", headcount: "guestCount", numberofguests: "guestCount",
    eventspace: "eventSpace", space: "eventSpace", room: "eventSpace", venue: "eventSpace",
    hall: "eventSpace", area: "eventSpace", location: "eventSpace",
    status: "status", enquirystatus: "status", leadstatus: "status",
    email: "email", emailaddress: "email", contactemail: "email",
    contactemailaddress: "email", emailcontact: "email",
  };
  return map[n] ?? "";
}

type ParsedRow = Record<string, string>;

interface Props {
  onClose: () => void;
  onImported: () => void;
}

function splitFullName(full: string): { firstName: string; lastName?: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName };
}

export default function CsvImportModal({ onClose, onImported }: Props) {
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const bulkCreate = trpc.leads.bulkCreate.useMutation();

  const parseFile = useCallback((file: File) => {
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hdrs = res.meta.fields ?? [];
        setHeaders(hdrs);
        setRows(res.data as ParsedRow[]);
        const autoMap: Record<string, string> = {};
        hdrs.forEach(h => {
          const mapped = autoMapColumn(h);
          if (mapped) autoMap[h] = mapped;
        });
        setMapping(autoMap);
        setStep("map");
      },
      error: () => toast.error("Failed to parse CSV file."),
    });
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  function getMappedValue(row: ParsedRow, field: string): string {
    const col = Object.entries(mapping).find(([, v]) => v === field)?.[0];
    return col ? (row[col] ?? "") : "";
  }

  function buildLeads() {
    return rows.map(row => {
      const fullNameRaw = getMappedValue(row, "fullName").trim();
      const { firstName, lastName } = splitFullName(fullNameRaw || "Unknown");
      const guestStr = getMappedValue(row, "guestCount").replace(/[^0-9]/g, "");
      const status = normalizeStatus(getMappedValue(row, "status"));
      const eventTitle = getMappedValue(row, "eventTitle").trim();
      const occasion = getMappedValue(row, "occasion").trim();
      const eventSpace = getMappedValue(row, "eventSpace").trim();

      return {
        firstName,
        lastName: lastName || undefined,
        email: getMappedValue(row, "email").trim() || undefined,
        eventType: occasion || eventTitle || undefined,
        eventDate: getMappedValue(row, "eventDate").trim() || undefined,
        guestCount: guestStr ? parseInt(guestStr) : undefined,
        message: [
          eventTitle ? `Event: ${eventTitle}` : "",
          eventSpace ? `Space: ${eventSpace}` : "",
        ].filter(Boolean).join(" | ") || undefined,
        company: eventSpace || undefined,
        source: "csv_import",
        status,
      };
    }).filter(r => r.firstName && r.firstName !== "Unknown" || r.email);
  }

  async function handleImport() {
    const leads = buildLeads();
    if (!leads.length) { toast.error("No valid rows to import."); return; }
    try {
      const res = await bulkCreate.mutateAsync(leads);
      setResult(res);
      setStep("done");
      onImported();
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed.");
    }
  }

  const previewLeads = buildLeads().slice(0, 5);
  const totalValid = buildLeads().length;

  const templateCsv =
    "data:text/csv;charset=utf-8," +
    encodeURIComponent(
      "First & Last Name,Event Title,Event Date,Occasion,Guests,Event Space,Status,Contact Email Address\n" +
      "Jane Smith,Smith Wedding,2025-08-15,Wedding,80,The Grand Ballroom,new,jane@example.com\n" +
      "Acme Corp,Annual Gala,2025-09-20,Corporate Dinner,120,Garden Pavilion,contacted,events@acme.co.nz"
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Import Enquiries from CSV</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {step === "upload" && "Upload a CSV file exported from another platform"}
              {step === "map" && `${rows.length} rows found — map your columns below`}
              {step === "preview" && `Preview ${totalValid} valid rows before importing`}
              {step === "done" && "Import complete"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition ${
                dragging ? "border-[#8D957E] bg-[#8D957E]/5" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="font-medium text-gray-700 mb-1">Drop your CSV file here</p>
              <p className="text-sm text-gray-400">or click to browse — supports files from any platform</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {/* ── Step 2: Column Mapping ── */}
          {step === "map" && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex gap-2 text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Map each column from your file to the correct HOSTit field. Unmapped columns will be skipped.</span>
              </div>
              <div className="space-y-2">
                {headers.map(header => (
                  <div key={header} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="text-sm font-medium text-gray-700 truncate">{header}</span>
                        {rows[0]?.[header] && (
                          <span className="text-xs text-gray-400 truncate ml-1">e.g. "{rows[0][header]}"</span>
                        )}
                      </div>
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0 relative">
                      <select
                        value={mapping[header] ?? ""}
                        onChange={e => setMapping(m => ({ ...m, [header]: e.target.value }))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#8D957E]/40 focus:border-[#8D957E]"
                      >
                        <option value="">— Skip this column —</option>
                        {LEAD_FIELDS.map(f => (
                          <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Preview ── */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
                Showing first 5 of <strong>{totalValid}</strong> rows that will be imported.
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 font-medium">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Occasion</th>
                      <th className="px-3 py-2 text-left">Event Date</th>
                      <th className="px-3 py-2 text-left">Guests</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {previewLeads.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-medium text-gray-900">{r.firstName} {r.lastName}</td>
                        <td className="px-3 py-2 text-gray-500">{r.email || "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{r.eventType || "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{r.eventDate || "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{r.guestCount ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs">{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === "done" && result && (
            <div className="text-center py-6">
              <CheckCircle2 className="w-14 h-14 text-[#8D957E] mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-1">{result.imported} enquiries imported</h3>
              <p className="text-gray-500 text-sm mb-4">They are now visible in your Enquiries dashboard.</p>
              {result.errors.length > 0 && (
                <div className="text-left bg-red-50 border border-red-100 rounded-xl px-4 py-3 mt-4">
                  <p className="text-sm font-medium text-red-700 mb-2">{result.errors.length} rows had errors:</p>
                  <ul className="text-xs text-red-600 space-y-1">
                    {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                    {result.errors.length > 10 && <li>…and {result.errors.length - 10} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {step === "upload" && (
            <>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <a
                href={templateCsv}
                download="hostit-import-template.csv"
                className="text-sm text-[#8D957E] hover:underline"
              >
                Download template
              </a>
            </>
          )}

          {step === "map" && (
            <>
              <button onClick={() => setStep("upload")} className="text-sm text-gray-500 hover:text-gray-700">Back</button>
              <button
                onClick={() => setStep("preview")}
                disabled={!Object.values(mapping).some(v => v === "fullName" || v === "email")}
                className="bg-[#8D957E] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#7a8269] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Preview import ({rows.length} rows)
              </button>
            </>
          )}

          {step === "preview" && (
            <>
              <button onClick={() => setStep("map")} className="text-sm text-gray-500 hover:text-gray-700">Back</button>
              <button
                onClick={handleImport}
                disabled={bulkCreate.isPending || totalValid === 0}
                className="bg-[#8D957E] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#7a8269] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {bulkCreate.isPending ? "Importing…" : `Import ${totalValid} enquiries`}
              </button>
            </>
          )}

          {step === "done" && (
            <button onClick={onClose} className="ml-auto bg-[#8D957E] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#7a8269] transition">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
