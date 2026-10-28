import { describe, it, expect } from "vitest";
import { renderSignatureHtml } from "../shared/emailSignatures";

const venue = { name: "Bar Franco", logoUrl: "https://cdn/logo.png", brandAccentColor: "#7a2230" };

describe("renderSignatureHtml", () => {
  it("returns empty string when there's nothing to show", () => {
    expect(renderSignatureHtml({ id: "x" }, {}, { photo: null, logo: null })).toBe("");
  });

  it("renders name, title and venue name with the brand accent", () => {
    const html = renderSignatureHtml(
      { id: "x", fromName: "Ana-Maria", title: "Events Manager" },
      venue,
      { photo: null, logo: null },
    );
    expect(html).toContain("Ana-Maria");
    expect(html).toContain("Events Manager");
    expect(html).toContain("Bar Franco");
    expect(html).toContain("#7a2230");
  });

  it("uses the provided image srcs (cid refs) over the profile's data URLs", () => {
    const html = renderSignatureHtml(
      { id: "x", fromName: "Ana", photo: "data:image/png;base64,AAAA", signatureLogo: "data:image/png;base64,BBBB" },
      venue,
      { photo: "cid:sigphoto@venueflow", logo: "cid:siglogo@venueflow" },
    );
    expect(html).toContain('src="cid:sigphoto@venueflow"');
    expect(html).toContain('src="cid:siglogo@venueflow"');
    expect(html).not.toContain("AAAA");
    expect(html).not.toContain("BBBB");
  });

  it("escapes HTML in user-entered fields", () => {
    const html = renderSignatureHtml(
      { id: "x", fromName: '<script>alert(1)</script>', signature: "a & b" },
      venue,
      { photo: null, logo: null },
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b");
  });

  it("falls back to the venue logo when the profile has none, as a data/http src", () => {
    const html = renderSignatureHtml({ id: "x", fromName: "Ana" }, venue);
    expect(html).toContain('src="https://cdn/logo.png"');
  });
});
