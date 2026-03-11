import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function Login() {
  const [error, setError] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    // Auto-login with admin password — no form needed during development
    fetch("/api/auth/local-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: import.meta.env.VITE_ADMIN_PASSWORD || "Valentina14" }),
      credentials: "include",
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          navigate("/dashboard");
        } else {
          setError(data.error ?? "Auto-login failed.");
        }
      })
      .catch(() => setError("Network error. Please try again."));
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-xl bg-[#8D957E] flex items-center justify-center">
              <span className="text-white font-bold text-sm">H</span>
            </div>
            <span className="font-bold text-gray-900 text-xl tracking-tight">HOSTit</span>
          </div>
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>
          <a
            href="/dashboard"
            className="inline-block bg-[#8D957E] text-white font-semibold py-2.5 px-6 rounded-lg text-sm hover:bg-[#7a8269] transition"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[#8D957E] flex items-center justify-center">
            <span className="text-white font-bold text-sm">H</span>
          </div>
          <span className="font-bold text-gray-900 text-xl tracking-tight">HOSTit</span>
        </div>
        <p className="text-gray-500 text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
