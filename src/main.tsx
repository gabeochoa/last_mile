import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "./style.css";

import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.querySelector<HTMLDivElement>("#app")!;
createRoot(root).render(<App />);
