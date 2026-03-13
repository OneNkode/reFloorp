import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { editorConfig } from "./config.ts";
import { Toolbar } from "./Toolbar.tsx";

import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $createParagraphNode, $createTextNode } from "lexical";

interface RichTextEditorProps {
    onChange: (editorState: SerializedEditorState<SerializedLexicalNode>) => void;
    initialContent?: string;
    noteId?: string;
}

export const RichTextEditor = ({ onChange, initialContent, noteId }: RichTextEditorProps) => {
    return (
        <LexicalComposer initialConfig={editorConfig}>
            <EditorContent onChange={onChange} initialContent={initialContent} noteId={noteId} />
        </LexicalComposer>
    );
};

const EditorContent = ({ onChange, initialContent, noteId }: RichTextEditorProps) => {
    const [editor] = useLexicalComposerContext();
    const lastNoteIdRef = useRef<string | undefined>(undefined);
    const isInternalChange = useRef(false);

    // Update content when noteId changes (switching between notes)
    useEffect(() => {
        if (noteId !== lastNoteIdRef.current) {
            lastNoteIdRef.current = noteId;
            isInternalChange.current = true;
            
            if (initialContent) {
                try {
                    const parsedContent = JSON.parse(initialContent);
                    editor.setEditorState(editor.parseEditorState(parsedContent));
                } catch (e) {
                    console.log("Failed to parse initial content:", e);
                    editor.update(() => {
                        const root = $getRoot();
                        root.clear();

                        const lines = initialContent.split("\n");

                        for (const line of lines) {
                            const paragraphNode = $createParagraphNode();
                            if (line.length > 0) {
                                paragraphNode.append($createTextNode(line));
                            }
                            root.append(paragraphNode);
                        }
                    });
                }
            } else {
                editor.update(() => {
                    const root = $getRoot();
                    root.clear();
                    root.append($createParagraphNode());
                });
            }
            
            // Reset flag after a short delay to allow OnChangePlugin to settle
            setTimeout(() => {
                isInternalChange.current = false;
            }, 0);
        }
    }, [editor, initialContent, noteId]);

    return (
        <div className="flex flex-col h-full">
            <Toolbar />
            <div className="flex-1 overflow-auto p-4">
                <RichTextPlugin
                    contentEditable={
                        <ContentEditable className="h-full outline-none" />
                    }
                    ErrorBoundary={({ children }) => children}
                />
            </div>
            {onChange && (
                <OnChangePlugin
                    onChange={(editorState) => {
                        if (!isInternalChange.current) {
                            editorState.read(() => {
                                const content = editorState.toJSON();
                                onChange(content);
                            });
                        }
                    }}
                />
            )}
            <ListPlugin />
            <CheckListPlugin />
            <HistoryPlugin />
        </div>
    );
};