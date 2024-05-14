import { next as am } from "@automerge/automerge"
import {
  ContentMatch,
  Fragment,
  Node,
  NodeType,
  Schema,
} from "prosemirror-model"
import { isBlockMarker, BlockMarker, amSpanToSpan } from "./types"
import {
  NodeMapping,
  SchemaAdapter,
  amMarksFromPmMarks,
  pmMarksFromAmMarks,
} from "./schema"

type RenderRole = "explicit" | "render-only"

export type TraversalEvent =
  | { type: "openTag"; tag: string; role: RenderRole }
  | { type: "closeTag"; tag: string; role: RenderRole }
  | { type: "leafNode"; tag: string; role: RenderRole }
  | { type: "text"; text: string; marks: am.MarkSet }
  | {
      type: "block"
      isUnknown?: boolean
      block: {
        type: string
        parents: string[]
        attrs: { [key: string]: am.MaterializeValue }
        isEmbed: boolean
      }
    }

export function docFromSpans(adapter: SchemaAdapter, spans: am.Span[]): Node {
  const events = traverseSpans(adapter, spans)
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
  let nextBlockAmgAttrs: { [key: string]: am.MaterializeValue } | null = null

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
      const node = constructNode(adapter.schema, tag, attrs, children)
      stack[stack.length - 1].children.push(node)
    } else if (event.type === "leafNode") {
      stack[stack.length - 1].children.push(
        constructNode(adapter.schema, event.tag, nextBlockAmgAttrs || {}, []),
      )
    } else if (event.type === "text") {
      const pmMarks = pmMarksFromAmMarks(adapter, event.marks)
      stack[stack.length - 1].children.push(
        adapter.schema.text(event.text, pmMarks),
      )
    }

    if (event.type === "block") {
      nextBlockAmgAttrs = { isAmgBlock: true, ...event.block.attrs }
      if (event.isUnknown) {
        nextBlockAmgAttrs.unknownBlock = event.block
      }
    } else {
      nextBlockAmgAttrs = null
    }
  }
  if (stack.length !== 1) {
    throw new Error("Invalid stack length")
  } else {
    const { children, attrs, tag } = stack[0]
    return constructNode(adapter.schema, tag, attrs, children)
  }
}

function constructNode(
  schema: Schema,
  nodeName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attrs: { [key: string]: any },
  children: Node[],
): Node {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const knownAttrs: { [key: string]: any } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unknownAttrs: { [key: string]: any } = {}
  let hasUnknownAttr = false
  for (const name of Object.keys(attrs)) {
    if (
      name === "isAmgBlock" ||
      name === "unknownBlock" ||
      name === "unknownAttrs"
    ) {
      knownAttrs[name] = attrs[name]
      continue
    }
    const attrSpec = schema.nodes[nodeName]?.spec?.attrs?.[name]
    if (attrSpec != null) {
      knownAttrs[name] = attrs[name]
    } else {
      hasUnknownAttr = true
      unknownAttrs[name] = attrs[name]
    }
  }
  if (hasUnknownAttr) {
    knownAttrs.unknownAttrs = unknownAttrs
  }
  return schema.node(nodeName, knownAttrs, children)
}

export function amSpliceIdxToPmIdx(
  adapter: SchemaAdapter,
  spans: am.Span[],
  target: number,
): number | null {
  const events = eventsWithIndexChanges(traverseSpans(adapter, spans))
  let maxInsertableIndex = null

  for (const state of events) {
    if (state.before.amIdx >= target && maxInsertableIndex != null) {
      return maxInsertableIndex
    }
    if (state.event.type === "openTag") {
      if (
        state.event.tag === "paragraph" ||
        state.event.tag === "heading" ||
        state.event.tag === "code_block"
      ) {
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
  adapter: SchemaAdapter,
  spans: am.Span[],
  target: number,
): number | null {
  const events = eventsWithIndexChanges(traverseSpans(adapter, spans))
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

export function* traverseNode(
  adapter: SchemaAdapter,
  node: Node,
): IterableIterator<TraversalEvent> {
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
  const nodePath: Node[] = []

  while (toProcess.length > 0) {
    const next = toProcess.pop()
    if (next == null) {
      return
    }
    if (next.type === "node") {
      const cur = next.node
      if (cur.isText) {
        const marks = amMarksFromPmMarks(adapter, cur.marks)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        yield { type: "text", text: cur.text!, marks }
      } else {
        const maybeBlock = blockForNode(
          adapter,
          cur,
          nodePath,
          next.indexInParent,
        )
        const role = maybeBlock != null ? "explicit" : "render-only"

        if (maybeBlock != null) {
          const { block, isUnknown } = maybeBlock
          yield {
            type: "block",
            isUnknown,
            block,
          }
        }
        if (cur.isLeaf) {
          yield { type: "leafNode", tag: cur.type.name, role }
        } else {
          yield { type: "openTag", tag: cur.type.name, role }
          nodePath.push(cur)

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
        nodePath.pop()
      }
      yield next
    }
  }
}

function blockForNode(
  adapter: SchemaAdapter,
  node: Node,
  nodePath: Node[],
  indexInParent: number,
): {
  isUnknown: boolean
  block: {
    type: string
    parents: string[]
    attrs: { [key: string]: am.MaterializeValue }
    isEmbed: boolean
  }
} | null {
  // Round trip unknown blocks through the editor
  if (node.attrs.unknownBlock != null) {
    return {
      isUnknown: true,
      block: node.attrs.unknownBlock,
    }
  }

  const blockMapping = blockMappingForNode(adapter, node, nodePath)

  if (blockMapping == null) {
    if (node.attrs.isAmgBlock) {
      throw new Error("no mapping found for node which is marked as a block")
    }
    return null
  }

  const attrs = blockMapping.attrParsers?.fromProsemirror(node) || {}
  // make sure to round trip unknown attributes
  if (node.attrs.unknownAttrs != null) {
    for (const key of Object.keys(node.attrs.unknownAttrs)) {
      attrs[key] = node.attrs.unknownAttrs[key]
    }
  }

  // We have a few things to do
  // 1. If this node has `isAmgBlock: true` then we just need to get the block
  //    mapping and emit the correct block
  // 2. If this node has `isAmgBlock: false` then we have to decide, based on
  //    it's descendants, whether we should emit a block at this point

  if (node.attrs.isAmgBlock) {
    return {
      isUnknown: false,
      block: {
        type: blockMapping.blockName,
        parents: findParents(adapter, nodePath),
        attrs,
        isEmbed: blockMapping.isEmbed || false,
      },
    }
  } else if (blockMapping.isEmbed) {
    return {
      isUnknown: false,
      block: {
        type: blockMapping.blockName,
        parents: findParents(adapter, nodePath),
        attrs,
        isEmbed: true,
      },
    }
  } else {
    // Two possibilities:
    //
    // 1. The block is a container for an `isAmgBlock: true` block
    // 2. The block is a newly inserted block

    const explicitChildren = findExplicitChildren(node)
    if (explicitChildren != null) {
      // This block has explicit children. So we only need to emit a block
      // marker if the content before the first explicit child is different to
      // that which would be emitted by the default schema
      const defaultContent = blockMapping.content.contentMatch.fillBefore(
        Fragment.from([explicitChildren.first]),
        true,
      )
      if (defaultContent == null) {
        throw new Error("schema could not find wrapping")
      }
      if (defaultContent.eq(explicitChildren.contentBeforeFirst)) {
        return null
      }
    }

    const parent = nodePath[nodePath.length - 1]
    let parentType
    if (parent != null) {
      parentType = parent.type
    } else {
      parentType = adapter.schema.nodes.doc
    }

    let emitBlock = false
    if (node.isTextblock) {
      // If we're the first node in our parent, and we're the default textblock
      // for that parent then we don't emit a block marker
      const isTextWrapper =
        parentType.contentMatch.defaultType === node.type &&
        indexInParent === 0 &&
        !node.attrs.isAmgBlock
      if (!isTextWrapper) {
        emitBlock = true
      }
    } else if (hasImmediateTextChild(node)) {
      emitBlock = true
    }
    if (emitBlock) {
      return {
        isUnknown: false,
        block: {
          type: blockMapping.blockName,
          parents: findParents(adapter, nodePath),
          attrs,
          isEmbed: blockMapping.isEmbed || false,
        },
      }
    } else {
      return null
    }
  }
}

function hasImmediateTextChild(node: Node): boolean {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).isTextblock) {
      return true
    }
  }
  return false
}

type ExplicitChildren = {
  /**
   * The content before the first child which has `isAmgBlock: true` or has a
   * descendant with `isAmgBlock: true`
   */
  contentBeforeFirst: Fragment
  /**
   * The child which has `isAmgBlock: true` or has a descendant with
   * `isAmgBlock: true`
   */
  first: Node
}

/**
 * Find the first child of this node which either has `isAmgBlock: true` or
 * has a descendant with `isAmgBlock: true`
 */
function findExplicitChildren(node: Node): ExplicitChildren | null {
  let numExplicitChildren = 0
  let firstExplicitChild = null
  const contentBeforeFirst = []
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    let hasExplicitDescendant = false
    if (child.attrs.isAmgBlock) {
      hasExplicitDescendant = true
    } else {
      child.descendants(desc => {
        if (desc.attrs.isAmgBlock) {
          hasExplicitDescendant = true
          return false
        }
        return true
      })
    }
    if (hasExplicitDescendant) {
      numExplicitChildren++
      if (firstExplicitChild == null) {
        firstExplicitChild = child
      }
    }
    if (firstExplicitChild == null) {
      contentBeforeFirst.push(child)
    }
    if (numExplicitChildren > 1) {
      break
    }
  }
  if (numExplicitChildren > 0) {
    return {
      contentBeforeFirst: Fragment.from(contentBeforeFirst),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      first: firstExplicitChild!,
    }
  } else {
    return null
  }
}

function blockMappingForNode(
  adapter: SchemaAdapter,
  node: Node,
  nodePath: Node[],
): NodeMapping | null {
  const possibleMappings = adapter.nodeMappings.filter(
    m => m.content === node.type,
  )
  if (possibleMappings.length === 0) {
    return null
  }
  // choose more "specific" mappings if possible. A mapping is more specific if
  // it's outer and inner node type match than if only the inner type matches

  const parent = nodePath[nodePath.length - 1]

  let bestMapping = possibleMappings[0]
  for (const mapping of possibleMappings) {
    if (parent != null && mapping.outer === parent.type) {
      bestMapping = mapping
      break
    }
  }

  return bestMapping
}

function findParents(adapter: SchemaAdapter, parentNodes: Node[]): string[] {
  const parents: string[] = []
  for (const [index, node] of parentNodes.entries()) {
    if (
      index === parentNodes.length - 1 &&
      node.isTextblock &&
      !node.attrs.isAmgBlock
    ) {
      // If the last node is a render-only text block then we don't need to emit it, the
      // schema will take care of inserting it around the content for us
      continue
    }
    const mapping = blockMappingForNode(
      adapter,
      node,
      parentNodes.slice(0, index),
    )
    if (mapping == null) {
      continue
    }
    parents.push(mapping.blockName)
  }
  return parents
}

export function* traverseSpans(
  adapter: SchemaAdapter,
  amSpans: am.Span[],
): IterableIterator<TraversalEvent> {
  const blockSpans = amSpans.map(amSpanToSpan)
  if (blockSpans.length === 0) {
    return yield* [
      { type: "openTag", tag: "paragraph", role: "render-only" },
      { type: "closeTag", tag: "paragraph", role: "render-only" },
    ]
  }
  const state = new TraverseState(adapter)

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
  adapter: SchemaAdapter
  lastBlock: BlockMarker | null = null
  stack: { node: NodeType; role: RenderRole; lastMatch: ContentMatch }[] = []
  topMatch: ContentMatch

  constructor(adapter: SchemaAdapter) {
    this.adapter = adapter
    this.stack = []
    this.topMatch = this.adapter.schema.nodes.doc.contentMatch
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
      const { content } = nodesForBlock(
        this.adapter,
        block.type.val,
        block.isEmbed,
      )
      const wrapping = this.currentMatch.findWrapping(content)
      if (wrapping) {
        for (let i = 0; i < wrapping.length; i++) {
          yield this.pushNode(wrapping[i], "render-only")
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.currentMatch = this.currentMatch.matchType(content)!
      yield blockEvent(this.adapter, block)
      yield { type: "leafNode", tag: content.name, role: "explicit" }
      return
    }
    const newOuter = outerNodeTypes(this.adapter, block)
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
    yield blockEvent(this.adapter, block)
    const { content } = nodesForBlock(
      this.adapter,
      block.type.val,
      block.isEmbed || false,
    )
    yield this.pushNode(content, "explicit")
  }

  pushNode(node: NodeType, role: RenderRole): TraversalEvent {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.currentMatch = this.currentMatch.matchType(node)!
    this.stack.push({ node, role, lastMatch: node.contentMatch })
    return { type: "openTag", tag: node.name, role }
  }

  *newText(text: string, marks: am.MarkSet): IterableIterator<TraversalEvent> {
    const wrapping = this.currentMatch.findWrapping(
      this.adapter.schema.nodes.text,
    )

    if (wrapping) {
      for (let i = 0; i < wrapping.length; i++) {
        yield this.pushNode(wrapping[i], "render-only")
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.currentMatch = this.currentMatch.matchType(
      this.adapter.schema.nodes.text,
    )!
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

function outerNodeTypes(
  adapter: SchemaAdapter,
  block: BlockMarker,
): NodeType[] {
  const result = []
  for (const parent of block.parents) {
    const { outer, content } = nodesForBlock(adapter, parent.val, false)
    if (outer != null) {
      result.push(outer)
    }
    result.push(content)
  }
  const { outer } = nodesForBlock(
    adapter,
    block.type.val,
    block.isEmbed || false,
  )
  if (outer != null) {
    result.push(outer)
  }
  return result
}

function blockEvent(
  adapter: SchemaAdapter,
  block: BlockMarker,
): TraversalEvent {
  const mapping = adapter.nodeMappings.find(m => m.blockName === block.type.val)

  const attrs = { ...block.attrs }
  for (const [key, value] of Object.entries(attrs)) {
    if (value instanceof am.RawString) {
      attrs[key] = value.val
    }
  }
  return {
    type: "block",
    isUnknown: mapping == null,
    block: {
      attrs,
      parents: block.parents.map(p => p.val),
      type: block.type.val,
      isEmbed: block.isEmbed || false,
    },
  }
}

export function pmRangeToAmRange(
  adapter: SchemaAdapter,
  spans: am.Span[],
  { from, to }: { from: number; to: number },
): { start: number; end: number } | null {
  const events = eventsWithIndexChanges(traverseSpans(adapter, spans))
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

export function blocksFromNode(
  adapter: SchemaAdapter,
  node: Node,
): (
  | {
      type: "block"
      value: {
        type: am.RawString
        parents: am.RawString[]
        attrs: { [key: string]: am.MaterializeValue }
        isEmbed: boolean
      }
    }
  | { type: "text"; value: string; marks?: am.MarkSet }
)[] {
  const events = traverseNode(adapter, node)
  const result: (
    | {
        type: "block"
        value: {
          type: am.RawString
          parents: am.RawString[]
          attrs: { [key: string]: am.MaterializeValue }
          isEmbed: boolean
        }
      }
    | { type: "text"; value: string; marks: am.MarkSet }
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
      result.push({ type: "text", value: event.text, marks: event.marks })
    }
  }
  return result
}

function nodesForBlock(
  adapter: SchemaAdapter,
  blockType: string,
  isEmbed: boolean,
): {
  outer: NodeType | null
  content: NodeType
} {
  const mapping = adapter.nodeMappings.find(m => m.blockName === blockType)
  if (mapping == null) {
    if (isEmbed) {
      return {
        outer: null,
        content: adapter.unknownLeaf,
      }
    } else {
      return {
        outer: null,
        content: adapter.unknownTextblock,
      }
    }
  }
  return { outer: mapping.outer, content: mapping.content }
}
