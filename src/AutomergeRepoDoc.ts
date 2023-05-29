import {DocHandle} from "automerge-repo";
import { Prop, unstable as automerge } from "@automerge/automerge"
import { type Extend } from "@automerge/automerge"
import { type Emitter } from "./plugin"

export default class AutomergeRepoDoc {
  handle: DocHandle<any>;
  field: string;

  constructor(handle: DocHandle<any>, field: string) {
    this.handle = handle
    this.field = field
  }

  get value(): string {
    //@ts-ignore
    return this.handle.doc[this.field].toString()
  }

  get patches(): Emitter {
    return this.handle
  }

  get path(): [Prop] {
    return [this.field]
  }

  change = (changeFn: (doc: Extend<any>, field: string) => void) => {
    this.handle.change(doc => {
      changeFn(doc, this.field)
    })
  }
}
