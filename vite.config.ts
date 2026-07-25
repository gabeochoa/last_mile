import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // relative paths so the build runs from any folder (itch.io zip)
  test: {
    globals: true,
    environment: "node",
  },
});
