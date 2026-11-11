import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, AlertTriangle, Info, Sparkles, ArrowRight, Layers } from 'lucide-react';
import { isSupabaseConfigured } from '../../../config/supabase';
import { usePageTitle } from '../../../hooks/usePageTitle';
import { SystemOverviewPage } from '../../../pages/SystemOverviewPage';

interface LoginPageProps {
  onLoginSuccess: (email: string, pass: string) => Promise<void>;
  authError: string | null;
  loading: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ 
  onLoginSuccess, 
  authError, 
  loading
}) => {
  usePageTitle('Login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showOverview, setShowOverview] = useState(false);

  if (showOverview) {
    return <SystemOverviewPage onBackToLogin={() => setShowOverview(false)} />;
  }

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

  const configured = isSupabaseConfigured();

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 select-none relative overflow-hidden">
      
      {/* Background Glow Effect */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden p-8 space-y-6 relative z-10">
        
        {/* Brand / Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl mb-1 shadow-sm">
            <Lock className="w-7 h-7 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            OVMS Control Center
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            Operations Visual Management System
          </p>
        </div>

        {/* System Overview Interactive Visual Banner */}
        <button
          type="button"
          onClick={() => setShowOverview(true)}
          className="w-full p-3.5 bg-gradient-to-r from-amber-500/10 via-slate-900 to-amber-500/5 hover:from-amber-500/20 hover:to-amber-500/15 border border-amber-500/30 rounded-xl transition-all text-left group flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-lg group-hover:scale-110 transition-transform">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <span>System Overview & Benefits</span>
                <span className="text-[10px] bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded font-mono font-extrabold uppercase">Interactive</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                Visual explanation of demand netting & TV flight board
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-400 transform group-hover:translate-x-1 transition-transform shrink-0" />
        </button>

        {!configured && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-xs space-y-2 flex flex-col">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Supabase is not yet configured</span>
            </div>
            <span>Please configure the environment variables VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</span>
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
          
          <button
            type="button"
            onClick={() => setShowOverview(true)}
            className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors font-medium underline flex items-center justify-center gap-1"
          >
            <Layers className="w-3 h-3" />
            <span>View Full System Architecture & Benefits</span>
          </button>
        </div>

      </div>
    </div>
  );
};

