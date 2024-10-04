import { next as A } from "@automerge/automerge/slim"

// This type is copied from automerge-repo so we don't have to depend on the whole automerge-repo
// package and so non automerge-repo users can implement it themselves
export type DocHandle<T> = {
  docSync(): T | undefined
  change: (fn: (doc: T) => void) => void
  on(event: "change", callback: (p: DocHandleChangePayload<T>) => void): void
  off(event: "change", callback: (p: DocHandleChangePayload<T>) => void): void
}

export interface DocHandleChangePayload<T> {
  /** The handle that changed */
  handle: DocHandle<T>
  /** The value of the document after the change */
  doc: A.Doc<T>
  /** The patches representing the change that occurred */
  patches: A.Patch[]
  /** Information about the change */
  patchInfo: A.PatchInfo<T>
}
