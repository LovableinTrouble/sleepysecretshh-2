import { useEffect, useState } from "react";
import { X, User, Key, Check, Loader as Loader2, RefreshCw } from "lucide-react";
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
  const [generating, setGenerating] = useState(false);
  const [generatedNumber, setGeneratedNumber] = useState<string | null>(null);

  // Check for existing account on mount
  useEffect(() => {
    if (open) {
      getCurrentAccount().then(setAccount);
      setError(null);
    }
  }, [open]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    setGenerating(true);

    try {
      const newAccount = await createAccount();
      if (newAccount) {
        setAccount(newAccount);
        setGeneratedNumber(newAccount.accountNumber);
        setTab("login"); // Show login tab with the new number
      } else {
        setError("Failed to create account. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setGenerating(false);
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
    setGeneratedNumber(null);
    setAccountNumber("");
    setError(null);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
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
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Account Sync</p>
              <p className="text-xs text-white/50">Sync across devices</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5">
          {account ? (
            /* Logged in state */
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-primary/30">
                  <Check className="h-7 w-7 text-primary" />
                </div>
              </div>

              <p className="mb-1 text-sm text-white/80">Your account number</p>

              {/* Account number display */}
              <div className="relative mb-4 flex items-center justify-center gap-2 rounded-xl bg-white/[0.05] px-4 py-3 ring-1 ring-white/10">
                <span className="font-mono text-2xl font-bold tracking-wider text-white">
                  {account.accountNumber}
                </span>
                <button
                  onClick={() => copyToClipboard(account.accountNumber)}
                  className="rounded-lg bg-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/15 hover:text-white"
                >
                  Copy
                </button>
              </div>

              <p className="mb-4 text-xs text-white/50">
                Save this number to login on other devices
              </p>

              <div className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3 ring-1 ring-emerald-500/20">
                <p className="text-xs text-emerald-400">
                  Watch history and preferences will sync automatically
                </p>
              </div>

              <button
                onClick={handleLogout}
                className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Log out
              </button>
            </div>
          ) : (
            /* Login/Create tabs */
            <>
              {/* Tab selector */}
              <div className="mb-5 flex rounded-xl bg-white/5 p-1">
                <button
                  onClick={() => {
                    setTab("create");
                    setError(null);
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                    tab === "create"
                      ? "bg-primary text-primary-foreground"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Create Account
                </button>
                <button
                  onClick={() => {
                    setTab("login");
                    setError(null);
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                    tab === "login"
                      ? "bg-primary text-primary-foreground"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Login
                </button>
              </div>

              {tab === "create" ? (
                /* Create account */
                <div className="text-center">
                  <div className="mb-4 flex justify-center">
                    {generating ? (
                      <div className="flex h-16 w-16 items-center justify-center">
                        <div className="relative h-12 w-12">
                          <div className="absolute inset-0 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10">
                        <Key className="h-6 w-6 text-white/60" />
                      </div>
                    )}
                  </div>

                  <p className="mb-4 text-sm text-white/70">
                    Generate a unique account number to sync your watch history and preferences across all your devices.
                  </p>

                  {generatedNumber && (
                    <div className="mb-4 rounded-xl bg-primary/10 px-4 py-3 ring-1 ring-primary/20">
                      <p className="text-xs text-white/60 mb-1">Your new account number:</p>
                      <p className="font-mono text-xl font-bold text-primary">{generatedNumber}</p>
                      <p className="text-xs text-white/50 mt-1">Save this number!</p>
                    </div>
                  )}

                  <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </span>
                    ) : (
                      "Generate Account Number"
                    )}
                  </button>
                </div>
              ) : (
                /* Login */
                <div>
                  <div className="mb-4">
                    <label className="mb-2 block text-xs text-white/60">Enter your account number</label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.toUpperCase())}
                      placeholder="ABC123XY"
                      maxLength={8}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-lg font-bold tracking-wider text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <button
                    onClick={handleLogin}
                    disabled={loading || !accountNumber.trim()}
                    className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
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
                <div className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 ring-1 ring-red-500/20">
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-5 py-3 text-center">
          <p className="text-xs text-white/40">
            Account numbers sync your data across devices
          </p>
        </div>
      </div>
    </div>
  );
}
