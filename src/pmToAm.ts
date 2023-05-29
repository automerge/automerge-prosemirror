import {ReplaceStep, Step } from 'prosemirror-transform';
import {Transaction} from 'prosemirror-state';
import {unstable as automerge} from "@automerge/automerge";
import { type Extend } from "@automerge/automerge"

export type ChangeFn = (doc: Extend<any>, field: string) => void

export default function(tx: Transaction, change: (_change: ChangeFn) => void) {
  change((doc: Extend<any>, field: string) => {
    tx.steps.forEach(step => {
      if (step instanceof ReplaceStep) {
        replaceStep(step, doc, field);
      }
    })
  })
}

function replaceStep(step: ReplaceStep, doc: Extend<any>, field: string) {
  const text = step.slice.content.textBetween(0, step.slice.size, "\n");
  const toDelete = step.to - step.from
  automerge.splice(doc, field, step.from - 1, toDelete, text)
}
