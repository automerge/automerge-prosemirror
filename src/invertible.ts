import { Node } from "prosemirror-model"
import { Step, Transform } from "prosemirror-transform"

export default class Invertible {
  constructor(
    readonly step: Step,
    readonly inverted: Step,
    // The document before the step was applied
    readonly doc: Node
  ) {}
}

