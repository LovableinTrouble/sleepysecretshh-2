import { useEffect, useState } from "react";
import { X, User, Key, Check, Loader as Loader2, Copy, LogOut } from "lucide-react";
import {
  createAccount,
  loginWithAccountNumber,
  getCurrentAccount,
  clearStoredAccount,
  type Account,
} from "@/lib/account-sync";

interface AccountPopupProps {
  open: boolean;
  onClose: () => void;
}

export function AccountPopup({ open, onClose }: AccountPopupProps) {
  const [tab, setTab] = useState<"create" | "login">("create");
  const [loading, setLoading] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check for existing account on mount
  useEffect(() => {
    if (open) {
      getCurrentAccount().then(setAccount);
      setError(null);
      setTab("create");
    }
  }, [open]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);

    try {
      const newAccount = await createAccount();
      if (newAccount) {
        setAccount(newAccount);
      } else {
        setError("Failed to create account. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!accountNumber.trim()) {
      setError("Please enter an account number");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await loginWithAccountNumber(accountNumber.trim());
      if (result) {
        setAccount(result);
        setAccountNumber("");
        setError(null);
      } else {
        setError("Invalid account number. Please check and try again.");
      }
    } catch {
      setError("Failed to login. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredAccount();
    setAccount(null);
    setAccountNumber("");
    setError(null);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xs overflow-hidden rounded-2xl border border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl"
        style={{ animation: "accountPopIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)" }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/5 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3" style={{ animation: "fadeIn 0.2s ease-out 0.05s both" }}>
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Account</p>
            <p className="text-[11px] text-white/50">Sync across devices</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pb-4">
          {account ? (
            /* Logged in state */
            <div className="text-center" style={{ animation: "fadeIn 0.2s ease-out" }}>
              <div className="mb-3 flex justify-center">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/15 ring-1 ring-primary/25">
                  <Check className="h-5 w-5 text-primary" />
                </div>
              </div>

              <p className="text-[11px] text-white/60 mb-1">Your account number</p>

              {/* Account number display */}
              <div className="relative mb-3 flex items-center justify-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10">
                <span className="font-mono text-xl font-bold tracking-wide text-white">
                  {account.accountNumber}
                </span>
                <button
                  onClick={() => copyToClipboard(account.accountNumber)}
                  className="rounded-md bg-white/10 p-1.5 text-white/60 transition hover:bg-white/15 hover:text-white"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-500/15">
                <p className="text-[11px] text-emerald-400/90">
                  Watch history syncs automatically
                </p>
              </div>

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white/80"
              >
                <LogOut className="h-3 w-3" />
                Log out
              </button>
            </div>
          ) : (
            /* Login/Create tabs */
            <>
              {/* Tab selector */}
              <div className="mb-4 flex rounded-lg bg-white/5 p-0.5" style={{ animation: "fadeIn 0.15s ease-out 0.1s both" }}>
                <button
                  onClick={() => { setTab("create"); setError(null); }}
                  className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                    tab === "create"
                      ? "bg-primary text-primary-foreground"
                      : "text-white/55 hover:text-white/80"
                  }`}
                >
                  Create
                </button>
                <button
                  onClick={() => { setTab("login"); setError(null); }}
                  className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                    tab === "login"
                      ? "bg-primary text-primary-foreground"
                      : "text-white/55 hover:text-white/80"
                  }`}
                >
                  Login
                </button>
              </div>

              {tab === "create" ? (
                /* Create account */
                <div className="text-center" style={{ animation: "fadeIn 0.15s ease-out 0.15s both" }}>
                  <p className="mb-3 text-xs text-white/60">
                    Generate a unique number to sync watch history across devices.
                  </p>

                  <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-70"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Generating...
                      </span>
                    ) : (
                      "Generate Account Number"
                    )}
                  </button>
                </div>
              ) : (
                /* Login */
                <div style={{ animation: "fadeIn 0.15s ease-out 0.15s both" }}>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.toUpperCase())}
                    placeholder="Enter your number"
                    maxLength={8}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-center font-mono text-sm font-bold tracking-wide text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />

                  <button
                    onClick={handleLogin}
                    disabled={loading || !accountNumber.trim()}
                    className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Logging in...
                      </span>
                    ) : (
                      "Login"
                    )}
                  </button>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 ring-1 ring-red-500/20" style={{ animation: "shake 0.3s ease-out" }}>
                  <p className="text-[11px] text-red-400">{error}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes accountPopIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
        }
      `}</style>
    </div>
  );
}
