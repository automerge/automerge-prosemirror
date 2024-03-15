import { next as automerge } from "@automerge/automerge";
import { EditorState } from "prosemirror-state";
import { Node } from "prosemirror-model";
import { BlockAttrValue } from "@automerge/automerge/dist/next_types";
export type BlockDef = {
    type: string;
    parents: string[];
    attrs: Record<string, BlockAttrValue>;
};
export declare function docFromBlocksNotation(notation: (string | BlockDef)[]): {
    doc: automerge.Doc<{
        text: string;
    }>;
    spans: automerge.Span[];
};
export declare function makeDoc(defs: (string | BlockDef)[]): {
    spans: automerge.Span[];
    doc: automerge.Doc<unknown>;
    editor: EditorState;
};
type PrintOptions = {
    includeMarks: boolean;
};
export declare function printTree(node: Node, options?: PrintOptions): object | string;
export {};
