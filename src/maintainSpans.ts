import { next as am } from "@automerge/automerge/slim"
import { isPrefixOfArray, isArrayEqual } from "./utils.js"

export function patchSpans(
  atPath: am.Prop[],
  spans: am.Span[],
  patch: am.Patch,
) {
  if (isArrayEqual(atPath, patch.path)) {
    if (patch.action === "mark") {
      for (const mark of patch.marks) {
        markSpans(spans, mark)
      }
    }
  } else if (isPrefixOfArray(atPath, patch.path)) {
    if (patch.path.length === atPath.length + 1) {
      // This is either an insert or delete of a block
      if (patch.action === "insert") {
        insertBlock(spans, patch)
      } else if (patch.action === "del") {
        deleteSpans(spans, patch)
      } else if (patch.action === "splice") {
        spliceSpans(spans, patch)
      }
    } else {
      const index = patch.path[atPath.length]
      if (typeof index !== "number") {
        console.error(`Invalid path: ${patch.path}`)
        throw new Error("Invalid path: expected number when patching spans")
      }
      const block = findBlockAtCharIdx(spans, index)
      if (block == null) {
        throw new Error("Invalid path: unable to find block at index")
      }
      applyBlockPatch(atPath, patch, block)
    }
  }
}

function spliceSpans(spans: am.Span[], patch: am.SpliceTextPatch) {
  let idx = 0
  const patchIndex = patch.path[patch.path.length - 1]
  if (typeof patchIndex !== "number") {
    return
  }

  let spanIdx = 0
  while (spanIdx < spans.length) {
    const span = spans[spanIdx]
    // Scenarios
    // 1. We are inserting into the range of an existing text span
    //   * With the same marks
    //   * With different marks
    // 3. We are inserting at the end of an existing text span
    //   * With the same marks
    //   * With different marks
    // 4. We are inserting into the range of a block
    // 5. We are inserting at the end of a block

    if (span.type === "text") {
      if (idx <= patchIndex && idx + span.value.length > patchIndex) {
        const offset = patchIndex - idx
        const before = span.value.slice(0, offset)
        const after = span.value.slice(offset)
        if (marksEqual(span.marks, patch.marks)) {
          span.value = before + patch.value + after
        } else {
          const newSpans: am.Span[] = []
          const prevSpan = spans[spanIdx - 1]
          if (
            before.length === 0 &&
            prevSpan &&
            prevSpan.type === "text" &&
            marksEqual(prevSpan.marks, patch.marks)
          ) {
            prevSpan.value += patch.value
          } else {
            if (before.length > 0) {
              newSpans.push(
                makeTextSpan({
                  value: before,
                  marks: span.marks,
                }),
              )
            }
            newSpans.push(
              makeTextSpan({
                value: patch.value,
                marks: patch.marks,
              }),
            )
          }
          if (after.length > 0) {
            newSpans.push(
              makeTextSpan({
                value: after,
                marks: span.marks,
              }),
            )
          }
          spans.splice(spanIdx, 1, ...newSpans)
        }
        return
      } else {
        idx += span.value.length
        spanIdx += 1
      }
    } else {
      if (idx === patchIndex) {
        const prevSpan = spans[spanIdx - 1]
        if (
          prevSpan != null &&
          prevSpan.type === "text" &&
          marksEqual(prevSpan.marks, patch.marks)
        ) {
          // if the block marker is after a text span with the same marks,
          // add this text to that span
          prevSpan.value += patch.value
        } else {
          // otherwise insert a text span before the block
          const newSpan: am.Span = {
            type: "text",
            value: patch.value,
          }
          if (patch.marks != null) {
            newSpan.marks = patch.marks
          }
          spans.splice(spanIdx, 0, newSpan)
        }
        return
      }
      idx += 1
      spanIdx += 1
    }
  }
  if (idx === patchIndex) {
    //we're inserting at the end
    const lastSpan = spans[spans.length - 1]
    if (
      lastSpan &&
      lastSpan.type === "text" &&
      marksEqual(lastSpan.marks || {}, patch.marks || {})
    ) {
      lastSpan.value += patch.value
    } else {
      const newSpan: am.Span = {
        type: "text",
        value: patch.value,
      }
      if (patch.marks != null) {
        newSpan.marks = patch.marks
      }
      spans.push(newSpan)
    }
  }
}

function markSpans(spans: am.Span[], patch: am.Mark): void {
  let textPos = 0
  let i = 0

  while (i < spans.length) {
    const span = spans[i]

    if (span.type === "text") {
      const spanStart = textPos
      const spanEnd = textPos + span.value.length

      if (spanStart < patch.end && spanEnd > patch.start) {
        const startOffset = Math.max(0, patch.start - spanStart)
        const endOffset = Math.min(span.value.length, patch.end - spanStart)

        if (startOffset > 0) {
          spans.splice(
            i,
            1,
            makeTextSpan({
              value: span.value.slice(0, startOffset),
              marks: span.marks,
            }),
            makeTextSpan({
              value: span.value.slice(startOffset, endOffset),
              marks: {
                ...span.marks,
                [patch.name]: patch.value,
              },
            }),
          )
          i++
        } else {
          spans[i] = makeTextSpan({
            value: span.value.slice(0, endOffset),
            marks: {
              ...span.marks,
              [patch.name]: patch.value,
            },
          })
        }

        if (endOffset < span.value.length) {
          spans.splice(
            i + 1,
            0,
            makeTextSpan({
              value: span.value.slice(endOffset),
              marks: span.marks,
            }),
          )
        }

        // Merge with previous span if marks are the same
        const prevSpan = spans[i - 1]
        let thisSpan = spans[i]
        if (
          i > 0 &&
          prevSpan.type === "text" &&
          thisSpan.type === "text" &&
          marksEqual(prevSpan.marks, thisSpan.marks)
        ) {
          prevSpan.value += thisSpan.value
          spans.splice(i, 1)
        } else {
          i++
        }

        // Merge with next span if marks are the same
        const nextSpan = spans[i + 1]
        thisSpan = spans[i]
        if (
          i < spans.length - 1 &&
          nextSpan.type === "text" &&
          thisSpan.type === "text" &&
          marksEqual(nextSpan.marks, thisSpan.marks)
        ) {
          thisSpan.value += nextSpan.value
          spans.splice(i + 1, 1)
        }
      } else {
        i++
      }

      textPos += span.value.length
    } else {
      i++
      textPos += 1
    }
  }
}

function deleteSpans(spans: am.Span[], patch: am.DelPatch): void {
  const start = patch.path[patch.path.length - 1]
  if (typeof start !== "number") {
    throw new Error("Invalid path: expected number when deleting spans")
  }
  const end = start + (patch.length || 1)
  let deleteCount = 0
  // This is always the offset of the start of spans[i] in the _current_ spans
  // (i.e. not the original spans)
  let textPos = 0
  let i = 0

  // Returns the amount to rewind `textPos` by
  function mergeSpans(index: number): number | undefined {
    const prevSpan = spans[index - 1]
    const thisSpan = spans[index]
    if (
      prevSpan &&
      prevSpan.type === "text" &&
      thisSpan &&
      thisSpan.type === "text" &&
      marksEqual(prevSpan.marks, thisSpan.marks)
    ) {
      const rewind = prevSpan.value.length
      prevSpan.value += thisSpan.value
      spans.splice(index, 1)
      return rewind
    }
    return
  }

  while (i < spans.length && deleteCount < end - start) {
    const span = spans[i]
    const adjustedEnd = end - deleteCount

    if (span.type === "text") {
      const spanStart = textPos
      const spanEnd = textPos + span.value.length

      if (spanStart >= start && spanEnd <= adjustedEnd) {
        // Span is fully within the deletion range, remove it
        spans.splice(i, 1)
        deleteCount += span.value.length
        mergeSpans(i)
      } else if (spanStart < adjustedEnd && spanEnd > start) {
        // Span partially overlaps with the deletion range
        const startOffset = Math.max(0, start - spanStart)
        const endOffset = Math.min(span.value.length, adjustedEnd - spanStart)

        if (startOffset > 0 && endOffset < span.value.length) {
          // Split the span into two parts
          spans.splice(
            i,
            1,
            makeTextSpan({
              value: span.value.slice(0, startOffset),
              marks: span.marks,
            }),
            makeTextSpan({
              value: span.value.slice(endOffset),
              marks: span.marks,
            }),
          )
          i++
          ;(textPos += startOffset), (deleteCount += endOffset - startOffset)
        } else if (startOffset > 0) {
          deleteCount += span.value.length - startOffset
          // Truncate the end of the span
          span.value = span.value.slice(0, startOffset)
        } else if (endOffset < span.value.length) {
          deleteCount += endOffset
          // Truncate the start of the span
          span.value = span.value.slice(endOffset)
        }

        const rewind = mergeSpans(i)
        if (rewind) {
          textPos -= rewind
        } else {
          i++
          textPos += span.value.length
        }
      } else {
        textPos += span.value.length
        i++
      }
    } else if (span.type === "block") {
      if (textPos >= start && textPos < adjustedEnd) {
        // Block is within the deletion range, remove it
        spans.splice(i, 1)
        deleteCount += 1
        const rewind = mergeSpans(i)
        if (rewind) {
          i--
          textPos -= rewind
        }
      } else {
        textPos++
        i++
      }
    }
  }
}

export function applyBlockPatch(
  parentPath: am.Prop[],
  patch: am.Patch,
  block: { [key: string]: am.MaterializeValue },
) {
  const pathInBlock = patch.path.slice(parentPath.length + 1)
  if (patch.action === "put") {
    const target = resolveTarget(block, pathInBlock.slice(0, -1))
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const key = patch.path[patch.path.length - 1]
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    target[key] = copyValue(patch.value)
  } else if (patch.action === "insert") {
    const target = resolveTarget(block, pathInBlock.slice(0, -2))
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const insertAt = pathInBlock.pop()! as number
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const prop = pathInBlock.pop()!
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const arr = target[prop] as am.MaterializeValue[]
    if (!Array.isArray(arr)) {
      throw new Error("Invalid path: expected array when inserting")
    }
    arr.splice(insertAt, 0, ...copyValues(patch.values))
  } else if (patch.action === "splice") {
    const target = resolveTarget(block, pathInBlock.slice(0, -2))
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const insertAt = pathInBlock.pop()! as number
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const prop = pathInBlock.pop()!
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const before: string = target![prop] as string
    const after =
      before.slice(0, insertAt) + patch.value + before.slice(insertAt)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    target[prop] = after
  } else if (patch.action === "del") {
    const target = resolveTarget(block, pathInBlock.slice(0, -1))
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const key = patch.path[patch.path.length - 1]
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete target[key]
  }
}

function copyValues(vals: am.MaterializeValue[]): am.MaterializeValue[] {
  // Copy RawString by value because otherwise instanceof fails
  return vals.map(val => copyValue(val))
}

function copyValue(val: am.MaterializeValue): am.MaterializeValue {
  // Copy RawString by value because otherwise instanceof fails
  if (val instanceof am.RawString) {
    return new am.RawString(val.toString())
  }
  return structuredClone(val)
}

function resolveTarget(
  block: { [key: string]: am.MaterializeValue },
  path: am.Prop[],
): am.MaterializeValue {
  let target: am.MaterializeValue = block
  for (const pathElem of path) {
    if (typeof target !== "object") {
      throw new Error("Invalid path: expected object when resolving target")
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    target = target[pathElem]
  }
  return target
}

function insertBlock(spans: am.Span[], patch: am.InsertPatch) {
  let idx = 0
  let spanIdx = 0
  const patchIndex = patch.path[patch.path.length - 1]
  if (typeof patchIndex !== "number") {
    throw new Error(
      `Invalid patch path, expected a number got ", ${patch.path[patch.path.length - 1]}`,
    )
  }

  const newBlocks: am.Span[] = []
  for (const val of patch.values) {
    if (!val || typeof val !== "object") {
      throw new Error("Invalid patch: expected object when inserting")
    }
    if (!(Object.keys(val).length === 0)) {
      throw new Error(
        "Invalid patch: unexpected nonempty object when inserting",
      )
    }
    newBlocks.push({
      type: "block",
      value: {},
    })
  }

  while (idx < patchIndex && spanIdx < spans.length) {
    const span = spans[spanIdx]
    if (span.type == "text") {
      if (span.value.length + idx > patchIndex) {
        const offset = patchIndex - idx
        const left = span.value.slice(0, offset)
        const right = span.value.slice(offset)
        span.value = left
        spans.splice(spanIdx + 1, 0, ...newBlocks)
        spans.splice(spanIdx + newBlocks.length + 1, 0, {
          type: "text",
          value: right,
        })
        return
      }
      idx += span.value.length
    } else {
      idx += 1
    }
    spanIdx += 1
  }
  spans.splice(spanIdx, 0, ...newBlocks)
}

export function findBlockAtCharIdx(
  spans: am.Span[],
  charIdx: number,
): { [key: string]: am.MaterializeValue } | null {
  let idx = 0
  for (const span of spans) {
    if (span.type === "block") {
      if (idx === charIdx) {
        return span.value
      }
      idx += 1
    } else {
      idx += span.value.length
    }
  }
  return null
}

function marksEqual(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marks1: { [key: string]: any } | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marks2: { [key: string]: any } | undefined,
): boolean {
  if (marks1 === marks2) {
    return true
  }

  if (
    !marks1 ||
    !marks2 ||
    Object.keys(marks1).length !== Object.keys(marks2).length
  ) {
    return false
  }

  for (const key in marks1) {
    if (marks1[key] !== marks2[key]) {
      return false
    }
  }

  return true
}

function makeTextSpan({
  value,
  marks,
}: {
  value: string
  marks: am.MarkSet | undefined
}): am.Span {
  const result: am.Span = { type: "text", value }
  if (marks != null) {
    result.marks = marks
  }
  return result
}
