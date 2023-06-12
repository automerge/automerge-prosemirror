import {AddMarkStep, RemoveMarkStep, ReplaceStep, Step } from 'prosemirror-transform';
import { Node } from 'prosemirror-model';
import {Prop, unstable as automerge} from "@automerge/automerge";
import { pmIdxToAmIdx } from './positions';
import { BLOCK_MARKER } from './constants';
import {schema} from 'prosemirror-schema-basic';
import {MarkMap} from './marks';

export type ChangeFn<T> = (doc: T, field: string) => void

export default function<T>(step: Step, marks: MarkMap<T>, pmDoc: Node, doc: T, attr: Prop) {
  // This shenanigans with the constructor name is necessary for reasons I 
  // don't really understand. I _think_ that the `*Step` classs we get
  // passed here can be slightly different to the classes we've imported if the 
  // dependencies are messed up
  if (step.constructor.name === "ReplaceStep") {
    replaceStep(step as ReplaceStep, doc, attr, pmDoc)
  } else if (step.constructor.name === "AddMarkStep") {
    addMarkStep(step as AddMarkStep, marks, doc, attr, pmDoc)
  } else if (step.constructor.name === "RemoveMarkStep") {
    removeMarkStep(step as RemoveMarkStep, doc, attr, pmDoc)
  }
}

function replaceStep(step: ReplaceStep, doc: any, field: Prop, pmDoc: Node) {
  let start = pmIdxToAmIdx(step.from, pmDoc)
  let end = pmIdxToAmIdx(step.to, pmDoc)

  let toDelete = end - start

  let toInsert = ""
  if (step.slice) {
    step.slice.content.forEach((node, _, idx) => {
      if (node.type.name === 'text' && node.text) {
        toInsert += node.text
      } else if (node.type.name === 'paragraph') {

        // if this is the first child of the slice and openStart is zero then
        // we must add the opening delimiter
        const isFirstNode = idx === 0
        const emitOpeningDelimiter = step.slice.openStart === 0
        if (isFirstNode && emitOpeningDelimiter) {
          toInsert += BLOCK_MARKER
        }

        toInsert += node.textBetween(0, node.content.size)

        // If openEnd is greater than zero we effectively skip the closing delimiter for the paragraph,
        // which is a newline
        const isLastNode = idx === step.slice.content.childCount - 1
        const skipLastDelimiter = step.slice.openEnd > 0
        if (!(isLastNode && skipLastDelimiter)) {
          toInsert += BLOCK_MARKER
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
  automerge.splice(doc, [field], start, toDelete, toInsert)
}

function addMarkStep<T>(step: AddMarkStep, marks: MarkMap<T>, doc: T, field: Prop, pmDoc: Node) {
  const start = pmIdxToAmIdx(step.from, pmDoc)
  const end = pmIdxToAmIdx(step.to, pmDoc)
  const markName = step.mark.type.name
  const expand = (!!step.mark.type.spec.inclusive) ? "both" : "none"
  let value = marks.createMark(doc, markName, step.mark.attrs)
  automerge.mark(doc as any, [field], {start, end, expand}, markName, value)
}

function removeMarkStep<T>(step: RemoveMarkStep, doc: T, field: Prop, pmDoc: Node) {
  const start = pmIdxToAmIdx(step.from, pmDoc)
  const end = pmIdxToAmIdx(step.to, pmDoc)
  const markName = step.mark.type.name
  const expand = (!!step.mark.type.spec.inclusive) ? "both" : "none"
  automerge.unmark(doc as any, [field], {start, end, expand}, markName)
}
