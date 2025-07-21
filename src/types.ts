import * as am from "@automerge/automerge/slim"

export interface DocHandle<T> {
  docSync: () => am.Doc<T> | undefined
  change: (fn: am.ChangeFn<T>) => void
}

export type BlockType = string

export function isBlockMarker(obj: unknown): obj is BlockMarker {
  if (obj == null) {
    return false
  }
  if (typeof obj !== "object") {
    return false
  }
  if (!("type" in obj)) {
    return false
  }
  if (!("parents" in obj) || !Array.isArray(obj.parents)) {
    return false
  }
  if (!validBlockType(obj.type)) {
    return false
  }
  for (const parent of obj.parents) {
    if (!validBlockType(parent)) {
      return false
    }
  }
  return true
}

export function validBlockType(type: unknown): type is BlockType {
  if (!am.isImmutableString(type)) {
    return false
  }
  return [
    "ordered-list-item",
    "unordered-list-item",
    "paragraph",
    "heading",
    "aside",
    "image",
    "blockquote",
  ].includes(type.val)
}

export type BlockMarker = {
  type: am.ImmutableString
  parents: am.ImmutableString[]
  attrs: { [key: string]: am.MaterializeValue }
  isEmbed?: boolean
}

export function blockSpanToBlockMarker(span: {
  [key: string]: am.MaterializeValue
}): BlockMarker {
  const {
    type: spanType,
    parents: spanParents,
    attrs: spanAttrs,
    isEmbed: spanIsEmbed,
  } = span
  let type
  if (!am.isImmutableString(spanType)) {
    type = new am.ImmutableString("paragraph")
  } else {
    type = spanType
  }
  const attrs: { [key: string]: am.MaterializeValue } = {}
  if (spanAttrs && typeof spanAttrs == "object") {
    for (const [key, value] of Object.entries(spanAttrs)) {
      attrs[key] = value
    }
  }
  let parents: am.ImmutableString[]
  if (!isArrayOfImmutableString(spanParents)) {
    parents = []
  } else {
    parents = spanParents
  }
  const isEmbed = !!spanIsEmbed
  return { type, parents, attrs, isEmbed }
}

function isArrayOfImmutableString(obj: unknown): obj is am.ImmutableString[] {
  if (!Array.isArray(obj)) {
    return false
  }
  for (const item of obj) {
    if (!am.isImmutableString(item)) {
      return false
    }
  }
  return true
}

export type Span =
  | { type: "text"; value: string; marks?: am.MarkSet }
  | { type: "block"; value: BlockMarker }

export function amSpanToSpan(span: am.Span): Span {
  if (span.type === "text") {
    return { type: "text", value: span.value, marks: span.marks }
  } else {
    return { type: "block", value: blockSpanToBlockMarker(span.value) }
  }
}
