// Entry point: mounts the React app with router and global styles.
// ========================
// Imports
// ========================
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import "./styles/index.css";

// ========================
// Bootstrap
// ========================
// Mount the root app into the Vite root element.
ReactDOM.createRoot(document.getElementById("root")).render(
  // Keep StrictMode for dev safety checks and lifecycle warnings.
  <React.StrictMode>
    {/* Router wraps the full app so all pages can use route hooks/components. */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
