import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PlayerProvider } from "./stores/playerStore.jsx";
import { ThemeProvider } from "./stores/themeStore.jsx";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <PlayerProvider>
          <App />
        </PlayerProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
