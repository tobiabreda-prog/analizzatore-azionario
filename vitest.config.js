import { defineConfig, configDefaults } from "vitest/config";
import viteConfig from "./vite.config.js";

export default defineConfig({
  ...viteConfig,
  test: {
    exclude: [...configDefaults.exclude, "tests/e2e/**"]
  }
});
