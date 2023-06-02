import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import { Step, Transform } from "prosemirror-transform"
import * as automerge  from "@automerge/automerge";
import {Doc, Heads, Prop} from "@automerge/automerge";
import Invertible from "./invertible"

// The name of the meta field that holds the last heads we reconciled with
const AM_PLUGIN: string = "automergePlugin"
const NEW_HEADS: string = "am_newHeads"
const RESET_UNRECONCILED: string = "am_resetUnreconciledSteps"
const IS_RECONCILIATION: string = "am_isReconciliation"

const pluginKey: PluginKey<State> = new PluginKey(AM_PLUGIN)


type State = {
  lastHeads: Heads
  path: Prop[]
  unreconciledSteps: Invertible[]
  doc: Doc<any>,
}

export default function(doc: Doc<any>, path: Prop[]): Plugin {
  return new Plugin({
    key: pluginKey,
    state: {
      init: () => ({ 
        lastHeads: automerge.getHeads(doc) ,
        path,
        unreconciledSteps: [],
        doc: automerge.clone(doc),
      }),
      apply: (tr: Transaction, prev: State): State => {
        if (isReconciliation(tr)) {
          return prev
        }
        let newHeads: Heads = tr.getMeta(NEW_HEADS)
        if (newHeads) {
          return {
            ...prev,
            lastHeads: newHeads,
          }
        } else if (tr.getMeta(RESET_UNRECONCILED)) {
          return {
            ...prev,
            unreconciledSteps: [],
          }
        } else {
          return {
            ...prev,
            unreconciledSteps: prev.unreconciledSteps.concat(unreconciledFrom(tr)),
          }
        }
      }
    }
  })
}

function unreconciledFrom(transform: Transform): Invertible[] {
  let result = []
  for (let i = 0; i < transform.steps.length; i++)
    result.push(new Invertible(transform.steps[i],
                               transform.steps[i].invert(transform.docs[i]),
                               transform.docs[i]))
  return result
}

export function getPath(state: EditorState): Prop[] {
  return pluginKey.getState(state)!.path
}

export function getLastHeads(state: EditorState): Heads {
  return pluginKey.getState(state)!.lastHeads
}

export function updateHeads(tr: Transaction, heads: Heads): Transaction {
  return tr.setMeta(NEW_HEADS, heads)
}

export function markAsReconciliation(tr: Transaction): Transaction {
  return tr.setMeta(IS_RECONCILIATION, true)
}

function isReconciliation(tr: Transaction): boolean {
  return !!tr.getMeta(IS_RECONCILIATION)
}

export function getDoc(state: EditorState): Doc<any> {
  return pluginKey.getState(state)!.doc
}

export function takeUnreconciledSteps(state: EditorState): [EditorState, Invertible[]] {
  let txns = pluginKey.getState(state)!.unreconciledSteps
  let tr = state.tr.setMeta(RESET_UNRECONCILED, true)
  return [state.apply(tr), txns]
}

