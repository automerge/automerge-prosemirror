import { AutomergeUrl } from "@automerge/automerge-repo"
import { useHandle } from "@automerge/automerge-repo-react-hooks"
import { useEffect, useRef, useState } from "react"
import { EditorState, Transaction } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { exampleSetup } from "prosemirror-example-setup"
import {
  syncPlugin,
  docFromSpans,
  basicSchemaAdapter,
} from "@automerge/prosemirror"
import { next as am } from "@automerge/automerge"
import "prosemirror-example-setup/style/style.css"
import "prosemirror-menu/style/menu.css"
import "prosemirror-view/style/prosemirror.css"
import "./App.css"

function App({ docUrl }: { docUrl: AutomergeUrl }) {
  const editorRoot = useRef<HTMLDivElement>(null)
  const handle = useHandle<{ text: string }>(docUrl)
  const [loaded, setLoaded] = useState(handle && handle.docSync() != null)
  useEffect(() => {
    if (handle != null) {
      handle.whenReady().then(() => {
        if (handle.docSync() != null) {
          setLoaded(true)
        }
      })
    }
  }, [handle])

  useEffect(() => {
    const adapter = basicSchemaAdapter
    let view: EditorView
    if (editorRoot.current != null && loaded) {
      view = new EditorView(editorRoot.current, {
        state: EditorState.create({
          schema: adapter.schema, // It's important that we use the schema from the mirror
          plugins: [
            ...exampleSetup({ schema: adapter.schema }),
            syncPlugin({ adapter, handle, path: ["text"] }),
          ],
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          doc: docFromSpans(adapter, am.spans(handle.docSync()!, ["text"])),
        }),
        dispatchTransaction: (tx: Transaction) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          view!.updateState(view.state.apply(tx))
        },
      })
    }
    return () => {
      if (view != null) {
        view.destroy()
      }
    }
  }, [editorRoot, loaded, handle])

  return <div id="editor" ref={editorRoot}></div>
}

export default App
