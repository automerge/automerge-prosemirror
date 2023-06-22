import {schema} from "prosemirror-schema-basic";
import {Attrs, Node} from "prosemirror-model"
import { AddMarkStep } from "prosemirror-transform"
import {Doc, Prop, unstable, Text} from "@automerge/automerge";
import { amIdxToPmIdx } from "./positions";

export function init<T>(doc: Doc<T>, path: Prop[]): Node {
  let paras: Array<Node> = []
  const text = lookupText(doc, path)
  if (text === null) {
    throw new Error("No text at path " + path.join("/"))
  }
  const amText = text.toString()
  if (amText !== "") {
    paras = amText.split("\n").map(p => {
      if (p === "") {
        return schema.node("paragraph", null, [])
      } else {
        return schema.node("paragraph", null, [schema.text(p)])
      }
    })
  }
  if (paras.length === 0) {
    paras = [schema.node("paragraph", null, [])]
  }
  let result = schema.node("doc", null, paras)
  for (const mark of unstable.marks(doc, path[path.length - 1])) {
    const start = amIdxToPmIdx(mark.start, amText)
    const end = amIdxToPmIdx(mark.end, amText)
    if (mark.value == null) {
      continue
    }
    let markValue = mark.value
    if (typeof markValue === "string") {
      try {
        markValue = JSON.parse(markValue)
      } catch (e) {
        // ignore
      }
    }
    const step = new AddMarkStep(start, end, schema.mark(mark.name, markValue as Attrs))
    const stepResult = step.apply(result)
    if (stepResult.doc) {
      result = stepResult.doc
    }
  }
  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lookupText(doc: Doc<any>, path: Prop[]): string | null {
  let current = doc
  for (let i = 0; i < path.length; i++) {
    current = current[path[i]]
  }
  if (typeof current === "string") {
    return current
  } else if (current instanceof Text) {
    return current.toString()
  } else {
    return null
  }
}
