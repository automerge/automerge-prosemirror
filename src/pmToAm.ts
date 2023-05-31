import {ReplaceStep, Step } from 'prosemirror-transform';
import {Transaction} from 'prosemirror-state';
import {Prop, unstable as automerge} from "@automerge/automerge";
import { type Extend } from "@automerge/automerge"

export type ChangeFn = (doc: Extend<any>, field: string) => void

export default function(tx: Transaction, doc: Extend<any>, attr: Prop) {
  let pmDoc = tx.doc
  tx.steps.forEach(step => {
    if (step instanceof ReplaceStep) {
      replaceStep(step, doc, attr, pmDoc.textBetween(0, pmDoc.content.size, "\n\n"));
    }
    let stepResult = step.apply(pmDoc)
    if (stepResult.doc) pmDoc = stepResult.doc
  })
}

function replaceStep(step: ReplaceStep, doc: Extend<any>, field: Prop, currentText: string) {
  const text = step.slice.content.textBetween(0, step.slice.size, "\n\n");
  const toDelete = step.to - step.from
  const index = pmIdxToAmIdx(step.from, currentText)
  automerge.splice(doc, field, index, toDelete, text)
}

function pmIdxToAmIdx(pmIdx: number, pmText: string): number {
  let result = 0
  for (let i = 0; i < pmIdx; i++) {
    if (pmText[i] === "\n" && pmText[i+1] == "\n") {
      i++
    }
    result++
  }
  return result
}
