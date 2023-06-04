import {schema} from "prosemirror-schema-basic";
import {Node} from "prosemirror-model"
import { AddMarkStep } from "prosemirror-transform"
import {Doc, Prop, unstable} from "@automerge/automerge";
import * as automerge from "@automerge/automerge"

export function fromAm(doc: Doc<any>, path: Prop[]): Node {
  let paras: Array<Node> = []
  let text = lookupText(doc, path)
  if (text === null) {
    throw new Error("No text at path " + path.join("/"))
  }
  let amText = text.toString()
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
    let start = amIdxToPmIdx(mark.start, amText)
    let end = amIdxToPmIdx(mark.end, amText)
    let step = new AddMarkStep(start, end, schema.marks[mark.name].create({}))
    let stepResult = step.apply(result)
    if (stepResult.doc) {
      result = stepResult.doc
    }
  }
  return result
}

function lookupText(doc: Doc<any>, path: Prop[]): automerge.Text | null {
  let current = doc
  for (let i = 0; i < path.length; i++) {
    current = current[path[i]]
  }
  if (current instanceof automerge.Text) {
    return current
  } else {
    return null
  }
}

function amIdxToPmIdx(amIdx: number, pmText: string): number {
  // start at one because that's the index of the first character of the first paragraph
  let pmIdx = 1
  for (let i = 0; i < amIdx; i++) {
    if (pmText[i] === "\n" && pmText[i+1] == "\n") {
      i++
    }
    pmIdx++
  }
  return pmIdx
}
