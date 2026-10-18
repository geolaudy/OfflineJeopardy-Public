// R10-11: a visual editor for clue and answer text — bold, italics and underline show as such (no
// [b] tags on screen), Enter / Shift+Enter start a new line, Ctrl+B / I / U, undo / redo (Ctrl+Z /
// Ctrl+Y), paste keeps only those three styles and line breaks. Built on TipTap (ProseMirror) with
// just the pieces this format needs: its schema drops anything else (no HTML ever reaches the
// board). The value in and out is the board's stored text format (richDoc.ts).
import { useEffect, useRef } from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import HardBreak from '@tiptap/extension-hard-break';
import { UndoRedo } from '@tiptap/extensions';
import { Plugin } from '@tiptap/pm/state';
import { Slice } from '@tiptap/pm/model';
import { docToMarkup, markupToDoc, type DocNode } from './richDoc';

const markup = (e: Editor) => docToMarkup(e.getJSON() as DocNode);

/** Enter makes a line break (one clue = one paragraph); the stored text never grows past `max`. */
const ClueText = Extension.create<{ max: number }>({
  name: 'clueText',
  addOptions: () => ({ max: 2000 }),
  addKeyboardShortcuts() {
    return { Enter: () => this.editor.commands.setHardBreak() };
  },
  addProseMirrorPlugins() {
    const max = this.options.max;
    return [new Plugin({ filterTransaction: (tr) => !tr.docChanged || docToMarkup(tr.doc.toJSON() as DocNode).length <= max })];
  },
});

export type RichEditorApi = Editor | null;

export function useRichEditor({ value, onChange, maxLength, labelledBy, testId, rows }: { value: string; onChange: (v: string) => void; maxLength: number; labelledBy: string; testId: string; rows: number }) {
  const last = useRef(value);
  const change = useRef(onChange);
  change.current = onChange;
  const editor = useEditor({
    extensions: [Document, Paragraph, Text, Bold, Italic, Underline, HardBreak, UndoRedo, ClueText.configure({ max: maxLength })],
    content: markupToDoc(value),
    shouldRerenderOnTransaction: true,
    editorProps: {
      // A copied line pastes into the current line (not as a new one); several lines stay lines.
      transformPasted: (slice) => (slice.content.childCount === 1 && slice.content.firstChild?.type.name === 'paragraph' ? new Slice(slice.content, Math.max(1, slice.openStart), Math.max(1, slice.openEnd)) : slice),
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelledBy,
        'data-testid': testId,
        class: 'rich-editor',
        style: `min-height: ${rows * 1.6 + 1.25}rem`,
      },
    },
    // Only real edits are saved: opening a clue never rewrites its stored text.
    onUpdate: ({ editor: e }) => {
      const v = markup(e);
      last.current = v;
      e.view.dom.setAttribute('data-value', v);
      change.current(v);
    },
  });
  // The stored value, for tests and assistive checks (kept in step with the document).
  useEffect(() => {
    if (!editor) return;
    if (value !== last.current) {
      last.current = value;
      // A new clue or an outside change (e.g. the AI helper): replace the content, not an edit.
      editor.commands.setContent(markupToDoc(value) as never, { emitUpdate: false });
    }
    editor.view.dom.setAttribute('data-value', value);
  }, [editor, value]);
  return editor;
}

export function RichEditorContent({ editor }: { editor: Editor | null }) {
  return <EditorContent editor={editor} />;
}
