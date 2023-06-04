import {AddMarkStep, ReplaceStep, Step } from 'prosemirror-transform';
import { Node } from 'prosemirror-model';
import {Prop, unstable as automerge} from "@automerge/automerge";
import { type Extend } from "@automerge/automerge"

export type ChangeFn = (doc: Extend<any>, field: string) => void

export default function(step: Step, pmDoc: Node, doc: Extend<any>, attr: Prop) {
  if (step instanceof ReplaceStep) {
    replaceStep(step, doc, attr, pmDoc)
  } else if (step instanceof AddMarkStep) {
    addMarkStep(step, doc, attr, pmDoc)
  }
}

function replaceStep(step: ReplaceStep, doc: Extend<any>, field: Prop, pmDoc: Node) {
  let amText = doc[field].toString()
  let start = pmIdxToAmIdx(step.from, pmDoc)
  let end = pmIdxToAmIdx(step.to, pmDoc)

  let toDelete = end - start

  let toInsert = ""
  if (step.slice) {
    console.log(JSON.stringify(step.slice.toJSON(), null, 4))
    step.slice.content.forEach((node, _, idx) => {
      console.log(idx)
      if (node.type.name === 'text' && node.text) {
        toInsert += node.text
      } else if (['paragraph', 'heading'].indexOf(node.type.name) !== -1) {

        // if this is the first child and openEnd is zero then we must add the opening delimiter
        const isFirstNode = idx === 0
        const emitOpeningDelimiter = isFirstNode && step.slice.openStart === 0
        if (isFirstNode && emitOpeningDelimiter) {
          toInsert += "\n"
        }

        toInsert += node.textBetween(0, node.content.size)

        // If openEnd is greater than zero we effectively skip the closing delimiter for the paragraph,
        // which is a newline
        const isLastNode = idx === step.slice.content.childCount - 1
        const skipLastDelimiter = step.slice.openEnd > 0
        if (!(isLastNode && skipLastDelimiter)) {
          toInsert += "\n"
        }
      } else {
        alert(
          `Hi! We would love to insert that text (and other stuff), but
          this is a research prototype, and that action hasn't been
          implemented.`
        )
      }
    })
  }
  automerge.splice(doc, field, start, toDelete, toInsert)
}

function addMarkStep(step: AddMarkStep, doc: Extend<any>, field: Prop, pmDoc: Node) {
  const start = pmIdxToAmIdx(step.from, pmDoc)
  const end = pmIdxToAmIdx(step.to, pmDoc)
  automerge.mark(doc, field, {start, end, expand: "both"}, step.mark.type.name, true)
}

function pmIdxToAmIdx(
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
