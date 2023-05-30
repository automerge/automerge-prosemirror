import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { type Extend, Patch, Prop } from "@automerge/automerge";
import pmToAm from "./pmToAm";
import amToPm from "./amToPm";
import {EditorView} from "prosemirror-view";
import { schema } from "prosemirror-schema-basic"

// The name of the meta field that indicates that a transaction was generated
// from logic within the editor
const TX_FROM_INSIDE: string = "fromInside"

type EventReceiver = (args: {patches: Array<Patch>}) => void;

export interface Emitter {
  on(event: "patch", rec: EventReceiver): void;
  off(event: "patch", rec: EventReceiver): void;
}

type ChangeFn = (doc: Extend<any>, field: string) => void
type Change = (change: ChangeFn) => void

type Doc = {
  value: string
  path: [Prop]
  patches: Emitter,
  change: Change,
}

export default function(doc: Doc): Plugin {
  // Whether we are currently modifying the document in response to a 
  // transaction
  let inLocalChange = false
  return new Plugin({
    filterTransaction: (tr: Transaction, _state: EditorState) => {
      if (!tr.getMeta(TX_FROM_INSIDE)){
        inLocalChange = true
        pmToAm(tr, doc.change)
        inLocalChange = false
      }
      return true
    },
    view: (view: EditorView) => {
      resetContent(view, doc.value)
      const callback = ({patches}: {patches: Array<Patch>}) => {
        if (inLocalChange) return
        updateContent(view, patches)
      }
      doc.patches.on("patch", callback)
      return {
        destroy: () => {
          doc.patches.off("patch", callback)
        }
      }
    }
  })
}


function resetContent(view: EditorView, doc: string) {
  let reset = view.state.tr.deleteRange(0, view.state.doc.content.size)
  if (doc.length > 0) reset = reset.insert(0, schema.text(doc))
  reset.setMeta(TX_FROM_INSIDE, true)
  view.dispatch(reset)
}

function updateContent(view: EditorView, patches: Array<Patch>) {
  let tr = view.state.tr
  tr.setMeta(TX_FROM_INSIDE, true)
  amToPm(patches, ["text"], tr)
  view.dispatch(tr)
}
