import {Patch} from "@automerge/automerge";
import {Transaction} from "prosemirror-state";

export default function(patches: Array<Patch>): Array<Transaction> {
  for (const patch of patches) {
    console.log(JSON.stringify(patch))
  }
  return []
}
