# Automerge prosemirror plugin

## Status

Support for all elements in the `prosemirror-schema-basic` and `prosemirror-schema-list` except for the `hr` element is implemented. The next step is to generalize this to allow adapting user provided schemas.

## How to play

This work is based on the `@automerge/automerge@2.2.0-rc.2` package, so you'll need to add an entry in your package.json `overrides` for that. E.g.:

```json
{
  ...
  "overrides": {
    "@automerge/automerge-repo": {
      "@automerge/automerge": "2.2.0-rc.2"
    }
  },
  ...
}
```

There is a fully functional editor in this repository, you can play with that by running `yarn playground` and then visiting `http://localhost:5173`.


## Example

The API for this library is based around a (slightly misnamed) object called a `PatchSemaphore`. This object is used to intercept transactions from Prosemirror and to handle changes received over the network. This is best used in tandem with `@automerge/automerge-repo`. See the `playground/src/Editor.tsx` file for a fully featured example.

The workflow when using this plugin is to first initialize the document using `initialize` and then use `PatchSemaphore.intercept` to intercept local transactions and `PatchSemaphore.reconcilePatch` to handle changes received from the network.

For example


```javascript
import {initialize, PatchSemaphore} from "@automerge/prosemirror"

//

const handle = repo.find("some-doc-url")
// somehow wait for the handle to be ready before continuing
await handle.whenReady()

// This is used to ensure patches and transactions don't trample on each other
// create it and keep it around for the lifetime of your editor. The constructor
// argument is the path to the text field we are editing in the automerge document
const semaphore = new PatchSemaphore(["text"])

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
  ],
  doc: initialize(handle.docSync(), ["text"])
}

let state = EditorState.create(editorConfig)


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
  const newState = semaphore.reconcilePatch(
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
