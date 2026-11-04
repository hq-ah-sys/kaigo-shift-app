import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600/95 backdrop-blur-md px-4 py-2.5 text-xs font-bold text-white shadow-xl border border-amber-400 animate-bounce">
      <WifiOff className="w-4 h-4 shrink-0 text-amber-200" />
      <span>オフラインモード稼働中（キャッシュデータを表示しています）</span>
    </div>
  );
};
