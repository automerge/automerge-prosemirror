import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { type Extend, Patch } from "@automerge/automerge";
import pmToAm from "./pmToAm";
import {EditorView} from "prosemirror-view";

type EventReceiver = (args: {patches: Array<Patch>}) => void;

interface Emitter {
  on(event: "patch", rec: EventReceiver): void;
  off(event: "patch", rec: EventReceiver): void;
}

type ChangeFn = (doc: Extend<any>, field: string) => void
type Change = (change: ChangeFn) => void


type Args = {
  doChange: Change,
  patches: Emitter
}

export default function({doChange, patches}: Args): Plugin {
  return new Plugin({
    filterTransaction: (tr: Transaction, _state: EditorState) => {
      pmToAm(tr, doChange)
      return true
    },
    view: (_view: EditorView) => {
      const callback = (args: {patches: Array<Patch>}) => {
        console.log("patch", args)
      }
      patches.on("patch", callback)
      return {
        destroy: () => {
          patches.off("patch", callback)
        }
      }
    }
  })
}

