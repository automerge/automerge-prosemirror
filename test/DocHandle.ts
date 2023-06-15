import {unstable as automerge, SyncState, SyncMessage} from "@automerge/automerge"

export type PatchListener = (doc: automerge.Doc<any>, patches: Array<automerge.Patch>) => void
type Listener = {
  heads: automerge.Heads,
  callback: PatchListener,
}

type PeerId = string

export class DocHandle {
  doc: automerge.Doc<any>
  listeners: Array<Listener>
  syncStates: Map<PeerId, SyncState>
  
  constructor(doc: automerge.Doc<any>) {
    this.doc = doc
    this.listeners = []
    this.syncStates = new Map()
  }

  change = (atHeads: automerge.Heads, fn: (doc: automerge.Doc<any>) => void): automerge.Doc<any> => {
    this.doc = automerge.changeAt(this.doc, atHeads, fn)
    this._notifyListeners()
    return this.doc
  }

  receiveSyncMessage = (from: PeerId, msg: SyncMessage) => {
    let syncState = this._syncStateForPeer(from)
    const [newDoc, newSyncState, _] = automerge.receiveSyncMessage(this.doc, syncState, msg)
    this.doc = newDoc
    this.syncStates.set(from, newSyncState)
    this._notifyListeners()
  }

  generateSyncMessage = (to: PeerId): SyncMessage | null => {
    let syncState = this._syncStateForPeer(to)
    const [newSyncState, msg] = automerge.generateSyncMessage(this.doc, syncState)
    this.syncStates.set(to, newSyncState)
    return msg
  }

  addListener = (listener: PatchListener) => {
    const heads = automerge.getHeads(this.doc)
    this.listeners.push({heads, callback: listener})
  }

  _syncStateForPeer = (peer: PeerId): SyncState => {
    let syncState = this.syncStates.get(peer)
    if (!syncState) {
      syncState = automerge.initSyncState()
      this.syncStates.set(peer, syncState)
    }
    return syncState
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
