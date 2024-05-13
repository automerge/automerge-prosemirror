import {
  AddMarkStep,
  RemoveMarkStep,
  ReplaceStep,
  ReplaceAroundStep,
  Step,
} from "prosemirror-transform"
import { Mark, MarkType, Node } from "prosemirror-model"
import { Prop, next as automerge } from "@automerge/automerge"
import { blocksFromNode, pmRangeToAmRange } from "./traversal"
import { next as am } from "@automerge/automerge"
import { amMarksFromPmMarks, schemaAdapter } from "./schema"

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
    const stepId = step.toJSON()["stepType"]
    if (stepId === "addMark") {
      unappliedMarks.push(step as AddMarkStep)
      continue
    } else {
      flushMarks()
    }
    oneStep(spans, stepId, step, doc, pmDoc, path)
    const nextDoc = step.apply(pmDoc).doc
    if (nextDoc == null) {
      throw new Error("Could not apply step to document")
    }
    pmDoc = nextDoc
    spans = automerge.spans(doc, path)
  }
  flushMarks()
}

function oneStep(
  spans: am.Span[],
  stepId: string,
  step: Step,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  pmDoc: Node,
  path: Prop[],
) {
  if (stepId === "replace") {
    replaceStep(spans, step as ReplaceStep, doc, path, pmDoc)
  } else if (stepId === "replaceAround") {
    replaceAroundStep(step as ReplaceAroundStep, doc, pmDoc, path)
  } else if (stepId === "removeMark") {
    removeMarkStep(spans, step as RemoveMarkStep, doc, path)
  }
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

    const marks = step.slice.content.firstChild.marks
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const length = step.slice.content.firstChild.text!.length
    reconcileMarks(doc, field, start, length, marks)
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
    //console.log(step)
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
    value: am.MarkValue
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
    const value = markAttrsToMarkValue(step.mark.type, step.mark.attrs)
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

function reconcileMarks(
  doc: am.Doc<unknown>,
  path: am.Prop[],
  index: number,
  length: number,
  marks: readonly Mark[],
) {
  const currentMarks = automerge.marksAt(doc, path, index)
  const newMarks = amMarksFromPmMarks(schemaAdapter, marks)

  const newMarkNames = new Set(Object.keys(newMarks))
  const currentMarkNames = new Set(Object.keys(currentMarks))

  for (const markName of newMarkNames) {
    if (
      !currentMarkNames.has(markName) ||
      newMarks[markName] !== currentMarks[markName]
    ) {
      automerge.mark(
        doc,
        path,
        { start: index, end: index + length, expand: "both" },
        markName,
        newMarks[markName],
      )
    }
  }
  for (const markName of currentMarkNames) {
    const markMapping = schemaAdapter.markMappings.find(
      m => m.automergeMarkName === markName,
    )
    if (markMapping == null) {
      continue
    }
    if (!newMarkNames.has(markName)) {
      automerge.unmark(
        doc,
        path,
        { start: index, end: index + length, expand: "both" },
        markName,
      )
    }
  }
}

function markAttrsToMarkValue(
  markType: MarkType,
  attrs: { [key: string]: string },
): am.MarkValue {
  if (markType.name === "link") {
    return JSON.stringify(attrs)
  } else if (
    markType.name === "strong" ||
    markType.name === "em" ||
    markType.name === "code"
  ) {
    return true
  } else {
    // Maybe we should just throw here?
    return true
  }
}
