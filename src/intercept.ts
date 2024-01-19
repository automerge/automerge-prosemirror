import { Doc, Heads, Prop } from "@automerge/automerge"
import { next as am } from "@automerge/automerge"
import { EditorState, Transaction } from "prosemirror-state"
import { getPath, getLastHeads, updateHeads } from "./plugin"
import pmToAm from "./pmToAm"
import amToPm from "./amToPm"
import mapSelection from "./mapSelection"

type ChangeFn<T> = (doc: Doc<T>) => void

export function intercept<T>(
  change: (_atHeads: Heads, _doChange: ChangeFn<T>) => { newDoc: Doc<T>, newHeads: Heads | null },
  intercepted: Transaction,
  state: EditorState
): EditorState {
  const headsBefore = getLastHeads(state)
  const path = getPath(state)

  // Apply the incoming transaction to the automerge doc
  const {newDoc: updated} = change(headsBefore, doc => {
    const [subdoc, attr] = docAndAttr(doc, path)
    for (let i = 0; i < intercepted.steps.length; i++) {
      const step = intercepted.steps[i]
      console.log(step)
      const pmDoc = intercepted.docs[i]
      pmToAm(step, pmDoc, subdoc, attr)
    }
  })
  const headsAfter = am.getHeads(updated)

  // Get the corresponding patches and turn them into a transaction to apply to the editorstate
  const diff = am.diff(updated, headsBefore, headsAfter)
  console.log(JSON.stringify(diff))

  const before = am.view(updated, headsBefore)
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
