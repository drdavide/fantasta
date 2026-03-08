import { useState, useEffect } from "react";
import { apiFetch } from "../../services/api";

interface Settings {
  id: number;
  budget: number;
  max_players: number;
  max_goalkeepers: number;
  max_defenders: number;
  max_midfielders: number;
  max_forwards: number;
  timer_duration: number;
  auction_status: string;
}

export default function LeagueSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await apiFetch("/league/settings");
      setSettings(data);
    } catch (err: any) {
      setMessage("Failed to load settings: " + err.message);
    }
  };

  const handleChange = (field: keyof Settings, value: number) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage("");
    try {
      await apiFetch("/league/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setMessage("Settings saved!");
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <p className="text-gray-400">Loading settings…</p>;

  const fields: { label: string; key: keyof Settings; min: number }[] = [
    { label: "Starting Budget", key: "budget", min: 1 },
    { label: "Max Players per Team", key: "max_players", min: 1 },
    { label: "Max Goalkeepers", key: "max_goalkeepers", min: 0 },
    { label: "Max Defenders", key: "max_defenders", min: 0 },
    { label: "Max Midfielders", key: "max_midfielders", min: 0 },
    { label: "Max Forwards", key: "max_forwards", min: 0 },
    { label: "Timer Duration (seconds)", key: "timer_duration", min: 5 },
  ];

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-xl font-semibold">League Settings</h2>

      {fields.map(({ label, key, min }) => (
        <div key={key}>
          <label className="block text-sm text-gray-400 mb-1">{label}</label>
          <input
            type="number"
            min={min}
            value={settings[key] as number}
            onChange={(e) => handleChange(key, parseInt(e.target.value) || 0)}
            className="w-full px-4 py-2 rounded bg-gray-800 border border-gray-700 focus:border-yellow-500 focus:outline-none"
          />
        </div>
      ))}

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold px-6 py-2 rounded transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {message && (
          <span className={message.startsWith("Error") ? "text-red-400 text-sm" : "text-emerald-400 text-sm"}>
            {message}
          </span>
        )}
      </div>

      <div className="pt-4 border-t border-gray-800">
        <p className="text-sm text-gray-500">
          Auction status: <span className="font-semibold text-white">{settings.auction_status}</span>
        </p>
      </div>
    </div>
  );
}