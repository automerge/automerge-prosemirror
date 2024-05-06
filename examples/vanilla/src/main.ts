import { EditorState, Transaction } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { exampleSetup } from "prosemirror-example-setup"
import { AutoMirror } from "@automerge/prosemirror"
import { DocHandle, Repo, isValidAutomergeUrl } from "@automerge/automerge-repo"
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb"
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket"
import "prosemirror-example-setup/style/style.css"
import "prosemirror-menu/style/menu.css"
import "prosemirror-view/style/prosemirror.css"

const repo = new Repo({
  storage: new IndexedDBStorageAdapter("automerge"),
  network: [new BrowserWebSocketClientAdapter("wss://sync.automerge.org")],
})

// The document we're going to edit
let handle: DocHandle<{ text: string }>

// Get the document ID from the URL fragment if it's there. Otherwise, create
// a new document and update the URL fragment to match.
const docUrl = window.location.hash.slice(1)
if (docUrl && isValidAutomergeUrl(docUrl)) {
  handle = repo.find(docUrl)
} else {
  handle = repo.create({ text: "" })
  window.location.hash = handle.url
}
await handle.whenReady()

const mirror = new AutoMirror(["text"])

const view = new EditorView(document.querySelector("#editor"), {
  state: EditorState.create({
    doc: mirror.initialize(handle),
    plugins: exampleSetup({ schema: mirror.schema }),
  }),
  dispatchTransaction: (tx: Transaction) => {
    const newState = mirror.intercept(handle, tx, view.state)
    view.updateState(newState)
  },
})

handle.on("change", d => {
  const newState = mirror.reconcilePatch(
    d.patchInfo.before,
    d.doc,
    d.patches,
    view.state,
  )
  view.updateState(newState)
})
