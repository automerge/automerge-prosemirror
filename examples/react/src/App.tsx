import { AutomergeUrl, DocHandleChangePayload } from "@automerge/automerge-repo"
import { useHandle } from "@automerge/automerge-repo-react-hooks"
import { useEffect, useRef, useState } from "react"
import { EditorState, Transaction } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { exampleSetup } from "prosemirror-example-setup"
import { AutoMirror } from "@automerge/prosemirror"
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
    const mirror = new AutoMirror(["text"])
    let view: EditorView
    const onPatch: (args: DocHandleChangePayload<unknown>) => void = ({
      doc,
      patches,
      patchInfo,
    }) => {
      //console.log(`${name}: patch received`)
      const newState = mirror.reconcilePatch(
        patchInfo.before,
        doc,
        patches,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        view!.state,
      )
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      view!.updateState(newState)
    }
    if (editorRoot.current != null && loaded) {
      view = new EditorView(editorRoot.current, {
        state: EditorState.create({
          schema: mirror.schema, // It's important that we use the schema from the mirror
          plugins: exampleSetup({ schema: mirror.schema }),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          doc: mirror.initialize(handle!),
        }),
        dispatchTransaction: (tx: Transaction) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const newState = mirror.intercept(handle!, tx, view!.state)
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          view!.updateState(newState)
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      handle!.on("change", onPatch)
    }
    return () => {
      if (handle != null) {
        handle.off("change", onPatch)
      }
      if (view != null) {
        view.destroy()
      }
    }
  }, [editorRoot, loaded, handle])

  return <div id="editor" ref={editorRoot}></div>
}

export default App
