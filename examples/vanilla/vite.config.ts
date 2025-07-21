import { defineConfig } from "vite"
import wasm from "vite-plugin-wasm"
import path from "path"

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

  // This is only necessary because we are using the local prosemirror build.
  // This leads to issues where multiple instances of prosemirror-model are
  // loaded, which breaks prosemirror. In a real application you don't need to
  // do this
  resolve: {
    alias: {
      "@automerge/prosemirror": path.resolve(__dirname, "../../dist"),
      "prosemirror-model": path.resolve(
        __dirname,
        "../../node_modules/prosemirror-model",
      ),
      "prosemirror-state": path.resolve(
        __dirname,
        "../../node_modules/prosemirror-state",
      ),
      "prosemirror-view": path.resolve(
        __dirname,
        "../../node_modules/prosemirror-view",
      ),
      "prosemirror-transform": path.resolve(
        __dirname,
        "../../node_modules/prosemirror-transform",
      ),
    },
  },
})
