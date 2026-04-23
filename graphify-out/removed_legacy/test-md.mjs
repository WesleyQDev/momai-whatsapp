import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';

const state = EditorState.create({
  doc: "- **exemplo**",
  extensions: [markdown()]
});

const tree = ensureSyntaxTree(state, state.doc.length);
tree.cursor().iterate(node => {
  console.log(node.name, node.from, node.to, state.doc.sliceString(node.from, node.to));
});
