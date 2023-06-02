import {Extend, Prop, Doc } from "@automerge/automerge"
import * as automerge from "@automerge/automerge"
import {EditorState} from "prosemirror-state"
import amToPm from "./amToPm"
import {getLastHeads, takeUnreconciledSteps, getPath, updateHeads, markAsReconciliation, getDoc} from "./plugin"
import pmToAm from "./pmToAm"
import Invertible from "./invertible"

export type ChangeFn = (doc: Doc<any>) => Doc<any>

export function reconcile(state: EditorState, merge: (_: Doc<any>) => Doc<any>): EditorState {
  let lastHeads = getLastHeads(state)

  let [newState, unreconciled] = takeUnreconciledSteps(state)

  let editorDoc = getDoc(state)
  let path = getPath(state)

  // Apply the unreconciled steps to the editor doc
  editorDoc = applyUnreconciled(unreconciled, editorDoc, path)

  // Merge the editor doc into the external doc
  let externalDoc = merge(editorDoc)

  // Now merge the remote changes into the editor doc
  editorDoc = automerge.merge(editorDoc, externalDoc)

  // We now have the editor doc representing both the local changes and the
  // remote changes and we've published the local changes to the remote doc.
  // All that remains to be done is to update the current editor state to 
  // match the new state in editorDoc

  // First undo the unreconciled steps from the editor state
  newState = invertSteps(unreconciled, newState)

  // Now get the patches to go from the state the last time we reconciled, to the current state
  // of the editor doc (which includes local and remote changes)
  let newHeads = automerge.getHeads(editorDoc)
  let patches = automerge.diff(editorDoc, lastHeads, newHeads)

  // Apply the patches to the editor state
  let tx = newState.tr
  amToPm(patches, path, markAsReconciliation(tx))
  newState = newState.apply(tx)

  // Update the last heads
  newState = newState.apply(updateHeads(newState.tr, newHeads))
  return newState
}

export function invertSteps(steps: readonly Invertible[], state: EditorState): EditorState {
  // Iterate over steps in reverse and apply inverse to state
  let transform = state.tr
  for (let i = steps.length - 1; i >= 0; i--) {
    transform.step(steps[i].inverted)
  }
  return state.apply(markAsReconciliation(transform))
}

export function applyUnreconciled(steps: Invertible[], doc: Doc<any>, path: Prop[]): Doc<any> {
    return automerge.change(doc, doc => {
      let [subdoc, attr] = docAndAttr(doc, path)
      for (const step of steps) {
        pmToAm(step.step, step.doc, subdoc, attr)
      }
    })
}

function docAndAttr(doc: Extend<any>, path: Prop[]): [Extend<any>, Prop] {
  let result_path = path.slice()
  while (result_path.length > 1) {
    doc = doc[result_path.shift()!]
  }
  return [doc, path[0]]
}
