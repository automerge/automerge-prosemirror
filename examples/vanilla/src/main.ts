import { EditorState, Transaction } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { exampleSetup } from "prosemirror-example-setup"
import {
  syncPlugin,
  basicSchemaAdapter,
  pmDocFromSpans,
} from "@automerge/prosemirror"
import { DocHandle, Repo, isValidAutomergeUrl } from "@automerge/automerge-repo"
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb"
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket"
import { next as am } from "@automerge/automerge"
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
  handle = await repo.find(docUrl)
} else {
  handle = repo.create({ text: "" })
  window.location.hash = handle.url
}
await handle.whenReady()

const adapter = basicSchemaAdapter

const view = new EditorView(document.querySelector("#editor"), {
  state: EditorState.create({
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    doc: pmDocFromSpans(adapter, am.spans(handle.docSync()!, ["text"])),
    plugins: [
      ...exampleSetup({ schema: adapter.schema }),
      syncPlugin({ adapter, handle, path: ["text"] }),
    ],
  }),
  dispatchTransaction: (tx: Transaction) => {
    view.updateState(view.state.apply(tx))
  },
})
