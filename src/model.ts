import {schema} from "prosemirror-schema-basic";
import {Node} from "prosemirror-model"


export function fromAm(amText: string): Node {
  let paras: Array<Node> = []
  if (amText !== "") {
    paras = amText.split("\n\n").map(p => {
      if (p === "") {
        return schema.node("paragraph", null, [])
      } else {
        return schema.node("paragraph", null, [schema.text(p)])
      }
    })
  }
  return schema.node("doc", null, paras)
}
