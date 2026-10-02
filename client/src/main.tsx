import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import "./index.css";

// Registered unconditionally (not just when a user opts into push) so the
// browser's install-to-home-screen criteria are met regardless of whether
// push is ever enabled — lib/push.ts's own register() call for push later
// just reuses this same registration (idempotent per the SW spec).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
