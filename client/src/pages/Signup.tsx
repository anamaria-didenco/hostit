import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";

// Self-serve sign-up: creates a venue owner account and lands them on the
// dashboard (via the one-screen welcome). Styled to match Login.tsx exactly so
// the two screens read as a pair. The existing login flow is untouched.
export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Which field the error is about, so it can be marked invalid and focused.
  const [errorField, setErrorField] = useState<"email" | "password" | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  function fail(message: string, field: "email" | "password" | null) {
    setError(message);
    setErrorField(field);
    if (field === "email") emailRef.current?.focus();
    if (field === "password") passwordRef.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setErrorField(null);
    // Checked here rather than by disabling Create account, so the reason is
    // shown instead of a faded button that does nothing.
    if (!email.trim()) {
      fail("Enter your email address.", "email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      fail("Enter a valid email address, like name@yourvenue.co.nz.", "email");
      return;
    }
    if (password.length < 8) {
      fail("Use a password of at least 8 characters.", "password");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, name: name.trim() || undefined }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        fail(data.error ?? "Sign-up failed.", res.status === 409 ? "email" : null);
      } else {
        // New account → one-screen welcome, then the dashboard checklist.
        navigate("/welcome");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div role="main" className="min-h-screen bg-[#fffdf9] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img src="/logo-icon.png" alt="VenueFlow" className="h-12 w-auto" />
          </div>
          <div className="font-sans text-[10px] font-extrabold uppercase tracking-[0.32em] text-[#2f5488] mb-2">VenueFlow</div>
          <h1 className="font-serif text-3xl font-semibold tracking-[-0.01em] text-[#211d18]">Create your account</h1>
          <p className="text-[#6a6256] text-sm mt-1">Set up your venue in a couple of minutes</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="bg-[#fffdf9] rounded-lg border-[1.5px] border-[#e6dccb] p-6 space-y-4">
          <div>
            <label htmlFor="name" className="block font-sans text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#6a6256] mb-1.5">
              Your name <span className="text-[#7e7466] font-medium normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jordan"
              autoComplete="name"
              className="w-full px-3 py-2.5 rounded-[4px] border-[1.5px] border-[#e6dccb] text-sm text-[#211d18] placeholder-[#7e7466] focus:outline-none focus:ring-[3px] focus:ring-[#2f5488]/20 focus:border-[#2f5488] transition"
            />
          </div>
          <div>
            <label htmlFor="email" className="block font-sans text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#6a6256] mb-1.5">
              Email
            </label>
            <input
              id="email"
              ref={emailRef}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@venue.co.nz"
              required
              aria-invalid={errorField === "email" ? true : undefined}
              aria-describedby={errorField === "email" ? "signup-error" : undefined}
              autoComplete="email"
              className="w-full px-3 py-2.5 rounded-[4px] border-[1.5px] border-[#e6dccb] text-sm text-[#211d18] placeholder-[#7e7466] focus:outline-none focus:ring-[3px] focus:ring-[#2f5488]/20 focus:border-[#2f5488] transition"
            />
          </div>
          <div>
            <label htmlFor="password" className="block font-sans text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#6a6256] mb-1.5">
              Password
            </label>
            <input
              id="password"
              ref={passwordRef}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              aria-invalid={errorField === "password" ? true : undefined}
              aria-describedby={errorField === "password" ? "signup-password-help signup-error" : "signup-password-help"}
              autoComplete="new-password"
              className="w-full px-3 py-2.5 rounded-[4px] border-[1.5px] border-[#e6dccb] text-sm text-[#211d18] placeholder-[#7e7466] focus:outline-none focus:ring-[3px] focus:ring-[#2f5488]/20 focus:border-[#2f5488] transition"
            />
            {/* The rule stays on screen: the placeholder vanished on the first keystroke. */}
            <p id="signup-password-help" className="text-xs text-[#6a6256] mt-1.5">At least 8 characters.</p>
          </div>

          {error && (
            <p id="signup-error" role="alert" className="text-sm text-[#a02b1f] bg-[#f9e3e0] rounded-[4px] px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2f5488] text-white font-sans font-bold py-2.5 rounded-[6px] text-sm hover:bg-[#25426c] hover:-translate-y-px transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating your account…" : "Create account"}
          </button>

          <p className="text-center text-sm text-[#6a6256]">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-[#2f5488] hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
