import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import wasm from "vite-plugin-wasm"
import topLevelAwait from "vite-plugin-top-level-await"

let base = "/"
if (process.env.GITHUB_PAGES) {
  base = "/automerge-prosemirror/"
}

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [wasm(), topLevelAwait(), react()],
})
