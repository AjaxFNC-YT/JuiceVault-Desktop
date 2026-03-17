import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { createPlaylist } from "@/lib/api";

function CreatePlaylistModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await createPlaylist(name.trim(), description.trim(), isPublic);
      onCreated?.(res?.data);
      onClose();
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to create playlist");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-2xl bg-[#141414] border border-white/[0.08] p-6"
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Create Playlist</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-brand-red/10 border border-brand-red/20 px-3 py-2 text-[13px] text-brand-red">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-white/30 mb-1.5 uppercase tracking-widest">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Playlist"
              className="w-full rounded-lg bg-white/[0.05] border border-white/[0.08] px-3 py-2 text-[13px] text-white placeholder-white/20 outline-none focus:border-white/15"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-white/30 mb-1.5 uppercase tracking-widest">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-lg bg-white/[0.05] border border-white/[0.08] px-3 py-2 text-[13px] text-white placeholder-white/20 outline-none focus:border-white/15"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="accent-brand-red"
            />
            <span className="text-[13px] text-white/50">Public playlist</span>
          </label>
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="rounded-lg bg-brand-red px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {loading ? "Creating..." : "Create"}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default CreatePlaylistModal;
