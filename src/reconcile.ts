import {Extend, Prop, Doc } from "@automerge/automerge"
import * as automerge from "@automerge/automerge"
import {EditorState} from "prosemirror-state"
import amToPm from "./amToPm"
import {getLastHeads, takeUnreconciledSteps, getPath, updateHeads, markAsReconciliation} from "./plugin"
import pmToAm from "./pmToAm"
import Invertible from "./invertible"

export type ChangeFn = (doc: Extend<any>) => void

export function reconcile(state: EditorState, change: ((_: ChangeFn) => void)): EditorState {
  // get patches since the last heads
  let lastHeads = getLastHeads(state)
  let result = state
  change(doc => {

    // Undo the unreconciled steps
    let [newState, unreconciled] = takeUnreconciledSteps(state)
    newState = invertSteps(unreconciled, newState)

    // Apply the unreconciled steps to the automerge doc
    let path = getPath(state)
    applyUnreconciled(unreconciled, doc, path)

    let newHeads = automerge.getHeads(doc)

    // Get the patches from the last heads to the current state of the doc and
    // apply them to the prosemirror doc
    let patches = automerge.diff(doc, lastHeads, newHeads)
    let tx = newState.tr
    amToPm(patches, path, markAsReconciliation(tx))
    newState = newState.apply(tx)

    // Update the last heads
    result = newState.apply(updateHeads(newState.tr, newHeads))
  })
  return result
}

export function invertSteps(steps: readonly Invertible[], state: EditorState): EditorState {
  // Iterate over steps in reverse and apply inverse to state
  let transform = state.tr
  for (let i = steps.length - 1; i >= 0; i--) {
    transform.step(steps[i].inverted)
  }
  return state.apply(markAsReconciliation(transform))
}

export function applyUnreconciled(steps: Invertible[], doc: Doc<any>, path: Prop[]) {
    let [subdoc, attr] = docAndAttr(doc, path)
    for (const step of steps) {
      pmToAm(step.step, step.doc, subdoc, attr)
    }
}

function docAndAttr(doc: Extend<any>, path: Prop[]): [Extend<any>, Prop] {
  let result_path = path.slice()
  while (result_path.length > 1) {
    doc = doc[result_path.shift()!]
  }
  return [doc, path[0]]
}
