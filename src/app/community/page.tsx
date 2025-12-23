import { MessageCircle, Youtube, Hash } from "lucide-react";

export default function Community() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold text-white mb-4">JOIN THE SQUAD</h1>
      <p className="text-slate-400 mb-12">Connect with players, find matches, and watch the action live.</p>

      <div className="grid md:grid-cols-3 gap-6">
        
        {/* Discord */}
        <a href="#" className="p-6 rounded-2xl bg-[#5865F2]/10 border border-[#5865F2]/20 hover:bg-[#5865F2]/20 transition-all group">
          <Hash className="w-10 h-10 text-[#5865F2] mx-auto mb-4 group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-bold text-white">Discord</h3>
          <p className="text-sm text-slate-400 mt-2">Official Server</p>
        </a>

        {/* WhatsApp */}
        <a href="#" className="p-6 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 hover:bg-[#25D366]/20 transition-all group">
          <MessageCircle className="w-10 h-10 text-[#25D366] mx-auto mb-4 group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-bold text-white">WhatsApp</h3>
          <p className="text-sm text-slate-400 mt-2">Community Group</p>
        </a>

        {/* YouTube */}
        <a href="#" className="p-6 rounded-2xl bg-[#FF0000]/10 border border-[#FF0000]/20 hover:bg-[#FF0000]/20 transition-all group">
          <Youtube className="w-10 h-10 text-[#FF0000] mx-auto mb-4 group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-bold text-white">YouTube</h3>
          <p className="text-sm text-slate-400 mt-2">Live Streams</p>
        </a>

      </div>
    </div>
  );
}