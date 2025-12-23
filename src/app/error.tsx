"use client"; // Error components must be Client Components

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an internal service (optional)
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 space-y-6">
      
      {/* Icon */}
      <div className="p-4 bg-red-500/10 rounded-full border border-red-500/20">
        <AlertTriangle className="w-12 h-12 text-red-500" />
      </div>

      {/* Generic Message (No Technical Details) */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">System Sync Interrupted</h2>
        <p className="text-slate-400 max-w-md">
          Our security protocols detected a connection timeout. 
          No data has been lost. Please try reconnecting.
        </p>
      </div>

      {/* Retry Button */}
      <button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
        className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg transition-all border border-slate-700"
      >
        <RefreshCcw className="w-4 h-4" />
        Retry Connection
      </button>
      
      {/* Visual Noise (Optional Cyberpunk Decoration) */}
      <div className="text-[10px] font-mono text-slate-700 mt-8">
        ERR_CODE: {error.digest || "SEC_PROTO_0X1"}
      </div>
    </div>
  );
}