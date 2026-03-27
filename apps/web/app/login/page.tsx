"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Shield } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("admin@proba-space.eu");
  const [password, setPassword] = useState("spaceguard123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      // Use full page navigation so AuthProvider reads fresh localStorage on mount
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
            SpaceGuard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Cybersecurity Platform for Space Infrastructure
          </p>
        </div>

        {/* Login form */}
        <form
          onSubmit={handleSubmit}
          autoComplete="off"
          className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-slate-400 mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-slate-800 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
              placeholder="operator@example.eu"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate-400 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-slate-800 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
              placeholder="Enter password"
            />
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-9 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {/* Dev hint */}
        <p className="text-[10px] text-slate-600 text-center mt-4">
          Demo: admin@proba-space.eu / spaceguard123
        </p>
      </div>
    </div>
  );
}
