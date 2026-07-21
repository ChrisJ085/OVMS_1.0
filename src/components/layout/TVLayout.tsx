import React from 'react';
import { Outlet } from 'react-router-dom';

export const TVLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-300 font-sans">
      <main className="flex-1 overflow-hidden relative">
        <Outlet />
      </main>
    </div>
  );
};
