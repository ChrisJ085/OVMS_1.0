import { isSupabaseConfigured } from '../config/supabase';

export default function App() {
  const version = "0.1.0"; // Application version
  const configured = isSupabaseConfigured();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-lg w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Operations Visual Management System (OVMS)
          </h1>
          <p className="mt-2 text-gray-500 font-medium">Rebuild foundation ready</p>
        </div>

        <div className="pt-4 border-t border-gray-100 flex flex-col items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Version:</span>
            <span className="font-mono text-gray-900 font-medium">{version}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Supabase Status:</span>
            {configured ? (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
                Not Configured
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
