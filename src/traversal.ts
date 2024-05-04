import { next as am } from "@automerge/automerge"
import {
  ContentMatch,
  Fragment,
  Mark,
  Node,
  NodeType,
  Schema,
} from "prosemirror-model"
import { isBlockMarker, BlockType, BlockMarker, amSpanToSpan } from "./types"
import { schema } from "./schema"
import { attrsFromMark } from "./amToPm"

type RenderRole = "explicit" | "render-only"

//type BlockAttrValue = string | number | boolean | null
type BlockAttrValue = am.MaterializeValue

export type TraversalEvent =
  | { type: "openTag"; tag: string; role: RenderRole }
  | { type: "closeTag"; tag: string; role: RenderRole }
  | { type: "leafNode"; tag: string; role: RenderRole }
  | { type: "text"; text: string; marks: am.MarkSet }
  | {
      type: "block"
      block: {
        type: string
        parents: string[]
        attrs: { [key: string]: BlockAttrValue }
        isEmbed: boolean
      }
    }

export function docFromSpans(spans: am.Span[]): Node {
  const events = traverseSpans(spans)
  type StackItem = {
    tag: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attrs: { [key: string]: any }
    children: Node[]
  }
  const stack: StackItem[] = [
    {
      tag: "doc",
      attrs: {},
      children: [],
    },
  ]
  let nextBlockAmgAttrs: { [key: string]: BlockAttrValue } | null = null

  for (const event of events) {
    if (event.type === "openTag") {
      stack.push({
        tag: event.tag,
        attrs: nextBlockAmgAttrs || {},
        children: [],
      })
    } else if (event.type === "closeTag") {
      //eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { children, attrs, tag } = stack.pop()!
      const node = constructNode(schema, tag, attrs, children)
      stack[stack.length - 1].children.push(node)
    } else if (event.type === "leafNode") {
      stack[stack.length - 1].children.push(
        constructNode(schema, event.tag, nextBlockAmgAttrs || {}, []),
      )
    } else if (event.type === "text") {
      let pmMarks: Mark[] = []
      if (event.marks != null) {
        pmMarks = Object.entries(event.marks).reduce(
          (acc: Mark[], [name, value]: [string, am.MarkValue]) => {
            if (value != null) {
              const markAttrs = attrsFromMark(name, value)
              acc.push(schema.mark(name, markAttrs))
            }
            return acc
          },
          [],
        )
      }
      stack[stack.length - 1].children.push(schema.text(event.text, pmMarks))
    }

    if (event.type === "block") {
      nextBlockAmgAttrs = { isAmgBlock: true, ...event.block.attrs }
    } else {
      nextBlockAmgAttrs = null
    }
  }
  if (stack.length !== 1) {
    throw new Error("Invalid stack length")
  } else {
    const { children, attrs, tag } = stack[0]
    return constructNode(schema, tag, attrs, children)
  }
}

function constructNode(
  schema: Schema,
  nodeName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attrs: { [key: string]: any },
  children: Node[],
): Node {
  return schema.node(nodeName, attrs, children)
}

export function amSpliceIdxToPmIdx(
  spans: am.Span[],
  target: number,
): number | null {
  const events = eventsWithIndexChanges(traverseSpans(spans))
  let maxInsertableIndex = null

  for (const state of events) {
    if (state.before.amIdx >= target && maxInsertableIndex != null) {
      return maxInsertableIndex
    }
    if (state.event.type === "openTag") {
      if (state.event.tag === "paragraph" || state.event.tag === "heading") {
        maxInsertableIndex = state.after.pmIdx
      }
    } else if (state.event.type === "leafNode") {
      maxInsertableIndex = state.after.pmIdx
    } else if (state.event.type === "text") {
      maxInsertableIndex = state.after.pmIdx
      if (state.after.amIdx >= target) {
        if (state.before.amIdx + state.event.text.length >= target) {
          const diff = target - state.before.amIdx
          return state.before.pmIdx + diff - 1
        }
      }
    }
  }
  return maxInsertableIndex
}

export function amIdxToPmBlockIdx(
  spans: am.Span[],
  target: number,
): number | null {
  const events = eventsWithIndexChanges(traverseSpans(spans))
  let lastBlockStart = null
  let isFirstTag = true

  for (const state of events) {
    if (state.event.type === "openTag") {
      if (state.event.role === "explicit") {
        lastBlockStart = state.after.pmIdx
      } else if (state.event.tag === "paragraph" && isFirstTag) {
        // If there's a render-only opening paragraph then everything before
        // the first block marker should be inside it
        lastBlockStart = state.after.pmIdx
      }
      isFirstTag = false
    } else if (state.event.type === "block") {
      if (state.after.amIdx === target) {
        return state.after.pmIdx + 1
      }
    }
    if (state.after.amIdx >= target) {
      return lastBlockStart
    }
  }
  return lastBlockStart
}

type Indexes = {
  amIdx: number
  pmIdx: number
}

export function* eventsWithIndexChanges(
  events: IterableIterator<TraversalEvent>,
): IterableIterator<{
  event: TraversalEvent
  before: Indexes
  after: Indexes
}> {
  let pmOffset = 0
  let amOffset = -1

  while (true) {
    const next = events.next()
    if (next.done) {
      return
    }
    const event = next.value
    const before = { amIdx: amOffset, pmIdx: pmOffset }

    if (event.type === "openTag" && event.tag !== "doc") {
      pmOffset += 1
    } else if (event.type === "closeTag" && event.tag !== "doc") {
      pmOffset += 1
    } else if (event.type === "leafNode") {
      pmOffset += 1
    } else if (event.type === "text") {
      amOffset += event.text.length
      pmOffset += event.text.length
    } else if (event.type === "block") {
      amOffset += 1
    }
    const after = { amIdx: amOffset, pmIdx: pmOffset }
    yield { event, before, after }
  }
}

export function* traverseNode(node: Node): IterableIterator<TraversalEvent> {
  const toProcess: (
    | TraversalEvent
    | { type: "node"; node: Node; parent: Node | null; indexInParent: number }
  )[] = [
    {
      node,
      parent: null,
      indexInParent: 0,
      type: "node",
    },
  ]
  const path: string[] = []
  const nodePath: Node[] = []

  while (toProcess.length > 0) {
    const next = toProcess.pop()
    if (next == null) {
      return
    }
    if (next.type === "node") {
      const cur = next.node
      if (cur.isText) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        yield { type: "text", text: cur.text!, marks: {} }
      } else {
        let blockType: BlockType | null = null
        const attrs: { [key: string]: BlockAttrValue } = {}
        let isEmbed = false
        const nodeType = cur.type.name
        if (nodeType === "list_item") {
          const parentNode = nodePath[nodePath.length - 1]
          if (parentNode == null) {
            throw new Error("li must have a parent")
          }
          if (parentNode.type.name === "ordered_list") {
            blockType = "ordered-list-item"
          } else if (parentNode.type.name === "bullet_list") {
            blockType = "unordered-list-item"
          } else {
            throw new Error("li must have a parent of ol or ul")
          }
        } else if (nodeType === "paragraph") {
          blockType = nodeType
        } else if (nodeType === "heading") {
          blockType = nodeType
          attrs.level = cur.attrs.level
        } else if (nodeType === "aside") {
          blockType = nodeType
        } else if (nodeType === "image") {
          blockType = nodeType
          isEmbed = true
          attrs.src = new am.RawString(cur.attrs.src)
          attrs.alt = cur.attrs.alt
          attrs.title = cur.attrs.title
        } else if (nodeType === "blockquote") {
          blockType = nodeType
        } else if (nodeType === "code_block") {
          blockType = "code-block"
        }

        let role: RenderRole = "render-only"
        if (cur.attrs.isAmgBlock) {
          role = "explicit"
        } else {
          let hasExplicitDescendant = false
          cur.descendants(desc => {
            if (desc.attrs.isAmgBlock) {
              hasExplicitDescendant = true
              return false
            }
            return true
          })
          if (cur.type.name === "list_item") {
            if (!hasExplicitDescendant) {
              role = "explicit"
            }
          } else if (cur.type.name === "paragraph") {
            if (next.indexInParent > 0) {
              role = "explicit"
            } else {
              // If the paragraph is an empty paragraph and there's one following
              // child in the list item which is a block element then the paragraph
              // is filler content
              const parent = next.parent
              if (parent != null) {
                if (parent.type.name === "list_item") {
                  if (parent.childCount === 2) {
                    if (
                      parent.child(1).type.name !== "ordered_list" &&
                      parent.child(1).type.name !== "bullet_list"
                    ) {
                      role = "explicit"
                    }
                  }
                } else if (parent.type.name === "doc") {
                  if (parent.childCount > 1) {
                    role = "explicit"
                  }
                } else if (parent.type.name === "aside") {
                  role = "explicit"
                } else if (parent.type.name === "blockquote") {
                  if (parent.childCount > 0) {
                    role = "explicit"
                  }
                }
              }
            }
          } else if (cur.type.name === "heading") {
            role = "explicit"
          } else if (cur.type.name === "image") {
            role = "explicit"
          } else if (cur.type.name === "code_block") {
            role = "explicit"
          }
        }

        if (role === "explicit" && blockType != null) {
          yield {
            type: "block",
            block: {
              type: blockType,
              parents: findParents(nodePath),
              attrs,
              isEmbed,
            },
          }
        }
        if (isEmbed) {
          yield { type: "leafNode", tag: cur.type.name, role }
        } else {
          yield { type: "openTag", tag: cur.type.name, role }
          nodePath.push(cur)
          if (blockType != null && role === "explicit") {
            path.push(blockType)
          }

          toProcess.push({ type: "closeTag", tag: cur.type.name, role })
          for (let i = cur.childCount - 1; i >= 0; i--) {
            toProcess.push({
              parent: cur,
              indexInParent: i,
              type: "node",
              node: cur.child(i),
            })
          }
        }
      }
    } else {
      if (next.type === "closeTag") {
        if (next.role === "explicit") {
          path.pop()
        }
        nodePath.pop()
      }
      yield next
    }
  }
}

function findParents(parentNodes: Node[]): string[] {
  const parents: string[] = []
  for (const [index, node] of parentNodes.entries()) {
    if (node.type.name === "bullet_list" && index < parentNodes.length - 1) {
      parents.push("unordered-list-item")
    } else if (
      node.type.name === "ordered_list" &&
      index < parentNodes.length - 1
    ) {
      parents.push("ordered-list-item")
    } else if (node.type.name === "paragraph") {
      parents.push("paragraph")
    } else if (node.type.name === "aside") {
      parents.push("aside")
    } else if (node.type.name === "blockquote") {
      parents.push("blockquote")
    }
  }
  return parents
}

export function* traverseSpans(
  amSpans: am.Span[],
): IterableIterator<TraversalEvent> {
  const blockSpans = amSpans.map(amSpanToSpan)
  if (blockSpans.length === 0) {
    return yield* [
      { type: "openTag", tag: "paragraph", role: "render-only" },
      { type: "closeTag", tag: "paragraph", role: "render-only" },
    ]
  }
  const state = new TraverseState()

  for (const span of blockSpans) {
    if (span.type === "block") {
      yield* state.newBlock(span.value)
    } else {
      yield* state.newText(span.value, span.marks || {})
    }
  }
  yield* state.finish()
}

class TraverseState {
  lastBlock: BlockMarker | null = null
  stack: { node: NodeType; role: RenderRole; lastMatch: ContentMatch }[] = []
  topMatch: ContentMatch

  constructor() {
    this.stack = []
    this.topMatch = schema.nodes.doc.contentMatch
  }

  set currentMatch(match: ContentMatch) {
    if (match === null) {
      throw new Error("Match cannot be null")
    }
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].lastMatch = match
    } else {
      this.topMatch = match
    }
  }

  get currentMatch(): ContentMatch {
    if (this.stack.length > 0) {
      return this.stack[this.stack.length - 1].lastMatch
    } else {
      return this.topMatch
    }
  }

  *newBlock(block: BlockMarker): IterableIterator<TraversalEvent> {
    if (block.isEmbed) {
      const { content } = nodesForBlock(block.type.val)
      const wrapping = this.currentMatch.findWrapping(content)
      if (wrapping && wrapping.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.currentMatch = this.currentMatch.matchType(wrapping[0])!
        for (let i = 0; i < wrapping.length; i++) {
          yield { type: "openTag", tag: wrapping[i].name, role: "render-only" }
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.currentMatch = this.currentMatch.matchType(content)!
      }
      yield blockEvent(block)
      yield { type: "leafNode", tag: block.type.val, role: "explicit" }
      if (wrapping) {
        for (let i = wrapping.length - 1; i >= 0; i--) {
          yield { type: "closeTag", tag: wrapping[i].name, role: "render-only" }
        }
      }
      return
    }
    const newOuter = outerNodeTypes(block)
    let i = 0
    while (i < newOuter.length && i < this.stack.length) {
      if (this.stack[i].node !== newOuter[i]) {
        break
      }
      i++
    }
    const toClose = this.stack.splice(i)
    for (const { node, role, lastMatch } of toClose.toReversed()) {
      yield* this.finishStackFrame({ node, role, lastMatch })
      yield { type: "closeTag", tag: node.name, role }
    }
    for (let j = i; j < newOuter.length; j++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const next = newOuter[j]!
      yield* this.fillBefore(next)
      yield this.pushNode(newOuter[j], "render-only")
    }
    yield blockEvent(block)
    const { content } = nodesForBlock(block.type.val)
    yield this.pushNode(content, "explicit")
  }

  pushNode(node: NodeType, role: RenderRole): TraversalEvent {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.currentMatch = this.currentMatch.matchType(node)!
    this.stack.push({ node, role, lastMatch: node.contentMatch })
    return { type: "openTag", tag: node.name, role }
  }

  *newText(text: string, marks: am.MarkSet): IterableIterator<TraversalEvent> {
    const wrapping = this.currentMatch.findWrapping(schema.nodes.text)

    if (wrapping) {
      for (let i = 0; i < wrapping.length; i++) {
        yield this.pushNode(wrapping[i], "render-only")
      }
    }
    yield { type: "text", text, marks }
  }

  *finish(): IterableIterator<TraversalEvent> {
    for (const { node, role, lastMatch } of this.stack.toReversed()) {
      yield* this.finishStackFrame({ node, role, lastMatch })
      yield { type: "closeTag", tag: node.name, role }
    }
  }

  *fillBefore(node: NodeType): IterableIterator<TraversalEvent> {
    const fill = this.currentMatch.fillBefore(Fragment.from(node.create()))
    if (fill != null) {
      yield* this.emitFragment(fill)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.currentMatch = this.currentMatch.matchFragment(fill)!
    }
  }

  *emitFragment(fragment: Fragment): IterableIterator<TraversalEvent> {
    type Event =
      | { type: "open"; node: Node }
      | { type: "close"; node: NodeType }
    const toProcess: Event[] = []
    for (let i = fragment.childCount - 1; i >= 0; i--) {
      toProcess.push({ type: "open", node: fragment.child(i) })
    }
    while (toProcess.length > 0) {
      const next = toProcess.pop()
      if (next == null) {
        return
      }
      if (next.type === "open") {
        yield { type: "openTag", tag: next.node.type.name, role: "render-only" }
        if (next.node.isText) {
          // TODO: Calculate marks
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          yield { type: "text", text: next.node.text!, marks: {} }
          yield {
            type: "closeTag",
            tag: next.node.type.name,
            role: "render-only",
          }
        } else {
          toProcess.push({ type: "close", node: next.node.type })
          for (let i = next.node.childCount - 1; i >= 0; i--) {
            toProcess.push({ type: "open", node: next.node.child(i) })
          }
        }
      } else {
        yield { type: "closeTag", tag: next.node.name, role: "render-only" }
      }
    }
  }

  *finishStackFrame(frame: {
    node: NodeType
    role: RenderRole
    lastMatch: ContentMatch
  }): IterableIterator<TraversalEvent> {
    const fill = frame.lastMatch.fillBefore(Fragment.empty, true)
    if (fill) {
      yield* this.emitFragment(fill)
    }
  }
}

function outerNodeTypes(block: BlockMarker): NodeType[] {
  const result = []
  for (const parent of block.parents) {
    const { outer, content } = nodesForBlock(parent.val)
    if (outer != null) {
      result.push(outer)
    }
    result.push(content)
  }
  const { outer } = nodesForBlock(block.type.val)
  if (outer != null) {
    result.push(outer)
  }
  return result
}

function blockEvent(block: BlockMarker): TraversalEvent {
  const attrs = { ...block.attrs }
  for (const [key, value] of Object.entries(attrs)) {
    if (value instanceof am.RawString) {
      attrs[key] = value.val
    }
  }
  return {
    type: "block",
    block: {
      attrs,
      parents: block.parents.map(p => p.val),
      type: block.type.val,
      isEmbed: block.isEmbed || false,
    },
  }
}

export function pmRangeToAmRange(
  spans: am.Span[],
  { from, to }: { from: number; to: number },
): { start: number; end: number } | null {
  const events = eventsWithIndexChanges(traverseSpans(spans))
  let amStart = null
  let amEnd = null
  let maxPmIdxSeen = null
  let maxAmIdxSeen = null

  if (from === 0) {
    amStart = 0
  }

  while (
    maxPmIdxSeen == null ||
    maxPmIdxSeen <= to ||
    amStart == null ||
    amEnd == null
  ) {
    const next = events.next()
    if (next.done) {
      break
    }
    const state = next.value
    maxPmIdxSeen = state.after.pmIdx
    maxAmIdxSeen = state.after.amIdx

    if (amStart == null) {
      if (state.after.pmIdx < from) {
        continue
      }
      if (state.event.type === "text") {
        if (state.before.pmIdx > from) {
          // We already passed the start but this is the first automerge event
          // we've seen
          amStart = Math.max(state.before.amIdx, 0) + 1
        } else if (state.before.pmIdx + state.event.text.length > from) {
          // The target `from` is in the middle of this text
          const diff = from - state.before.pmIdx
          //amStart = Math.max(state.before.amIdx, 0) + diff + 1
          amStart = state.before.amIdx + diff + 1
        } else {
          amStart = Math.max(state.after.amIdx, 0) + 1
        }
      } else if (state.after.pmIdx >= from) {
        // we are only interested in blocks which start _after_ the from index
        amStart = state.after.amIdx + 1
      }
    }
    if (amEnd == null) {
      if (state.after.pmIdx < to) {
        continue
      }
      if (state.event.type === "text") {
        if (state.before.pmIdx >= to) {
          amEnd = state.before.amIdx + 1
        } else if (state.before.pmIdx + state.event.text.length > to) {
          const diff = to - state.before.pmIdx
          //amEnd = Math.max(state.before.amIdx, 0) + diff + 1
          amEnd = state.before.amIdx + diff + 1
        }
      } else {
        if (state.before.pmIdx >= to) {
          amEnd = state.before.amIdx + 1
        }
      }
    }
  }

  if (amStart != null) {
    if (amEnd == null) {
      amEnd = maxAmIdxSeen ? maxAmIdxSeen + 1 : amStart
    }
    return { start: amStart, end: amEnd }
  } else {
    const endOfDoc = maxAmIdxSeen ? maxAmIdxSeen + 1 : 0
    return { start: endOfDoc, end: endOfDoc }
  }
}

export function blockAtIdx(
  spans: am.Span[],
  target: number,
): { index: number; block: BlockMarker } | null {
  let idx = 0
  let block: { index: number; block: BlockMarker } | null = null
  for (const span of spans) {
    if (idx > target) {
      return block
    }
    if (span.type === "text") {
      if (idx + span.value.length > target) {
        return block
      }
      idx += span.value.length
    } else {
      if (isBlockMarker(span.value)) {
        block = { index: idx, block: span.value }
      }
      idx += 1
    }
  }
  return block
}

export function blocksFromNode(node: Node): (
  | {
      type: "block"
      value: {
        type: am.RawString
        parents: am.RawString[]
        attrs: { [key: string]: BlockAttrValue }
        isEmbed: boolean
      }
    }
  | { type: "text"; value: string }
)[] {
  const events = traverseNode(node)
  const result: (
    | {
        type: "block"
        value: {
          type: am.RawString
          parents: am.RawString[]
          attrs: { [key: string]: BlockAttrValue }
          isEmbed: boolean
        }
      }
    | { type: "text"; value: string }
  )[] = []
  for (const event of events) {
    if (event.type == "block") {
      const attrs = { ...event.block.attrs }
      delete attrs.isAmgBlock
      result.push({
        type: "block",
        value: {
          type: new am.RawString(event.block.type),
          parents: event.block.parents.map(p => new am.RawString(p)),
          attrs,
          isEmbed: event.block.isEmbed,
        },
      })
    } else if (event.type == "text") {
      result.push({ type: "text", value: event.text })
    }
  }
  return result
}

function nodesForBlock(blockType: string): {
  outer: NodeType | null
  content: NodeType
  inner: NodeType | null
} {
  if (blockType === "paragraph") {
    return { outer: null, content: schema.nodes.paragraph, inner: null }
  } else if (blockType === "heading") {
    return { outer: null, content: schema.nodes.heading, inner: null }
  } else if (blockType === "aside") {
    return {
      outer: null,
      content: schema.nodes.aside,
      inner: schema.nodes.paragraph,
    }
  } else if (blockType === "blockquote") {
    return { outer: null, content: schema.nodes.blockquote, inner: null }
  } else if (blockType === "ordered-list-item") {
    return {
      outer: schema.nodes.ordered_list,
      content: schema.nodes.list_item,
      inner: schema.nodes.paragraph,
    }
  } else if (blockType === "unordered-list-item") {
    return {
      outer: schema.nodes.bullet_list,
      content: schema.nodes.list_item,
      inner: schema.nodes.paragraph,
    }
  } else if (blockType === "code-block") {
    return { outer: null, content: schema.nodes.code_block, inner: null }
  } else if (blockType === "image") {
    return { outer: null, content: schema.nodes.image, inner: null }
  } else {
    throw new Error(`Unknown block type: ${blockType}`)
  }
}
