import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./ErrorBoundary.tsx";
import { DialogProvider } from "./components/Dialog.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <DialogProvider>
      <App />
    </DialogProvider>
  </ErrorBoundary>
);
