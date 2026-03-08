import { useState } from "react";
import { useParams } from "react-router-dom";
import { importPlayers } from "../../services/api";

export default function CsvImport() {
  const { auctionId } = useParams();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleUpload = async () => {
    if (!file || !auctionId) return;
    setUploading(true);
    setResult(null);
    try {
      const data = await importPlayers(auctionId, file);
      setResult({ success: true, message: `Imported ${data.imported ?? "?"} players successfully!` });
      setFile(null);
      const input = document.getElementById("csv-input") as HTMLInputElement;
      if (input) input.value = "";
    } catch (err: any) {
      setResult({ success: false, message: err.message || "Import failed" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-xl font-semibold">Import Players (CSV)</h2>
      <div className="space-y-2">
        <p className="text-sm text-gray-400">
          Upload a CSV file with player data. Expected columns:
        </p>
        <code className="block bg-gray-800 px-4 py-2 rounded text-sm text-emerald-400">
          name, role, team, fvm, price
        </code>
        <p className="text-xs text-gray-500">
          Roles: P (goalkeeper), D (defender), C (midfielder), A (forward).
          This will replace all existing players.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <input
          id="csv-input"
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-gray-800 file:text-white file:font-medium file:cursor-pointer hover:file:bg-gray-700"
        />
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold px-6 py-2 rounded transition-colors disabled:opacity-50"
        >
          {uploading ? "Importing…" : "Import"}
        </button>
      </div>
      {result && (
        <div className={`p-4 rounded-lg border ${
          result.success
            ? "bg-emerald-900/20 border-emerald-700 text-emerald-400"
            : "bg-red-900/20 border-red-700 text-red-400"
        }`}>
          {result.message}
        </div>
      )}
    </div>
  );
}