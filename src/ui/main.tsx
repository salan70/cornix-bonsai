import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { applyInitialTheme } from "./state/use-theme.ts";
import "./styles/index.css";

const initialTheme = applyInitialTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App initialTheme={initialTheme} />
  </StrictMode>,
);
