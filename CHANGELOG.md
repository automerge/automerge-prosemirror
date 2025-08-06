
## Pre-release (0.2.0-alpha.0) - 2025-08-06

* Allow mapping ProseMirror inline nodes to automerge blocks

## 0.1.0

This release updates to automerge 3.1.1 and automerge-repo 2.1.0. This plugin doesn't actually depend directly on automerge-repo, but the `DocHandle` interface is written to match the `DocHandle` interface from automerge-repo and automerge-repo 2.1.0 has deprecated the `DocHandle.docSync` method and instead has a `doc` method which never returns `undefined`. This is a breaking change because the old `docSync` method could return `undefined` if the document was not yet loaded.

To update you need to update to automerge-repo 2.1.0 or later. We also require automerge 3.1.1 or later as there are some bugfixes to patch generation in that version which we need.

## 0.0.13

Instead of intercepting and replacing ProseMirror transactions the library now implements a plugin that listens to ProseMirror transactions and updates the automerge document. This means that this library now plays nice with other plugins such as the history plugin. Thanks to @brianhung for implementing this.

Now that we have a plugin based architecture we are able to simplify the API, so where you would previously have instantiated an `AutoMirror` and used it to intercept transactions in ProseMirrors' `dispatchTransaction` method, you now use `init` from this library to create a plugin, ProseMirror document, and schema, which you pass to the editor.

```javascript
// This is the important part, we initialize the plugin with some handle and the path to the text field in the document
// and we get back a schema, a ProseMirror document, and a plugin
const { schema, pmDoc, plugin } = init(handle, ["text"])

// Create your prosemirror state with the schema, plugin, and document
let editorConfig = {
  schema,
  plugins: [
    plugin,
    ...
  ],
  doc: pmDoc
}
```

## Contributors

- @alexjg
- @brianhung
