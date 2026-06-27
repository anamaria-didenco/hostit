import { useState } from "react";
import { useLocation } from "wouter";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Email is optional — if blank, server falls back to the single-admin
      // ADMIN_PASSWORD flow. If provided, it looks up the user's per-account
      // password hash created via Settings → Team.
      const body: { password: string; email?: string } = { password };
      if (email.trim()) body.email = email.trim().toLowerCase();
      const res = await fetch("/api/auth/local-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
      } else {
        navigate("/dashboard");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fffdf9] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img src="/logo-icon.png" alt="VenueFlow" className="h-12 w-auto" />
          </div>
          <div className="font-sans text-[10px] font-extrabold uppercase tracking-[0.32em] text-[#2f5488] mb-2">VenueFlow</div>
          <h1 className="font-serif text-3xl font-semibold tracking-[-0.01em] text-[#211d18]">Sign in</h1>
          <p className="text-[#6a6256] text-sm mt-1">Enter your details to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#fffdf9] rounded-lg border-[1.5px] border-[#e6dccb] p-6 space-y-4">
          <div>
            <label htmlFor="email" className="block font-sans text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#6a6256] mb-1.5">
              Email <span className="text-[#a39684] font-medium normal-case tracking-normal">(leave blank for owner)</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@venue.co.nz"
              autoComplete="username"
              className="w-full px-3 py-2.5 rounded-[4px] border-[1.5px] border-[#e6dccb] text-sm text-[#211d18] placeholder-[#a39684] focus:outline-none focus:ring-[3px] focus:ring-[#2f5488]/20 focus:border-[#2f5488] transition"
            />
          </div>
          <div>
            <label htmlFor="password" className="block font-sans text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#6a6256] mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoFocus
              autoComplete="current-password"
              className="w-full px-3 py-2.5 rounded-[4px] border-[1.5px] border-[#e6dccb] text-sm text-[#211d18] placeholder-[#a39684] focus:outline-none focus:ring-[3px] focus:ring-[#2f5488]/20 focus:border-[#2f5488] transition"
            />
          </div>

          {error && (
            <p className="text-sm text-[#a02b1f] bg-[#f9e3e0] rounded-[4px] px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-[#2f5488] text-white font-sans font-bold py-2.5 rounded-[6px] text-sm hover:bg-[#25426c] hover:-translate-y-px transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
