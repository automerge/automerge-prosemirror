import {ReplaceStep, Step } from 'prosemirror-transform';
import {Transaction} from 'prosemirror-state';
import {Prop, unstable as automerge} from "@automerge/automerge";
import { type Extend } from "@automerge/automerge"

export type ChangeFn = (doc: Extend<any>, field: string) => void

export default function(tx: Transaction, doc: Extend<any>, attr: Prop) {
  for (let i = 0; i < tx.steps.length; i++) {
    const step = tx.steps[i]
    const pmDoc = tx.docs[i]
    if (step instanceof ReplaceStep) {
      replaceStep(step, doc, attr, pmDoc.textBetween(0, pmDoc.content.size, "\n\n"));
    }
  }
}

function replaceStep(step: ReplaceStep, doc: Extend<any>, field: Prop, currentText: string) {
  let text = step.slice.content.textBetween(0, step.slice.size, "\n\n");
  if (text === "" && step.slice.openEnd === 1) {
    text = "\n\n"
  }
  const toDelete = step.to - step.from
  const index = pmIdxToAmIdx(step.from, currentText)
  automerge.splice(doc, field, index, toDelete, text)
}

function pmIdxToAmIdx(pmIdx: number, pmText: string): number {
  let result = 0
  for (let i = 0; i < pmIdx; i++) {
    if (pmText[i] === "\n" && pmText[i+1] == "\n") {
      pmIdx += 2
    }
    result++
  }
  // -1 for the initial paragraph
  return result - 1
}
