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
