import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // relative paths so the build runs from any folder (itch.io zip)
  test: {
    globals: true,
    environment: "node",
  },
});
