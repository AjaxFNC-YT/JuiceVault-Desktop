import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import { login as apiLogin } from "@/lib/api";
import Background from "@/components/Background";

function Login({ onAuth }) {
  const [loginVal, setLoginVal] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!loginVal.trim() || !password.trim()) return;

    setError("");
    setLoading(true);

    try {
      const data = await apiLogin(loginVal.trim(), password);
      localStorage.setItem("loginId", loginVal.trim());
      localStorage.setItem("loginPw", btoa(password));
      onAuth(data.user, {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    } catch (err) {
      setError(typeof err === "string" ? err : err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden"
      style={{ background: "#000000" }}
    >
      <Background />

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[480px] mx-6"
      >
        <div className="rounded-3xl bg-white/[0.04] backdrop-blur-md px-10 py-9 border border-white/[0.08] shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <h1 className="text-2xl font-bold text-white tracking-tight">Welcome back</h1>
            <p className="text-[14px] text-white/40 mt-1.5">Sign in to JuiceVault</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-xl bg-brand-red/10 border border-brand-red/20 px-4 py-2.5 text-sm text-brand-red"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-white/30 mb-1.5 uppercase tracking-[0.15em]">
                Username or Email
              </label>
              <input
                type="text"
                value={loginVal}
                onChange={(e) => setLoginVal(e.target.value)}
                className="w-full rounded-xl bg-white/[0.06] px-4 py-3 text-[14px] text-white placeholder:text-white/20 outline-none ring-1 ring-white/[0.06] focus:ring-2 focus:ring-brand-purple/50 transition-all"
                placeholder="Enter your username or email"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-white/30 mb-1.5 uppercase tracking-[0.15em]">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.06] px-4 py-3 pr-10 text-[14px] text-white placeholder:text-white/20 outline-none ring-1 ring-white/[0.06] focus:ring-2 focus:ring-brand-purple/50 transition-all"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                  onMouseEnter={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.8)"}
                  onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.5)"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-xl bg-gradient-to-r from-brand-red to-brand-purple py-3 text-[14px] font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_4px_30px_rgba(147,51,234,0.3)] hover:shadow-[0_4px_40px_rgba(147,51,234,0.45)]"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={18} />
                </>
              )}
            </motion.button>
          </form>

          <div className="mt-5 pt-4 border-t border-white/[0.06] text-center">
            <p className="text-[13px] text-white/30">
              Don't have an account?{" "}
              <Link
                to="/signup"
                className="font-semibold text-brand-purple-light hover:text-white transition-colors"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default Login;
