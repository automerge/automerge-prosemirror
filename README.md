# Automerge prosemirror plugin

## Status

Support for all elements in the `prosemirror-schema-basic` and `prosemirror-schema-list` except for the `hr` element is implemented. The next step is to generalize this to allow adapting user provided schemas.

In general this is alpha quality software. There are still a fair number of bugs and the API will probably change, but the core functionality works most of the time.

## How to play

This work depends on the `@automerge/automerge >= 2.2.0` package, so you'll need to update your dependencies.

There is a fully functional editor in this repository, you can play with that by running `npm run playground` and then visiting `http://localhost:5173`.

## Example

The API for this library is based around an object called an `AutoMirror`. This object is used to intercept transactions from Prosemirror and to handle changes received over the network. This is best used in tandem with `@automerge/automerge-repo`. See the `playground/src/Editor.tsx` file for a fully featured example.

The workflow when using this library is to first create an `AutoMirror` object, then use `AutoMirror.initialize` to create an initial prosemirror document and `AutoMirror.schema` to get a schema which you pass to prosemirror. Then, you intercept transactions from prosemirror using `AutoMirror.intercept` and you reconcile patches from the network using `AutoMirror.reconcilePatch`.

For example

```javascript
import {AutoMirror} from "@automerge/prosemirror"

//

const handle = repo.find("some-doc-url")
// somehow wait for the handle to be ready before continuing
await handle.whenReady()

// Create an AutoMirror
const autoMirror = new AutoMirror(["text"])

// Create your prosemirror state
let editorConfig = {
  schema: autoMirror.schema, // This _must_ be the schema from the AutoMirror
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
  ],
  doc: autoMirror.initialize(handle.docSync(), ["text"])
}

let state = EditorState.create(editorConfig)


const view = new EditorView(editorRoot.current, {
  state,
  dispatchTransaction: (tx: Transaction) => {
    // Here we intercept the transaction
    let newState = autoMirror.intercept(automerge.getHeads(handle.doc), doChange, tx, view.state)
    view.updateState(newState)
  }
})

// This is a callback which you wire up to be called anytime there are changes
// received from elsewhere. The type signature here assuems you're using
// automerge-repo
const onPatch = (p: DocHandlePatchPayload<any>) => {
  const newState = autoMirror.reconcilePatch(
    patchInfo.before,
    doc,
    patches,
    view.state,
  )
  view.updateState(newState)
}
// somehow wire up the callback
handle.on("patch", onPatch)
```
