import { Doc, Heads, Prop } from "@automerge/automerge"
import { unstable as automerge } from "@automerge/automerge"
import { EditorState, Transaction } from "prosemirror-state"
import { getPath, getLastHeads, updateHeads } from "./plugin"
import pmToAm from "./pmToAm"
import amToPm from "./amToPm"
import mapSelection from "./mapSelection"

type ChangeFn<T> = (doc: Doc<T>) => void

export function intercept<T>(
  change: (_atHeads: Heads, _doChange: ChangeFn<T>) => Doc<T>,
  intercepted: Transaction,
  state: EditorState
): EditorState {
  const headsBefore = getLastHeads(state)
  const path = getPath(state)

  // Apply the incoming transaction to the automerge doc
  const updated = change(headsBefore, doc => {
    const [subdoc, attr] = docAndAttr(doc, path)
    for (let i = 0; i < intercepted.steps.length; i++) {
      const step = intercepted.steps[i]
      const pmDoc = intercepted.docs[i]
      pmToAm(step, pmDoc, subdoc, attr)
    }
  })
  const headsAfter = automerge.getHeads(updated)

  // Get the corresponding patches and turn them into a transaction to apply to the editorstate
  const diff = automerge.diff(updated, headsBefore, headsAfter)

  const before = automerge.view(updated, headsBefore)
  // Create a transaction which applies the diff and updates the doc and heads
  let tx = amToPm(before, diff, path, state.tr)
  tx = mapSelection(intercepted, tx)
  tx = updateHeads(tx, headsAfter)

  return state.apply(tx)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function docAndAttr(doc: any, path: Prop[]): [any, Prop] {
  const result_path = path.slice()
  while (result_path.length > 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    doc = doc[result_path.shift()!]
  }
  return [doc, path[0]]
}
