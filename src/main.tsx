import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startReminderService } from "./lib/reminders";

createRoot(document.getElementById("root")!).render(<App />);

// Kick off offline reminder scheduling for rich tasks.
startReminderService();

// Register service worker for PWA / offline shell
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
