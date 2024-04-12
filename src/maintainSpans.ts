import { next as am } from "@automerge/automerge"
import { pathIsPrefixOf, pathsEqual } from "./pathUtils"

export function patchSpans(
  atPath: am.Prop[],
  spans: am.Span[],
  patch: am.Patch,
) {
  if (pathsEqual(patch.path, atPath)) {
    if (patch.action === "splice") {
      spliceSpans(spans, patch)
    }
  } else if (pathIsPrefixOf(atPath, patch.path)) {
    if (patch.path.length === atPath.length + 1) {
      // This is either an insert or delete of a block
      if (patch.action === "insert") {
        insertBlock(spans, patch)
      } else if (patch.action === "del") {
        deleteSpans(spans, patch)
      }
    } else {
      const index = patch.path[atPath.length]
      if (typeof index !== "number") {
        throw new Error("Invalid path")
      }
      const block = findBlockAtCharIdx(spans, index)
      if (block == null) {
        throw new Error("Invalid path")
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

  for (const span of spans) {
    if (span.type === "text") {
      if (idx + span.value.length < patchIndex) {
        const offset = patchIndex - idx
        const before = span.value.slice(0, offset)
        const after = span.value.slice(offset)
        span.value = before + patch.value + after
        return
      } else {
        idx += span.value.length
      }
    } else {
      idx += 1
    }
  }
}

function deleteSpans(spans: am.Span[], patch: am.DelPatch) {
  let idx = 0
  const patchIndex = patch.path[patch.path.length - 1]
  if (typeof patchIndex !== "number") {
    return
  }

  for (const [index, span] of spans.entries()) {
    if (span.type === "text") {
      if (idx + span.value.length > patchIndex) {
        const offset = patchIndex - idx
        const before = span.value.slice(0, offset)
        const after = span.value.slice(offset + (patch.length || 1))
        span.value = before + after
        if (span.value === "") {
          spans.splice(index, 1)
        }
        return
      } else {
        idx += span.value.length
      }
    } else {
      if (idx === patchIndex) {
        spans.splice(index, 1)
        const prevSpan = spans[index - 1]
        const nextSpan = spans[index]
        if (nextSpan != null && prevSpan != null) {
          if (prevSpan.type === "text" && nextSpan.type === "text") {
            prevSpan.value += nextSpan.value
            spans.splice(index, 1)
          }
        }
        return
      }
      idx += 1
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
    const key = patch.path.pop()!
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    target[key] = patch.value
  } else if (patch.action === "insert") {
    const target = resolveTarget(block, pathInBlock.slice(0, -2))
    const insertAt = pathInBlock.pop()! as number
    const prop = pathInBlock.pop()!
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const arr = target[prop] as am.MaterializeValue[]
    if (!Array.isArray(arr)) {
      throw new Error("Invalid path")
    }
    arr.splice(insertAt, 0, ...patch.values)
  } else if (patch.action === "splice") {
    const target = resolveTarget(block, pathInBlock.slice(0, -2))
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const insertAt = pathInBlock.pop()! as number
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
    const key = patch.path.pop()!
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete target[key]
  }
}

function resolveTarget(
  block: { [key: string]: am.MaterializeValue },
  path: am.Prop[],
): am.MaterializeValue {
  let target: am.MaterializeValue = block
  for (const pathElem of path) {
    if (typeof target !== "object") {
      throw new Error("Invalid path")
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
  while (idx < patchIndex && spanIdx < spans.length) {
    const span = spans[spanIdx]
    if (span.type == "text") {
      if (span.value.length + idx > patchIndex) {
        const offset = patchIndex - idx
        const left = span.value.slice(0, offset)
        const right = span.value.slice(offset)
        span.value = left
        spans.splice(spanIdx + 1, 0, {
          type: "block",
          value: {},
        })
        spans.splice(spanIdx + 2, 0, {
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
  spans.splice(spanIdx, 0, {
    type: "block",
    value: {},
  })
}

function findBlockSpanIdx(spans: am.Span[], blockIdx: number): number | null {
  let idx = 0
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]
    if (span.type === "block") {
      if (idx === blockIdx) {
        return i
      }
      idx += 1
    } else if (span.type === "text") {
      idx += span.value.length
    }
  }
  return null
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
