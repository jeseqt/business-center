import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, icon: Icon, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-4">
        {Icon && (
          <div className="bg-indigo-50 p-3 rounded-lg flex-shrink-0">
            <Icon className="h-6 w-6 text-indigo-600" />
          </div>
        )}
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          {description && (
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}
