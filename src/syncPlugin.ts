import { Plugin, PluginKey, Selection } from "prosemirror-state"
import { next as am } from "@automerge/automerge"
import { DocHandle, DocHandleChangePayload } from "@automerge/automerge-repo"
import pmToAm from "./pmToAm"
import amToPm from "./amToPm"
import { docFromSpans } from "./traversal"
import { patchesToTr } from "./patchesToTr"
import { ChangeSet } from "prosemirror-changeset"
import { SchemaAdapter } from "./schema"
import { isArrayEqual } from "./utils"

export const syncPluginKey = new PluginKey("automerge-sync")

export const syncPlugin = <T>({
  adapter,
  handle,
  path,
}: {
  adapter: SchemaAdapter
  handle: DocHandle<T>
  path: am.Prop[]
}) => {
  let ignoreTr = false
  const plugin = new Plugin({
    key: syncPluginKey,
    view: view => {
      const onPatch: (args: DocHandleChangePayload<unknown>) => void = ({
        doc,
        patches,
        patchInfo,
      }) => {
        if (ignoreTr) return
        const tr = patchesToTr({
          adapter,
          path,
          before: patchInfo.before,
          after: doc,
          patches,
          state: view.state,
        })
        ignoreTr = true
        view.dispatch(tr)
        ignoreTr = false
      }
      handle.on("change", onPatch)
      return {
        destroy() {
          handle.off("change", onPatch)
        },
      }
    },
    appendTransaction(transactions, oldState, state) {
      if (ignoreTr) return

      transactions = transactions.filter(doc => doc.docChanged)
      if (transactions.length === 0) return undefined

      // Apply transactions to the automerge doc
      ignoreTr = true
      handle.change((doc: am.Doc<T>) => {
        for (const tx of transactions) {
          const spans = am.spans(doc, path)
          pmToAm(adapter, spans, tx.steps, doc, tx.docs[0], path)
        }
      })
      ignoreTr = false

      //eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const docBefore = handle.docSync()!
      const headsBefore = am.getHeads(docBefore)
      const spansBefore = am.spans(docBefore, path)

      //eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const docAfter = handle.docSync()!
      const headsAfter = am.getHeads(docAfter)
      const spansAfter = am.spans(docAfter, path)

      // Ignore if nothing changed.
      if (isArrayEqual(headsBefore, headsAfter)) return undefined

      // Check if ProseMirror doc matches the AutoMerge doc
      // by comparing changesets between the two transactions.
      const patches = am.diff(docAfter, headsBefore, headsAfter)
      const tx = amToPm(adapter, spansBefore, patches, path, oldState.tr)

      let amChangeSet = ChangeSet.create(oldState.doc)
      amChangeSet = amChangeSet.addSteps(
        oldState.doc,
        tx.mapping.maps,
        undefined,
      )

      let pmChangeSet = ChangeSet.create(oldState.doc)
      for (const tr of transactions) {
        pmChangeSet = pmChangeSet.addSteps(
          tr.docs[0],
          tr.mapping.maps,
          undefined,
        )
      }

      const diff = pmChangeSet.changedRange(amChangeSet)
      if (!diff || diff.from === diff.to) return undefined

      // Replace the diff range in ProseMirror doc from the AutoMerge doc.
      const doc = docFromSpans(adapter, spansAfter)
      const slice = doc.slice(diff.from, diff.to)
      const tr = state.tr
      tr.replace(diff.from, diff.to, slice)
      try {
        tr.setSelection(Selection.fromJSON(tr.doc, state.selection.toJSON()))
      } catch (e) {
        if (e instanceof RangeError) {
          // Sometimes the selection can't be mapped for some reason so we just give up and hope for the best
        } else {
          throw e
        }
      }
      tr.setStoredMarks(state.storedMarks)
      return tr
    },
  })
  return plugin
}
