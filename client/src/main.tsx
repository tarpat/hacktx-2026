import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { installGlobalSound } from "./audio/sound";
import { SoundToggle } from "./audio/SoundToggle";
import "./theme.css";
import "./styles.css";

installGlobalSound();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><BrowserRouter><App /><SoundToggle /></BrowserRouter></React.StrictMode>,
);
