import { next as am } from "@automerge/automerge"

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
  if (!(type instanceof am.RawString)) {
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
  type: am.RawString
  parents: am.RawString[]
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
  if (!(spanType instanceof am.RawString)) {
    type = new am.RawString("paragraph")
  } else {
    type = spanType
  }
  const attrs: { [key: string]: am.MaterializeValue } = {}
  if (spanAttrs && typeof spanAttrs == "object") {
    for (const [key, value] of Object.entries(spanAttrs)) {
      attrs[key] = value
    }
  }
  let parents: am.RawString[]
  if (!isArrayOfRawString(spanParents)) {
    parents = []
  } else {
    parents = spanParents
  }
  const isEmbed = !!spanIsEmbed
  return { type, parents, attrs, isEmbed }
}

function isArrayOfRawString(obj: unknown): obj is am.RawString[] {
  if (!Array.isArray(obj)) {
    return false
  }
  for (const item of obj) {
    if (!(item instanceof am.RawString)) {
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
