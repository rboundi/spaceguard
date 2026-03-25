"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateProfile } from "@/lib/api";
import { Bell, BellOff, User, Shield, Save, Check } from "lucide-react";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();

  const [name, setName] = useState("");
  const [notifyCriticalAlerts, setNotifyCriticalAlerts] = useState(true);
  const [notifyDeadlines, setNotifyDeadlines] = useState(true);
  const [notifyWeeklyDigest, setNotifyWeeklyDigest] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync from user on load
  useEffect(() => {
    if (user) {
      setName(user.name);
      setNotifyCriticalAlerts(user.notifyCriticalAlerts ?? true);
      setNotifyDeadlines(user.notifyDeadlines ?? true);
      setNotifyWeeklyDigest(user.notifyWeeklyDigest ?? true);
    }
  }, [user]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await updateProfile({
        name: name.trim(),
        notifyCriticalAlerts,
        notifyDeadlines,
        notifyWeeklyDigest,
      });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Manage your profile and notification preferences
        </p>
      </div>

      {/* Profile section */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <User size={15} className="text-slate-400" />
          <h2 className="text-sm font-medium text-slate-200">Profile</h2>
        </div>

        <div className="grid gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
            <div className="h-9 px-3 flex items-center rounded-md bg-slate-800/50 border border-slate-700/50 text-sm text-slate-400">
              {user.email}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-slate-800 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
            />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 border border-slate-700">
                <Shield size={12} className="text-blue-400" />
                <span className="text-xs text-slate-300 font-medium">{user.role}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Notification preferences section */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Bell size={15} className="text-slate-400" />
          <h2 className="text-sm font-medium text-slate-200">Email Notifications</h2>
        </div>

        <div className="space-y-3">
          <NotificationToggle
            label="Critical & High Alerts"
            description="Get emailed when a CRITICAL or HIGH severity alert is triggered"
            enabled={notifyCriticalAlerts}
            onChange={setNotifyCriticalAlerts}
          />
          <NotificationToggle
            label="NIS2 Deadline Warnings"
            description="Get emailed when a regulatory reporting deadline is approaching"
            enabled={notifyDeadlines}
            onChange={setNotifyDeadlines}
          />
          <NotificationToggle
            label="Weekly Digest"
            description="Receive a weekly summary of alerts, incidents, and compliance status"
            enabled={notifyWeeklyDigest}
            onChange={setNotifyWeeklyDigest}
          />
        </div>
      </section>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 h-9 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
        >
          {saved ? (
            <>
              <Check size={14} />
              Saved
            </>
          ) : (
            <>
              <Save size={14} />
              {saving ? "Saving..." : "Save changes"}
            </>
          )}
        </button>
        {error && (
          <span className="text-xs text-red-400">{error}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------

function NotificationToggle({
  label,
  description,
  enabled,
  onChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-md bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:border-slate-600 transition-colors"
      onClick={() => onChange(!enabled)}
    >
      <div className="flex items-center gap-3 min-w-0">
        {enabled ? (
          <Bell size={14} className="text-blue-400 shrink-0" />
        ) : (
          <BellOff size={14} className="text-slate-600 shrink-0" />
        )}
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-200">{label}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{description}</div>
        </div>
      </div>
      <div
        className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
          enabled ? "bg-blue-600" : "bg-slate-700"
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
    </div>
  );
}
