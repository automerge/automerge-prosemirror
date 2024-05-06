import { defineConfig } from "vite"
import wasm from "vite-plugin-wasm"

let base = "/"
if (process.env.GITHUB_PAGES) {
  base = "/automerge-prosemirror/"
}

export default defineConfig({
  base,

  build: { target: "esnext" },

  plugins: [wasm()],

  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
})
