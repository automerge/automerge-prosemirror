import { AutomergeUrl } from "@automerge/automerge-repo"
import { useDocHandle } from "@automerge/automerge-repo-react-hooks"
import { useEffect, useRef } from "react"
import { EditorState, Transaction } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { exampleSetup } from "prosemirror-example-setup"
import { init, basicSchemaAdapter } from "@automerge/prosemirror"
import "prosemirror-example-setup/style/style.css"
import "prosemirror-menu/style/menu.css"
import "prosemirror-view/style/prosemirror.css"
import "./App.css"

function App({ docUrl }: { docUrl: AutomergeUrl }) {
  const editorRoot = useRef<HTMLDivElement>(null)
  const handle = useDocHandle<{ text: string }>(docUrl)

  useEffect(() => {
    let view: EditorView

    if (editorRoot.current != null && handle != null) {
      const { pmDoc, schema, plugin } = init(handle, ["text"], {
        schemaAdapter: basicSchemaAdapter,
      })
      view = new EditorView(editorRoot.current, {
        state: EditorState.create({
          schema, // It's important that we use the schema from the mirror
          plugins: [...exampleSetup({ schema }), plugin],
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          doc: pmDoc,
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
  }, [editorRoot, handle])

  return <div id="editor" ref={editorRoot}></div>
}

export default App
