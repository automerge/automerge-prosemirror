import {Doc, Extend, Heads, Prop} from "@automerge/automerge";
import {unstable as automerge} from "@automerge/automerge";
import {EditorState, Transaction} from "prosemirror-state";
import {getPath, getLastHeads, updateHeads, getMarks} from "./plugin";
import pmToAm from "./pmToAm";
import amToPm from "./amToPm";
import mapSelection from "./mapSelection"

type ChangeFn<T> = (doc: Doc<T>) => void

export function intercept<T>(currentHeads: Heads, change: (_: ChangeFn<T>) => Doc<T>, intercepted: Transaction, state: EditorState): EditorState {
  let headsBefore = getLastHeads(state)
  if (!headsEqual(headsBefore, currentHeads)) {
    throw new Error("Heads changed")
  }
  let path = getPath(state)
  let marks = getMarks<T>(state)

  // Apply the incoming transaction to the automerge doc
  let updated = change(doc => {
    let [subdoc, attr] = docAndAttr(doc, path)
    for (let i = 0; i < intercepted.steps.length; i++) {
      let step = intercepted.steps[i]
      let pmDoc = intercepted.docs[i]
      pmToAm(step, marks, pmDoc, subdoc, attr)
    }
  })
  let headsAfter = automerge.getHeads(updated)

  // Get the corresponding patches and turn them into a transaction to apply to the editorstate
  let diff = automerge.diff(updated, headsBefore, headsAfter)

  // Create a transaction which applies the diff and updates the doc and heads
  let tx = amToPm(updated, marks, diff, path, state.tr)
  tx = mapSelection(intercepted, tx)
  tx = updateHeads(tx, headsAfter)

  return state.apply(tx)
}

function docAndAttr(doc: Extend<any>, path: Prop[]): [Extend<any>, Prop] {
  let result_path = path.slice()
  while (result_path.length > 1) {
    doc = doc[result_path.shift()!]
  }
  return [doc, path[0]]
}

function headsEqual(a: Heads, b: Heads): boolean {
  if (a.length != b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false
  }
  return true
}
