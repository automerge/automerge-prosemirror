import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import wasm from "vite-plugin-wasm"
import path from "path"

export default defineConfig({
  // customize this to your repo name for github pages deploy
  base: "/",

  build: { target: "esnext" },

  plugins: [wasm(), react()],

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
