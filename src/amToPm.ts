import * as am from "@automerge/automerge/slim"
import { DelPatch, Patch, type Prop } from "@automerge/automerge/slim"
import { Fragment, Slice, Mark } from "prosemirror-model"
import { Transaction } from "prosemirror-state"
import { amSpliceIdxToPmIdx, pmDocFromSpans } from "./traversal.js"
import { findBlockAtCharIdx, patchSpans } from "./maintainSpans.js"
import { isPrefixOfArray, isArrayEqual } from "./utils.js"
import { ReplaceStep } from "prosemirror-transform"
import { pmMarksFromAmMarks, SchemaAdapter } from "./schema.js"

type SpliceTextPatch = am.SpliceTextPatch

type MarkPatch = {
  action: "mark"
  path: Prop[]
  marks: am.Mark[]
}

export default function (
  adapter: SchemaAdapter,
  spansAtStart: am.Span[],
  patches: Array<Patch>,
  path: Prop[],
  tx: Transaction,
): Transaction {
  const gathered = gatherPatches(path, patches)
  let result = tx
  for (const patchGroup of gathered) {
    if (patchGroup.type === "text") {
      for (const patch of patchGroup.patches) {
        if (patch.action === "splice") {
          result = handleSplice(adapter, spansAtStart, patch, path, result)
          //console.log(`patch: ${JSON.stringify(patch)}`)
          //console.log(`spans before patch: ${JSON.stringify(spansAtStart, null, 2)}`)
          patchSpans(path, spansAtStart, patch)
          //console.log("patched spans", spansAtStart)
        } else if (patch.action === "del") {
          const patchIndex = patch.path[patch.path.length - 1] as number
          const block = findBlockAtCharIdx(spansAtStart, patchIndex)
          if (block != null) {
            result = handleBlockChange(
              adapter,
              path,
              spansAtStart,
              patchIndex,
              [patch],
              result,
            )
          } else {
            result = handleDelete(adapter, spansAtStart, patch, path, result)
          }
          patchSpans(path, spansAtStart, patch)
        } else if (patch.action === "mark") {
          result = handleMark(adapter, spansAtStart, patch, path, result)
          patchSpans(path, spansAtStart, patch)
        }
      }
    } else {
      result = handleBlockChange(
        adapter,
        path,
        spansAtStart,
        patchGroup.index,
        patchGroup.patches,
        result,
      )
    }
  }
  return result
}

export function handleSplice(
  adapter: SchemaAdapter,
  spans: am.Span[],
  patch: SpliceTextPatch,
  path: Prop[],
  tx: Transaction,
): Transaction {
  const index = charPath(path, patch.path)
  if (index === null) return tx
  const pmIdx = amSpliceIdxToPmIdx(adapter, spans, index)
  if (pmIdx == null) throw new Error("Invalid index")
  const content = patchContentToFragment(adapter, patch.value, patch.marks)
  tx = tx.step(new ReplaceStep(pmIdx, pmIdx, new Slice(content, 0, 0)))
  return tx
}

function handleDelete(
  adapter: SchemaAdapter,
  spans: am.Span[],
  patch: DelPatch,
  path: Prop[],
  tx: Transaction,
): Transaction {
  const index = charPath(path, patch.path)
  if (index === null) return tx
  const start = amSpliceIdxToPmIdx(adapter, spans, index)
  if (start == null) throw new Error("Invalid index")
  const end = start + (patch.length || 1)
  return tx.delete(start, end)
}

function handleMark(
  adapter: SchemaAdapter,
  spans: am.Span[],
  patch: MarkPatch,
  path: Prop[],
  tx: Transaction,
) {
  if (isArrayEqual(patch.path, path)) {
    for (const mark of patch.marks) {
      const pmStart = amSpliceIdxToPmIdx(adapter, spans, mark.start)
      const pmEnd = amSpliceIdxToPmIdx(adapter, spans, mark.end)
      if (pmStart == null || pmEnd == null) throw new Error("Invalid index")
      if (mark.value == null) {
        const markMapping = adapter.markMappings.find(
          m => m.automergeMarkName === mark.name,
        )
        const markType = markMapping
          ? markMapping.prosemirrorMark
          : adapter.unknownMark
        tx = tx.removeMark(pmStart, pmEnd, markType)
      } else {
        const pmMarks = pmMarksFromAmMarks(adapter, {
          [mark.name]: mark.value,
        })
        for (const pmMark of pmMarks) {
          tx = tx.addMark(pmStart, pmEnd, pmMark)
        }
      }
    }
  }
  return tx
}

export function handleBlockChange(
  adapter: SchemaAdapter,
  atPath: am.Prop[],
  spans: am.Span[],
  _blockIdx: number,
  patches: am.Patch[],
  tx: Transaction,
): Transaction {
  for (const patch of patches) {
    patchSpans(atPath, spans, patch)
  }
  //console.log("spans after block change", spans)
  const docAfter = pmDocFromSpans(adapter, spans)
  //console.log("doc after block change", docAfter)
  const change = findDiff(tx.doc.content, docAfter.content)
  if (change == null) return tx

  const $from = docAfter.resolve(change.start)
  const $to = docAfter.resolve(change.endB)
  const $fromA = tx.doc.resolve(change.start)
  const inlineChange =
    $from.sameParent($to) &&
    $from.parent.inlineContent &&
    $fromA.end() >= change.endA

  const chFrom = change.start
  const chTo = change.endA

  let handledByInline = false
  if (inlineChange) {
    if ($from.pos == $to.pos) {
      // Deletion
      handledByInline = true
      tx = tx.delete(chFrom, chTo)
    } else if (
      $from.parent.child($from.index()).isText &&
      $from.index() == $to.index() - ($to.textOffset ? 0 : 1)
    ) {
      handledByInline = true
      // Both positions in the same text node -- simply insert text
      const text = $from.parent.textBetween(
        $from.parentOffset,
        $to.parentOffset,
      )
      tx = tx.insertText(text, chFrom, chTo)
    }
  }
  if (!handledByInline) {
    tx = tx.replace(chFrom, chTo, docAfter.slice(change.start, change.endB))
  }

  return tx
}

function findDiff(
  a: Fragment,
  b: Fragment,
): { start: number; endA: number; endB: number } | null {
  let start = a.findDiffStart(b)
  if (start == null) return null
  //eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  let { a: endA, b: endB } = a.findDiffEnd(b)!
  if (endA < start && a.size < b.size) {
    if (
      start &&
      start < b.size &&
      isSurrogatePair(b.textBetween(start - 1, start + 1))
    )
      start -= 1
    endB = start + (endB - endA)
    endA = start
  } else if (endB < start) {
    if (
      start &&
      start < a.size &&
      isSurrogatePair(a.textBetween(start - 1, start + 1))
    )
      start -= 1
    endA = start + (endA - endB)
    endB = start
  }
  return { start, endA, endB }
}

function isSurrogatePair(str: string) {
  if (str.length != 2) return false
  const a = str.charCodeAt(0),
    b = str.charCodeAt(1)
  return a >= 0xdc00 && a <= 0xdfff && b >= 0xd800 && b <= 0xdbff
}

// If the path of the patch is of the form [path, <index>] then we know this is
// a path to a character within the sequence given by path
function charPath(textPath: Prop[], candidatePath: Prop[]): number | null {
  if (candidatePath.length !== textPath.length + 1) return null
  for (let i = 0; i < textPath.length; i++) {
    if (textPath[i] !== candidatePath[i]) return null
  }
  const index = candidatePath[candidatePath.length - 1]
  if (typeof index === "number") return index
  return null
}

function patchContentToFragment(
  adapter: SchemaAdapter,
  patchContent: string,
  marks?: am.MarkSet,
): Fragment {
  let pmMarks: Array<Mark> | undefined = undefined
  if (marks != null) {
    pmMarks = pmMarksFromAmMarks(adapter, marks)
  }

  // Splice is only ever called once a block has already been created so we're
  // only inserting text. This means we don't have to think about openStart
  // and openEnd
  return Fragment.from(adapter.schema.text(patchContent, pmMarks))
}

type GatheredPatch = TextPatches | BlockPatches

type TextPatches = {
  type: "text"
  patches: (am.SpliceTextPatch | am.DelPatch | MarkPatch)[]
}

type BlockPatches = {
  type: "block"
  index: number
  patches: am.Patch[]
}

function gatherPatches(textPath: am.Prop[], diff: am.Patch[]): GatheredPatch[] {
  const result: GatheredPatch[] = []

  type State =
    | { type: "gatheringBlock"; index: number; gathered: am.Patch[] }
    | {
        type: "gatheringText"
        gathered: (am.SpliceTextPatch | am.DelPatch | MarkPatch)[]
      }
    | { type: "transitioning" }
  let state: State = { type: "gatheringText", gathered: [] }

  function flush() {
    if (state.type === "gatheringBlock") {
      result.push({
        type: "block",
        index: state.index,
        patches: state.gathered,
      })
    } else if (state.type === "gatheringText") {
      result.push({ type: "text", patches: state.gathered })
    }
    state = { type: "transitioning" }
  }

  for (const patch of diff) {
    if (!isPrefixOfArray(textPath, patch.path)) {
      continue
    }
    if (isArrayEqual(textPath, patch.path) && patch.action === "mark") {
      if (state.type === "gatheringText") {
        state.gathered.push(patch)
      } else {
        flush()
        state = { type: "gatheringText", gathered: [patch] }
      }
    } else if (patch.path.length === textPath.length + 1) {
      const lastElem = patch.path[patch.path.length - 1]
      if (typeof lastElem === "number") {
        if (patch.action === "splice" || patch.action === "del") {
          if (state.type === "gatheringText") {
            state.gathered.push(patch)
          } else {
            flush()
            state = { type: "gatheringText", gathered: [patch] }
          }
        } else if (patch.action === "insert") {
          flush()
          state = { type: "gatheringBlock", index: lastElem, gathered: [patch] }
        }
      }
    } else {
      const index = patch.path[textPath.length]
      if (typeof index !== "number") {
        continue
      }
      if (state.type === "gatheringBlock" && state.index === index) {
        state.gathered.push(patch)
      } else {
        flush()
        state = { type: "gatheringBlock", index: index, gathered: [patch] }
      }
    }
  }
  flush()
  return result
}
