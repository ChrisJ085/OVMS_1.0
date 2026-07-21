import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, AlertTriangle, Database, Info } from 'lucide-react';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { isFirebaseConfigured } from '../../../config/firebase';

interface LoginPageProps {
  onLoginSuccess: (email: string, pass: string) => Promise<void>;
  authError: string | null;
  loading: boolean;
  onTriggerBootstrap: () => Promise<void>;
}

export const LoginPage: React.FC<LoginPageProps> = ({ 
  onLoginSuccess, 
  authError, 
  loading,
  onTriggerBootstrap
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email.trim() || !password.trim()) {
      setFormError('Please enter both email and password.');
      return;
    }

    try {
      await onLoginSuccess(email.trim(), password);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleBootstrap = async () => {
    setBootstrapLoading(true);
    setBootstrapMsg(null);
    try {
      await onTriggerBootstrap();
      setBootstrapMsg('Bootstrap trigger successfully invoked. Default password is: Password123!');
    } catch (err: any) {
      setBootstrapMsg(`Bootstrap error: ${err.message || err}`);
    } finally {
      setBootstrapLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden p-8 space-y-6">
        
        {/* Brand / Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-brand-500/10 text-brand-500 rounded-lg mb-2">
            <Lock className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            OVMS Control Center
          </h1>
          <p className="text-sm text-slate-400">
            Out-of-Stock Vulnerability Management System
          </p>
        </div>

        {!isFirebaseConfigured && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-xs space-y-2 flex flex-col">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Firebase is not yet fully configured</span>
            </div>
            <span>Please configure the environment variables or use the developer bootstrap below to initialize the system.</span>
          </div>
        )}

        {/* Errors */}
        {(authError || formError) && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="font-medium">{formError || authError}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@gxo.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm py-2.5 px-4 rounded-lg shadow-lg hover:shadow-amber-500/10 transition-all disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        {/* Security / System Footer Info */}
        <div className="pt-4 border-t border-slate-800/60 flex flex-col gap-3 text-center text-xs text-slate-500">
          <div className="flex items-center justify-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Authorized access only. Logins are strictly audited.</span>
          </div>

          {/* Development Bootstrap Gated Tool */}
          <div className="mt-2 p-3 bg-slate-950 rounded-lg border border-slate-800/40 text-left space-y-2">
            <div className="flex items-center gap-1 text-slate-400 font-medium text-xs">
              <Database className="w-3.5 h-3.5 text-amber-500" />
              <span>Bootstrap Superuser Tool (Secure Admin Boot)</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              This initiates the secure server-side bootstrap process to provision <b>chris.jeal@gxo.com</b> as PLATFORM_SUPERUSER.
            </p>
            <button
              type="button"
              onClick={handleBootstrap}
              disabled={bootstrapLoading}
              className="text-[10px] w-full border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-300 py-1 px-2 rounded hover:bg-slate-800 font-medium transition-colors"
            >
              {bootstrapLoading ? 'Invoking bootstrap...' : 'Run Superuser Bootstrap'}
            </button>
            {bootstrapMsg && (
              <div className="p-2 bg-slate-900 border border-slate-800 text-[10px] text-amber-400 rounded-md">
                {bootstrapMsg}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
