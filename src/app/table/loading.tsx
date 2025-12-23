export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-32 bg-slate-800 rounded animate-pulse"></div>
        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800 gap-1">
          <div className="h-8 w-20 bg-slate-800 rounded animate-pulse"></div>
          <div className="h-8 w-20 bg-slate-800/50 rounded animate-pulse"></div>
        </div>
      </div>
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm">
        <div className="h-64 w-full bg-slate-900/50 animate-pulse"></div>
      </div>
    </div>
  );
}