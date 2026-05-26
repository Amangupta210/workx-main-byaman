import React from 'react';
import AppSidebar from '@/components/layout/AppSidebar';
import CalendarPage from '@/components/calendar/CalendarPage';
import AIPanel from '@/components/ai/AIPanel';

export default function CalendarRoute() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <CalendarPage />
      </div>
      <AIPanel />
    </div>
  );
}
