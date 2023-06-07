import {BLOCK_MARKER} from "./constants"
import { Node} from "prosemirror-model"

export function amIdxToPmIdx(
  amIdx: number,
  amText: string
): number {
  // first, count how many paragraphs we have
  let idx = amText.indexOf(BLOCK_MARKER)
  let i = 0
  while (idx < amIdx && idx !== -1) {
    idx = amText.indexOf(BLOCK_MARKER, idx + 1)
    i++
  }

  // this is how many blocks precede the current one.
  // BtextBmore textBmo^re text after pos
  let automergeBlockCount = i

  // <p>text</p><p>more text</p><p>mo^re text after pos</p>
  let prosemirrorBlockCount = automergeBlockCount * 2

  let diff = prosemirrorBlockCount - automergeBlockCount
  return amIdx + diff + 1 // +1 for the opening paragraph tag
}

export function pmIdxToAmIdx(
  position: number,
  pmDoc: Node
): number {
  let idx = 0
  let blocks = 0
  let offset = 0
  let nudge = -1
  while (idx < pmDoc.content.childCount) {
    let contentNode = pmDoc.content.maybeChild(idx)
    if (!contentNode) {
      idx++
      continue
    }
    let nodeSize = contentNode.nodeSize
    offset += nodeSize

    // If the last node is an empty node then we nudge the index backward by one so 
    // we don't point past the end of the doc
    if (offset > position) {
      break
    }
    idx++
    blocks++
  }

  // *2 to account for the fact that prosemirror indices increment on entering
  // and leaving a the block
  let prosemirrorBlockCount = blocks * 2
  let automergeBlockCount = blocks

  let diff = prosemirrorBlockCount - automergeBlockCount

  let amPosition = position - diff + nudge

  return amPosition
}
