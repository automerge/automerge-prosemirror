import { Plugin, Transaction } from "prosemirror-state";
import * as automerge  from "@automerge/automerge";
import {Doc, Heads} from "@automerge/automerge";

// The name of the meta field that holds the last heads we reconciled with
export const AM_PLUGIN: string = "automergePlugin"

type State = {
  lastHeads: Heads
}

export default function(doc: Doc<any>): Plugin {
  return new Plugin({
    state: {
      init: () => ({ lastHeads: automerge.getHeads(doc) }),
      apply: (tr: Transaction, prev: State): State => {
        let newHeads: State = tr.getMeta(AM_PLUGIN)
        if (newHeads) {
          return newHeads
        }
        return prev
      }
    }
  })
}
