import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@telegram-apps/telegram-ui/dist/styles.css";
import { App } from "./App";
import { TelegramRoot } from "./components/TelegramRoot";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TelegramRoot>
      <App />
    </TelegramRoot>
  </StrictMode>,
);
