import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react';

interface PasswordChangePageProps {
  onSubmit: (newPass: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  onLogout: () => Promise<void>;
}

export const PasswordChangePage: React.FC<PasswordChangePageProps> = ({
  onSubmit,
  loading,
  error,
  onLogout
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (newPassword.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError('New passwords do not match.');
      return;
    }

    try {
      await onSubmit(newPassword);
      setSuccess(true);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to update password.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden p-8 space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-amber-500/10 text-amber-500 rounded-lg mb-2">
            <Lock className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            Password Reset Required
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            As a security measure, you must update your temporary password before accessing the Out-of-Stock Vulnerability Management System.
          </p>
        </div>

        {/* Errors */}
        {(error || localError) && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="font-medium">{localError || error}</span>
          </div>
        )}

        {success ? (
          <div className="space-y-4 text-center">
            <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-sm flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-500" />
              <span className="font-medium">Password successfully updated!</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your security configuration has been updated. Re-routing you to the operational workspaces...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-10 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                />
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm py-2.5 px-4 rounded-lg shadow-lg hover:shadow-amber-500/10 transition-all disabled:opacity-50"
              >
                {loading ? 'Updating Security...' : 'Save and Continue'}
              </button>

              <button
                type="button"
                onClick={onLogout}
                className="w-full border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-300 py-2 px-4 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                Cancel & Sign Out
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
