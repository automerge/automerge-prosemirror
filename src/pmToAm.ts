import {
  AddMarkStep,
  RemoveMarkStep,
  ReplaceStep,
  ReplaceAroundStep,
  Step,
} from "prosemirror-transform"
import { Node } from "prosemirror-model"
import { Prop, next as automerge } from "@automerge/automerge"
import { blocksFromNode, pmRangeToAmRange } from "./traversal"
import { next as am } from "@automerge/automerge"

export type ChangeFn<T> = (doc: T, field: string) => void

export default function (
  spans: am.Span[],
  steps: Step[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  pmDoc: Node,
  path: Prop[],
) {
  let unappliedMarks: AddMarkStep[] = []

  function flushMarks() {
    if (unappliedMarks.length > 0) {
      applyAddMarkSteps(spans, unappliedMarks, doc, path)
      unappliedMarks = []
    }
  }

  for (const step of steps) {
    //console.log(step)
    if (isAddMarkStep(step)) {
      unappliedMarks.push(step)
      continue
    } else {
      flushMarks()
    }
    oneStep(spans, step, doc, pmDoc, path)
    spans = automerge.spans(doc, path)
  }
  flushMarks()
}

function oneStep(
  spans: am.Span[],
  step: Step,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  pmDoc: Node,
  path: Prop[],
) {
  // This shenanigans with the constructor name is necessary for reasons I
  // don't really understand. I _think_ that the `*Step` classs we get
  // passed here can be slightly different to the classes we've imported if the
  // dependencies are messed up
  if (
    step.constructor.name === "ReplaceStep" ||
    step.constructor.name === "_ReplaceStep"
  ) {
    replaceStep(spans, step as ReplaceStep, doc, path, pmDoc)
  } else if (
    step.constructor.name === "ReplaceAroundStep" ||
    step.constructor.name === "_ReplaceAroundStep"
  ) {
    replaceAroundStep(step as ReplaceAroundStep, doc, pmDoc, path)
  } else if (
    step.constructor.name === "RemoveMarkStep" ||
    step.constructor.name === "_RemoveMarkStep"
  ) {
    removeMarkStep(spans, step as RemoveMarkStep, doc, path)
  }
}

function isAddMarkStep(step: Step): step is AddMarkStep {
  return (
    step.constructor.name === "AddMarkStep" ||
    step.constructor.name === "_AddMarkStep"
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function replaceStep(
  spans: am.Span[],
  step: ReplaceStep,
  doc: automerge.Doc<unknown>,
  field: Prop[],
  pmDoc: Node,
) {
  if (
    step.slice.content.childCount === 1 &&
    step.slice.content.firstChild?.isText
  ) {
    // This is a text insertion or deletion
    const amRange = pmRangeToAmRange(spans, { from: step.from, to: step.to })
    if (amRange == null) {
      throw new Error(
        `Could not find range (${step.from}, ${step.to}) in render tree`,
      )
    }
    let { start, end } = amRange
    if (start > end) {
      // eslint-disable-next-line @typescript-eslint/no-extra-semi
      ;[start, end] = [end, start]
    }

    const toDelete = end - start
    automerge.splice(
      doc,
      field,
      start,
      toDelete,
      step.slice.content.firstChild.text,
    )
    return
  }
  const applied = step.apply(pmDoc).doc
  if (applied == null) {
    throw new Error("Could not apply step to document")
  }
  //console.log(JSON.stringify(applied, null, 2))
  const newBlocks = blocksFromNode(applied)
  //console.log(JSON.stringify(newBlocks, null, 2))
  automerge.updateSpans(doc, field, newBlocks)
}

function replaceAroundStep(
  step: ReplaceAroundStep,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  pmDoc: Node,
  field: Prop[],
) {
  const applied = step.apply(pmDoc).doc
  if (applied == null) {
    throw new Error("Could not apply step to document")
  }
  //console.log(applied)
  const newBlocks = blocksFromNode(applied)
  //console.log(newBlocks)
  automerge.updateSpans(doc, field, newBlocks)
}

function applyAddMarkSteps(
  spans: am.Span[],
  steps: AddMarkStep[],
  doc: automerge.Doc<unknown>,
  field: Prop[],
) {
  type Mark = {
    range: { start: number; end: number }
    markName: string
    expand: "before" | "after" | "both" | "none"
    value: string | boolean
  }
  const marks: Mark[] = steps.map(step => {
    const amRange = pmRangeToAmRange(spans, { from: step.from, to: step.to })
    if (amRange == null) {
      throw new Error(
        `Could not find range (${step.from}, ${step.to}) in render tree`,
      )
    }
    const markName = step.mark.type.name
    const expand = step.mark.type.spec.inclusive ? "both" : "none"
    let value: string | boolean = true
    if (step.mark.attrs != null && Object.keys(step.mark.attrs).length > 0) {
      value = JSON.stringify(step.mark.attrs)
    }
    return { range: amRange, markName, expand, value }
  })

  const groupedMarks: Mark[] = marks.reduce((acc, mark) => {
    const lastGroup = acc[acc.length - 1]
    if (lastGroup == null) {
      return [mark]
    }
    if (
      lastGroup.markName === mark.markName &&
      lastGroup.expand === mark.expand &&
      lastGroup.value === mark.value
    ) {
      if (lastGroup.range.end === mark.range.start) {
        lastGroup.range.end = mark.range.end
        return acc
      } else {
        const spansBetween = spans.slice(lastGroup.range.end, mark.range.start)
        if (spansBetween.every(s => s.type === "block")) {
          lastGroup.range.end = mark.range.end
          return acc
        }
      }
    }
    acc.push(mark)
    return acc
  }, [] as Mark[])

  //console.log(groupedMarks)

  for (const mark of groupedMarks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    automerge.mark(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc as any,
      field,
      { start: mark.range.start, end: mark.range.end, expand: mark.expand },
      mark.markName,
      mark.value,
    )
  }
}

function removeMarkStep(
  spans: am.Span[],
  step: RemoveMarkStep,
  doc: automerge.Doc<unknown>,
  field: Prop[],
) {
  const amRange = pmRangeToAmRange(spans, { from: step.from, to: step.to })
  if (amRange == null) {
    throw new Error(
      `Could not find range (${step.from}, ${step.to}) in render tree`,
    )
  }
  const { start, end } = amRange
  if (start == null || end == null) {
    throw new Error(
      `Could not find step.from (${step.from}) or step.to (${step.to}) in render tree`,
    )
  }
  const markName = step.mark.type.name
  const expand = step.mark.type.spec.inclusive ? "both" : "none"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  automerge.unmark(doc as any, field, { start, end, expand }, markName)
}
