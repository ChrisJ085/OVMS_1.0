import React from 'react';

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
}

export function DataTable<T>({ columns, data, keyExtractor, emptyMessage = 'No records found' }: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm border-t border-slate-700/50">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-slate-300">
        <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 border-y border-slate-700">
          <tr>
            {columns.map((col, i) => (
              <th key={i} scope="col" className={`px-6 py-3 font-medium tracking-wider ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {data.map((row) => (
            <tr key={keyExtractor(row)} className="hover:bg-slate-700/20 transition-colors">
              {columns.map((col, i) => (
                <td key={i} className={`px-6 py-4 whitespace-nowrap ${col.className || ''}`}>
                  {typeof col.accessor === 'function' ? col.accessor(row) : (row[col.accessor] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
