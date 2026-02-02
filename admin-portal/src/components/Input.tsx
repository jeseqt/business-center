import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({ className = '', label, error, icon, id, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
            {icon}
          </div>
        )}
        <input
          id={id}
          className={`flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${icon ? 'pl-9' : ''} ${error ? 'border-red-500 focus-visible:ring-red-500' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
