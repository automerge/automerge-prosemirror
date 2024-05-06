import React, { useEffect, useState, useRef } from "react"

import { Command, EditorState, Transaction } from "prosemirror-state"
import { keymap } from "prosemirror-keymap"
import {
  baseKeymap,
  chainCommands,
  setBlockType,
  toggleMark,
  wrapIn,
} from "prosemirror-commands"
import { MarkType, NodeType, Schema } from "prosemirror-model"
import { EditorView } from "prosemirror-view"
import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  smartQuotes,
  ellipsis,
  emDash,
} from "prosemirror-inputrules"
import "prosemirror-view/style/prosemirror.css"
import { Prop } from "@automerge/automerge"
import { AutoMirror } from "../../src"
import { DocHandle, DocHandleChangePayload } from "@automerge/automerge-repo"
import {
  wrapInList,
  splitListItem,
  sinkListItem,
  liftListItem,
} from "prosemirror-schema-list"
import { useHandleReady } from "./useHandleReady"
import {
  Bold,
  Braces,
  Italic,
  Link,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  TextQuote,
  Indent,
  Outdent,
  Image,
} from "lucide-react"
import Modal from "./Modal"
import ImageForm from "./ImageForm"
import LinkForm from "./LinkForm"

export type EditorProps = {
  name?: string
  handle: DocHandle<unknown>
  path: Prop[]
}

const toggleBold = (schema: Schema) => toggleMarkCommand(schema.marks.strong)
const toggleItalic = (schema: Schema) => toggleMarkCommand(schema.marks.em)

function toggleMarkCommand(mark: MarkType): Command {
  return (
    state: EditorState,
    dispatch: ((tr: Transaction) => void) | undefined,
  ) => {
    return toggleMark(mark)(state, dispatch)
  }
}

function turnSelectionIntoBlockquote(
  state: EditorState,
  dispatch: (tr: Transaction) => void | undefined,
  view: EditorView,
): boolean {
  // Check if the blockquote can be applied
  const { $from, $to } = state.selection
  const range = $from.blockRange($to)

  if (!range) {
    return false
  }

  // Check if we can wrap the selection in a blockquote
  if (!wrapIn(state.schema.nodes.blockquote)(state, undefined, view)) {
    return false
  }

  // Apply the blockquote transformation
  if (dispatch) {
    wrapIn(state.schema.nodes.blockquote)(state, dispatch, view)
  }
  return true
}

export function Editor({ handle, path }: EditorProps) {
  const editorRoot = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const handleReady = useHandleReady(handle)
  const [imageModalOpen, setImageModalOpen] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [{ boldActive, emActive }, setMarkState] = useState({
    boldActive: false,
    emActive: false,
  })

  useEffect(() => {
    if (!handleReady) {
      return
    }
    const autoMirror = new AutoMirror(path)

    const initialDoc = autoMirror.initialize(handle)
    const editorConfig = {
      schema: autoMirror.schema,
      history,
      plugins: [
        buildInputRules(autoMirror.schema),
        keymap({
          "Mod-b": toggleBold(autoMirror.schema),
          "Mod-i": toggleItalic(autoMirror.schema),
          "Mod-l": toggleMark(autoMirror.schema.marks.link, {
            href: "https://example.com",
            title: "example",
          }),
          Enter: splitListItem(autoMirror.schema.nodes.list_item),
        }),
        keymap(baseKeymap),
      ],
      doc: initialDoc,
    }

    const state = EditorState.create(editorConfig)
    const view = new EditorView(editorRoot.current, {
      state,
      dispatchTransaction: (tx: Transaction) => {
        //console.log(`${name}: dispatchTransaction`, tx)
        const newState = autoMirror.intercept(handle, tx, view.state)
        view.updateState(newState)
        setMarkState({
          boldActive: markActive(newState, autoMirror.schema.marks.strong),
          emActive: markActive(newState, autoMirror.schema.marks.em),
        })
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPatch: (args: DocHandleChangePayload<unknown>) => void = ({
      doc,
      patches,
      patchInfo,
    }) => {
      //console.log(`${name}: patch received`)
      const newState = autoMirror.reconcilePatch(
        patchInfo.before,
        doc,
        patches,
        view.state,
      )
      view.updateState(newState)
    }
    handle.on("change", onPatch)

    setView(view)

    return () => {
      handle.off("change", onPatch)
      view.destroy()
    }
  }, [handleReady])

  const onBoldClicked = () => {
    if (view) {
      toggleBold(view.state.schema)(view.state, view.dispatch, view)
    }
  }

  const onItalicClicked = () => {
    if (view) {
      toggleItalic(view.state.schema)(view.state, view.dispatch, view)
    }
  }

  const onIncreaseIndent = () => {
    if (view) {
      // If we're in a list, figure out what kind it is
      const { $from } = view.state.selection
      let listNode = null
      for (let i = $from.depth; i > 0; i--) {
        if ($from.node(i).type.name === "list_item") {
          listNode = $from.node(i - 1)
          break
        }
      }
      const listType = listNode
        ? listNode.type
        : view.state.schema.nodes.bullet_list
      if (listNode) {
        chainCommands(
          sinkListItem(view.state.schema.nodes.list_item),
          wrapInList(listType),
        )(view.state, view.dispatch, view)
      }
    }
  }

  const onDecreaseIndent = () => {
    if (view) {
      liftListItem(view.state.schema.nodes.list_item)(
        view.state,
        view.dispatch,
        view,
      )
    }
  }

  const onBlockQuoteClicked = () => {
    if (view) {
      turnSelectionIntoBlockquote(view.state, view.dispatch, view)
    }
  }

  const onToggleOrderedList = () => {
    if (view) {
      wrapInList(view.state.schema.nodes.bullet_list)(
        view.state,
        view.dispatch,
        view,
      )
    }
  }

  const onToggleNumberedList = () => {
    if (view) {
      wrapInList(view.state.schema.nodes.ordered_list)(
        view.state,
        view.dispatch,
        view,
      )
    }
  }

  const onHeadingClicked = (level: number) => {
    if (view) {
      const { $from } = view.state.selection
      if (
        $from.node().type.name === "heading" &&
        $from.node().attrs.level === level
      ) {
        setBlockType(view.state.schema.nodes.paragraph)(
          view.state,
          view.dispatch,
          view,
        )
      } else {
        setBlockType(view.state.schema.nodes.heading, { level })(
          view.state,
          view.dispatch,
          view,
        )
      }
    }
  }

  const showImageDialog = () => {
    setImageModalOpen(true)
  }

  const onImageChosen = (url: string) => {
    if (view) {
      const { from, to } = view.state.selection
      const tr = view.state.tr
      tr.replaceRangeWith(
        from,
        to,
        view.state.schema.nodes.image.create({ src: url, title: "", alt: "" }),
      )
      view.dispatch(tr)
    }
  }

  const showLinkDialog = () => {
    setLinkModalOpen(true)
  }

  const onLinkChosen = (url: string) => {
    if (view) {
      const { from, to } = view.state.selection
      const tr = view.state.tr
      tr.addMark(
        from,
        to,
        view.state.schema.marks.link.create({ href: url, title: "" }),
      )
      view.dispatch(tr)
    }
  }

  const onCodeClicked = () => {
    if (view) {
      setBlockType(view.state.schema.nodes.code_block)(
        view.state,
        view.dispatch,
        view,
      )
    }
  }

  if (!handleReady) {
    return <div>Loading...</div>
  }

  return (
    <div id="prosemirror">
      <MenuBar
        onBoldClicked={onBoldClicked}
        onItalicClicked={onItalicClicked}
        onLinkClicked={showLinkDialog}
        onBlockQuoteClicked={onBlockQuoteClicked}
        onToggleOrderedList={onToggleOrderedList}
        onToggleNumberedList={onToggleNumberedList}
        onIncreaseIndent={onIncreaseIndent}
        onDecreaseIndent={onDecreaseIndent}
        onHeadingClicked={onHeadingClicked}
        onImageClicked={showImageDialog}
        onCodeClicked={onCodeClicked}
        isBoldActive={boldActive}
        isEmActive={emActive}
      />
      <div id="editor" ref={editorRoot} />
      <Modal
        isOpen={imageModalOpen}
        onClose={() => {
          setImageModalOpen(false)
        }}
      >
        <ImageForm
          onImageChosen={url => {
            setImageModalOpen(false)
            onImageChosen(url)
          }}
        />
      </Modal>
      <Modal
        isOpen={linkModalOpen}
        onClose={() => {
          setLinkModalOpen(false)
        }}
      >
        <LinkForm
          onUrlChosen={url => {
            setLinkModalOpen(false)
            onLinkChosen(url)
          }}
        />
      </Modal>
    </div>
  )
}

type MenuBarProps = {
  onBoldClicked: () => void
  onItalicClicked: () => void
  onLinkClicked: () => void
  onBlockQuoteClicked: () => void
  onToggleOrderedList: () => void
  onToggleNumberedList: () => void
  onIncreaseIndent: () => void
  onDecreaseIndent: () => void
  onHeadingClicked: (level: number) => void
  onImageClicked: () => void
  onCodeClicked: () => void
  isBoldActive: boolean
  isEmActive: boolean
}

function MenuBar({
  onBoldClicked,
  onItalicClicked,
  onLinkClicked,
  onBlockQuoteClicked,
  onToggleOrderedList,
  onToggleNumberedList,
  onIncreaseIndent,
  onDecreaseIndent,
  onHeadingClicked,
  onImageClicked,
  onCodeClicked,
  isBoldActive,
  isEmActive,
}: MenuBarProps) {
  return (
    <div id="menubar" className="menubar">
      <div className="row">
        <button
          id="bold"
          onClick={onBoldClicked}
          className={isBoldActive ? "active" : ""}
        >
          <Bold />
        </button>
        <button
          id="italic"
          onClick={onItalicClicked}
          className={isEmActive ? "active" : ""}
        >
          <Italic />
        </button>
        <button id="link" onClick={onLinkClicked}>
          <Link />
        </button>
        <button onClick={onCodeClicked}>
          <Braces />
        </button>
      </div>
      <div className="row">
        <button onClick={() => onHeadingClicked(1)}>
          <Heading1 />
        </button>
        <button onClick={() => onHeadingClicked(2)}>
          <Heading2 />
        </button>
        <button onClick={() => onHeadingClicked(3)}>
          <Heading3 />
        </button>
        <button onClick={() => onHeadingClicked(4)}>
          <Heading4 />
        </button>
        <button onClick={() => onHeadingClicked(5)}>
          <Heading5 />
        </button>
        <button onClick={() => onHeadingClicked(6)}>
          <Heading6 />
        </button>
      </div>
      <div className="row">
        <CaptionedButton caption="Blockquote" onClick={onBlockQuoteClicked}>
          <TextQuote />
        </CaptionedButton>
        <CaptionedButton caption="number list" onClick={onToggleNumberedList}>
          <ListOrdered />
        </CaptionedButton>
        <CaptionedButton caption="bullet list" onClick={onToggleOrderedList}>
          <List />
        </CaptionedButton>
        <CaptionedButton caption="indent" onClick={onIncreaseIndent}>
          <Indent />
        </CaptionedButton>
        <CaptionedButton caption="outdent" onClick={onDecreaseIndent}>
          <Outdent />
        </CaptionedButton>
        <CaptionedButton caption="image" onClick={onImageClicked}>
          <Image />
        </CaptionedButton>
      </div>
    </div>
  )
}

function CaptionedButton({
  caption,
  onClick,
  children,
}: {
  caption: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <div className="captionedButton">
      <button onClick={onClick}>{children}</button>
      <p>{caption}</p>
    </div>
  )
}

function markActive(state: EditorState, type: MarkType) {
  const { from, $from, to, empty } = state.selection
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks())
  else return state.doc.rangeHasMark(from, to, type)
}

function blockQuoteRule(nodeType: NodeType) {
  return wrappingInputRule(/^\s*>\s$/, nodeType)
}

function orderedListRule(nodeType: NodeType) {
  return wrappingInputRule(
    /^(\d+)\.\s$/,
    nodeType,
    match => ({ order: +match[1] }),
    (match, node) => node.childCount + node.attrs.order == +match[1],
  )
}

function bulletListRule(nodeType: NodeType) {
  return wrappingInputRule(/^\s*([-+*])\s$/, nodeType)
}

function codeBlockRule(nodeType: NodeType) {
  return textblockTypeInputRule(/^```$/, nodeType)
}

function headingRule(nodeType: NodeType, maxLevel: number) {
  return textblockTypeInputRule(
    new RegExp("^(#{1," + maxLevel + "})\\s$"),
    nodeType,
    match => ({ level: match[1].length }),
  )
}

function buildInputRules(schema: Schema) {
  const rules = smartQuotes.concat(ellipsis, emDash)
  let type
  if ((type = schema.nodes.blockquote)) rules.push(blockQuoteRule(type))
  if ((type = schema.nodes.ordered_list)) rules.push(orderedListRule(type))
  if ((type = schema.nodes.bullet_list)) rules.push(bulletListRule(type))
  if ((type = schema.nodes.code_block)) rules.push(codeBlockRule(type))
  if ((type = schema.nodes.heading)) rules.push(headingRule(type, 6))
  return inputRules({ rules })
}
