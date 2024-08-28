import { next as am } from "@automerge/automerge"
import { EditorState, Transaction, Selection } from "prosemirror-state"
import pmToAm from "./pmToAm"
import amToPm from "./amToPm"
import { DocHandle } from "./types"
import { SchemaAdapter } from "./schema"

export function intercept<T>(
  adapter: SchemaAdapter,
  path: am.Prop[],
  handle: DocHandle<T>,
  intercepted: Transaction,
  state: EditorState,
): EditorState {
  const docBefore = handle.docSync()
  if (docBefore === undefined) throw new Error("handle is not ready")
  const headsBefore = am.getHeads(docBefore)
  const materializedSpans = am.spans(docBefore, path)

  // Apply the incoming transaction to the automerge doc
  handle.change(d => {
    const pmDoc = intercepted.docs[0]
    pmToAm(adapter, materializedSpans, intercepted.steps, d, pmDoc, path)
  })

  //eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const headsAfter = am.getHeads(handle.docSync()!)
  if (headsEqual(headsBefore, headsAfter)) {
    return state.apply(intercepted)
  }

  // Get the corresponding patches and turn them into a transaction to apply to the editorstate
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const diff = am.diff(handle.docSync()!, headsBefore, headsAfter)

  // Create a transaction which applies the diff and updates the doc and heads
  let tx = amToPm(adapter, materializedSpans, diff, path, state.tr)
  const nonInterceptedAfter = state.apply(intercepted)
  const selectionAfter = nonInterceptedAfter.selection
  try {
		tx.setSelection(Selection.fromJSON(tx.doc, selectionAfter.toJSON()));
  } catch (e) {
    if (e instanceof RangeError) {
      // Sometimes the selection can't be mapped for some reason so we just give up and hope for the best
    } else {
      throw e
    }
  }
  tx.setStoredMarks(nonInterceptedAfter.storedMarks)
  return state.apply(tx)
}

function headsEqual(headsBefore: am.Heads, headsAfter: am.Heads): boolean {
  if (headsBefore.length !== headsAfter.length) return false
  for (let i = 0; i < headsBefore.length; i++) {
    if (headsBefore[i] !== headsAfter[i]) return false
  }
  return true
}
