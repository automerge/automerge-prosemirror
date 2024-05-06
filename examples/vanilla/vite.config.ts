import { defineConfig } from "vite"
import wasm from "vite-plugin-wasm"

export default defineConfig({
  // customize this to your repo name for github pages deploy
  base: "/",

  build: { target: "esnext" },

  plugins: [wasm()],

  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
})
