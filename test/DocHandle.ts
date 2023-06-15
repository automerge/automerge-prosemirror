import {unstable as automerge } from "@automerge/automerge"

export type PatchListener = (doc: automerge.Doc<any>, patches: Array<automerge.Patch>) => void
type Listener = {
  heads: automerge.Heads,
  callback: PatchListener,
}

export class DocHandle {
  doc: automerge.Doc<any>
  listeners: Array<Listener>
  
  constructor(doc: automerge.Doc<any>) {
    this.doc = doc
    this.listeners = []
  }

  changeAt = (atHeads: automerge.Heads, fn: (doc: automerge.Doc<any>) => void): automerge.Doc<any> => {
    this.doc = automerge.changeAt(this.doc, atHeads, fn)
    this._notifyListeners()
    return this.doc
  }

  change = (fn: (doc: automerge.Doc<any>) => void): automerge.Doc<any> => {
    this.doc = automerge.change(this.doc, fn)
    this._notifyListeners()
    return this.doc
  }

  addListener = (listener: PatchListener) => {
    const heads = automerge.getHeads(this.doc)
    this.listeners.push({heads, callback: listener})
  }

  _notifyListeners = () => {
    const newHeads = automerge.getHeads(this.doc)
    for (const listener of this.listeners) {
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
