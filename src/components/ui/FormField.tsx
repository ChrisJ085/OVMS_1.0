import React, { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FormFieldProps {
  label: string;
  error?: string;
  helpText?: string;
  isTextArea?: boolean;
  id?: string;
  className?: string;
  [key: string]: any;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  helpText,
  isTextArea,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || label.replace(/\s+/g, '-').toLowerCase();
  const baseClasses = `px-3 py-2 bg-slate-900 border rounded-md text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
    error ? 'border-red-500/50 focus:border-red-500' : 'border-slate-700 focus:border-slate-600'
  }`;
  
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-slate-300">
        {label}
      </label>
      {isTextArea ? (
        <textarea
          id={inputId}
          className={`${baseClasses} resize-y min-h-[80px]`}
          {...props}
        />
      ) : (
        <input
          id={inputId}
          className={baseClasses}
          {...props}
        />
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {helpText && !error && <p className="text-xs text-slate-500">{helpText}</p>}
    </div>
  );
};
