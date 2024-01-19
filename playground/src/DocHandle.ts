import { next as automerge } from "@automerge/automerge"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PatchListener = (
  doc: automerge.Doc<any>,
  patches: Array<automerge.Patch>
) => void
type Listener = {
  heads: automerge.Heads
  callback: PatchListener
}

type ListenerId = symbol

export class DocHandle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: automerge.Doc<any>
  listeners: Map<ListenerId, Listener>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(doc: automerge.Doc<any>) {
    this.doc = doc
    this.listeners = new Map()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  changeAt = (
    atHeads: automerge.Heads,
    fn: (doc: automerge.Doc<unknown>) => void
  ): {newDoc: automerge.Doc<unknown>, newHeads: automerge.Heads | null} => {
    const { newDoc, newHeads } = automerge.changeAt(this.doc, atHeads, fn)
    this.doc = newDoc
    this._notifyListeners()
    return {newDoc: this.doc, newHeads}
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  change = (fn: (doc: automerge.Doc<unknown>) => void): automerge.Doc<unknown> => {
    this.doc = automerge.change(this.doc, fn)
    this._notifyListeners()
    return this.doc
  }

  addListener = (listener: PatchListener): ListenerId => {
    const heads = automerge.getHeads(this.doc)
    const id = Symbol()
    this.listeners.set(id, { heads, callback: listener })
    return id
  }

  removeListener = (id: ListenerId): void => {
    this.listeners.delete(id)
  }

  _notifyListeners = () => {
    const newHeads = automerge.getHeads(this.doc)
    for (const [_, listener] of this.listeners) {
      if (listener.heads !== newHeads) {
        const diff = automerge.diff(this.doc, listener.heads, newHeads)
        if (diff.length > 0) {
          listener.callback(this.doc, diff)
        }
        listener.heads = newHeads
      }
    }
  }
}
