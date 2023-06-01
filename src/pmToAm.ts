import {AddMarkStep, ReplaceStep, Step } from 'prosemirror-transform';
import { Node } from 'prosemirror-model';
import {Transaction} from 'prosemirror-state';
import {Prop, unstable as automerge} from "@automerge/automerge";
import { type Extend } from "@automerge/automerge"

export type ChangeFn = (doc: Extend<any>, field: string) => void

export default function(step: Step, pmDoc: Node, doc: Extend<any>, attr: Prop) {
  const currentText = pmDoc.textBetween(0, pmDoc.content.size, "\n\n")
  if (step instanceof ReplaceStep) {
    replaceStep(step, doc, attr, currentText)
  } else if (step instanceof AddMarkStep) {
    addMarkStep(step, doc, attr, currentText)
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

function addMarkStep(step: AddMarkStep, doc: Extend<any>, field: Prop, currentText: string) {
  const start = pmIdxToAmIdx(step.from, currentText)
  const end = pmIdxToAmIdx(step.to, currentText)
  automerge.mark(doc, field, {start, end}, step.mark.type.name, true)
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
