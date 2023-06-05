# Automerge prosemirror plugin

## Status

Inserting (inclulding pasting) text and adding marks (well, currently just a
bold mark) and merging concurrent changes works to some extent. There are
numerous bugs but I believe the underlying idea is solid.

## How to play

This is developed in tandem with [a demo
repo](https://github.com/alexjg/automerge-prosemirror-demo). You'll need to do
a `yarn link` dance with "@automerge/prosemirror" to play with it.

```bash
#in this repo
yarn link

#in the demo repo
yarn link @automerge/prosemirror
```

Currently the interface for the library is something like this:

```javascript
import { init as initPm, plugin as amgPlugin, PatchSemaphore} from "@automerge/prosemirror"

// This is used to ensure patches and transactions don't trample on each other
// create it and keep it around for the lifetime of your editor
const semaphore = new PatchSemaphore()

// Create your prosemirror state
let editorConfig = {
  schema: , //this should be the prosemirror-schema-basic schema
  ..., // whatever other stuff
  plugins: [
    keymap({
      ...baseKeymap,
      "Mod-b": toggleBold,
      "Mod-i": toggleItalic,
      "Mod-z": undo,
      "Mod-y": redo,
      "Mod-Shift-z": redo,
    }),
    amgPlugin(handle.doc, path),
  ],
  doc: initPm(handle.doc, path)
}

let state = EditorState.create(editorConfig)

// This is how the plugin modifies the document whenever there are changes, it
// must apply the provided change function to the document and return the 
// updated document
const doChange = (fn: (d: automerge.Doc<any>) => void): automerge.Doc<any> => {
    ...
}

const view = new EditorView(editorRoot.current, {
  state,
  dispatchTransaction: (tx: Transaction) => {
    // Here we intercept the transaction
    let newState = semaphore.intercept(automerge.getHeads(handle.doc), doChange, tx, view.state)
    view.updateState(newState)
  }
})

// This is a callback which you wire up to be called anytime there are changes
// received from elsewhere. The type signature here assuems you're using
// automerge-repo
const onPatch = (p: DocHandlePatchPayload<any>) => {
  let newState = semaphore.reconcilePatch(p.patches, automerge.getHeads(p.after), view.state)
  view.updateState(newState)
}
// somehow wire up the callback
handle.on("patch", onPatch)
```

## How it works

We only model a very simple prosemirror document consisting of paragraphs and
marks. We represent paragraph breaks as single line breaks (I did experiment
with double line breaks but this very quickly becomes quite messy in the face
of concurrent inserts of newlines).

We attempt to have a unidirectional dataflow, which looks like this:

* In `intercept`
    * We translate the prosemirror transaction into
      modifications to the automerge document.
    * Then we generate a diff for the changes we just made to the document
    * Then we create a prosemirror transaction from the diff and apply it to the 
      editorstate
* in `reconcilePatch`
    * We use the same process as above to generate a transaction and apply it
      to the document

The upshot is that the source of truth is always the automerge document.
