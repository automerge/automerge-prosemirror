import { next as automerge } from "@automerge/automerge";
import { EditorState } from "prosemirror-state";
import { docFromSpans } from "../src/traversal";
import { schema } from "../src/schema";
export function docFromBlocksNotation(notation) {
    let doc = automerge.from({ text: "" });
    let index = 0;
    doc = automerge.change(doc, doc => {
        for (const line of notation) {
            if (typeof line === "string") {
                automerge.splice(doc, ["text"], index, 0, line);
                index += line.length;
            }
            else {
                automerge.splitBlock(doc, ["text"], index, line);
                index += 1;
            }
        }
    });
    return { doc, spans: automerge.spans(doc, ["text"]) };
}
export function makeDoc(defs) {
    const { spans, doc } = docFromBlocksNotation(defs);
    const pmDoc = docFromSpans(spans);
    const editor = EditorState.create({ schema, doc: pmDoc });
    return { spans, doc, editor };
}
export function printTree(node, options = { includeMarks: false }) {
    if (node.isText) {
        if (options.includeMarks) {
            return {
                text: node.textContent,
                marks: node.marks.map(mark => mark.type.name),
            };
        }
        else {
            return node.textContent;
        }
    }
    else {
        const children = [];
        for (let i = 0; i < node.childCount; i++) {
            children.push(printTree(node.child(i), options));
        }
        return {
            name: node.type.name,
            attrs: node.attrs,
            children,
        };
    }
}
//# sourceMappingURL=utils.js.map