import { useState } from "react";
import LeagueSettings from "../components/admin/LeagueSettings";
import TeamManager from "../components/admin/TeamManager";
import CsvImport from "../components/admin/CsvImport";
import AuctionControls from "../components/admin/AuctionControls";
import UserManager from "../components/admin/UserManager";

const tabs = ["League", "Teams", "Import CSV", "Auction", "Users"] as const;
type Tab = typeof tabs[number];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("League");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-yellow-400">Admin Panel</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-yellow-500 text-gray-900"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        {activeTab === "League" && <LeagueSettings />}
        {activeTab === "Teams" && <TeamManager />}
        {activeTab === "Import CSV" && <CsvImport />}
        {activeTab === "Auction" && <AuctionControls />}
        {activeTab === "Users" && <UserManager />}
      </div>
    </div>
  );
}