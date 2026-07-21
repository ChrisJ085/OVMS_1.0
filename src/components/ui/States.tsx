import React, { ReactNode } from 'react';
import { Loader2, AlertCircle, Clock, FileQuestion } from 'lucide-react';

export const LoadingState: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center p-12 text-slate-400">
    <Loader2 className="w-8 h-8 animate-spin mb-4 text-brand-500" />
    <p className="text-sm">{message}</p>
  </div>
);

export const ErrorState: React.FC<{ title?: string; message: string; action?: ReactNode }> = ({ 
  title = 'Something went wrong', 
  message, 
  action 
}) => (
  <div className="flex flex-col items-center justify-center p-12 text-center">
    <div className="w-12 h-12 rounded-full bg-red-950/50 flex items-center justify-center mb-4 border border-red-900">
      <AlertCircle className="w-6 h-6 text-red-500" />
    </div>
    <h3 className="text-lg font-medium text-slate-200 mb-2">{title}</h3>
    <p className="text-sm text-slate-400 max-w-md mb-6">{message}</p>
    {action}
  </div>
);

export const EmptyState: React.FC<{ title: string; message?: string; icon?: React.ElementType; action?: ReactNode }> = ({
  title,
  message,
  icon: Icon = FileQuestion,
  action
}) => (
  <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-700/50 rounded-lg bg-slate-800/20">
    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-4">
      <Icon className="w-6 h-6 text-slate-400" />
    </div>
    <h3 className="text-sm font-medium text-slate-200 mb-1">{title}</h3>
    {message && <p className="text-sm text-slate-500 max-w-sm mb-4">{message}</p>}
    {action}
  </div>
);

export const StaleDataWarning: React.FC<{ lastUpdated: Date; onRefresh?: () => void }> = ({ lastUpdated, onRefresh }) => (
  <div className="flex items-center justify-between p-3 bg-amber-950/30 border border-amber-900/50 rounded-md text-amber-400/90 text-sm">
    <div className="flex items-center gap-2">
      <Clock className="w-4 h-4" />
      <span>Data may be out of date. Last updated: {lastUpdated.toLocaleTimeString()}</span>
    </div>
    {onRefresh && (
      <button onClick={onRefresh} className="hover:text-amber-300 font-medium underline underline-offset-2">
        Refresh Now
      </button>
    )}
  </div>
);
