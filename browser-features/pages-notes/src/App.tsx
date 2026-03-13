import { useEffect, useRef, useState, useCallback } from "react";
import { NoteList } from "./components/notes/NoteList.tsx";
import { RichTextEditor } from "./components/editor/RichTextEditor.tsx";
import { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { getNotes, NotesData, saveNotes } from "./lib/dataManager.ts";
import { useTranslation } from "react-i18next";

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

function App() {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loadNotes = async () => {
      try {
        setIsLoading(true);
        const notesData = await getNotes();

        const convertedNotes: Note[] = notesData.titles.map((title, index) => ({
          id: `note-${index}`,
          title: title || t("notes.emptyTitle"),
          content: notesData.contents[index] || "",
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        setNotes(convertedNotes);

        if (convertedNotes.length > 0) {
          setSelectedNote(convertedNotes[0]);
          setTitle(convertedNotes[0].title);
        }
      } catch (error) {
        console.error(t("error.loadFailed"), error);
      } finally {
        setIsLoading(false);
      }
    };

    loadNotes();
  }, [t]);

  const saveNotesToStorage = useCallback(async (notesToSave: Note[]) => {
    try {
      const notesData: NotesData = {
        titles: notesToSave.map((note) => note.title),
        contents: notesToSave.map((note) => note.content),
      };

      await saveNotes(notesData);
    } catch (error) {
      console.error(t("error.saveFailed"), error);
    }
  }, [t]);

  // Debounced save to avoid frequent writes
  const debouncedSave = useCallback((notesToSave: Note[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveNotesToStorage(notesToSave);
    }, 500);
  }, [saveNotesToStorage]);

  useEffect(() => {
    if (!isLoading) {
      debouncedSave(notes);
    }
  }, [notes, isLoading, debouncedSave]);

  // Cleanup function to clear pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const createNewNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: t("notes.new"),
      content: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setNotes([newNote, ...notes]);
    setSelectedNote(newNote);
    setTitle(newNote.title);
  };

  const updateCurrentNote = (content: string) => {
    if (!selectedNote) return;

    const updatedNote = {
      ...selectedNote,
      title,
      content,
      updatedAt: new Date(),
    };

    setNotes(
      notes.map((note) => note.id === selectedNote.id ? updatedNote : note),
    );
    setSelectedNote(updatedNote);
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter((note) => note.id !== id));
    if (selectedNote?.id === id) {
      setSelectedNote(null);
      setTitle("");
    }
  };

  const selectNote = (note: Note) => {
    setSelectedNote(note);
    setTitle(note.title);
  };

  const handleEditorChange = (
    editorState: SerializedEditorState<SerializedLexicalNode>,
  ) => {
    updateCurrentNote(JSON.stringify(editorState));
  };

  return (
    <div className="flex flex-col h-screen bg-base-100 text-base-content">
      <header className="bg-base-200 p-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-base-content">
          {t("title.default")}
        </h1>
        <div className="flex gap-2">
          <button
            type="button"
            className={`btn btn-sm ${
              isReorderMode ? "btn-secondary" : "btn-ghost"
            }`}
            onClick={() => setIsReorderMode(!isReorderMode)}
          >
            {isReorderMode ? t("notes.done") : t("notes.reorder")}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={createNewNote}
          >
            {t("notes.new")}
          </button>
        </div>
      </header>

      <div className="flex flex-col flex-1 overflow-hidden">
        {isLoading
          ? (
            <div className="flex flex-col items-center justify-center h-full">
              <span className="loading loading-spinner loading-lg text-primary">
              </span>
              <p className="mt-4">{t("notes.loading")}</p>
            </div>
          )
          : (
            <>
              <NoteList
                notes={notes}
                selectedNote={selectedNote}
                onSelectNote={selectNote}
                onDeleteNote={deleteNote}
                onReorderNotes={(newNotes) => {
                  setNotes(newNotes);
                  saveNotesToStorage(newNotes);
                }}
                isReorderMode={isReorderMode}
              />

              <div className="flex-1 flex flex-col p-4 overflow-hidden border-t border-base-content/20">
                {selectedNote
                  ? (
                    <div className="flex flex-1 gap-4 overflow-y-auto">
                      <div className="flex-1 flex flex-col">
                        <input
                          type="text"
                          className="input input-bordered w-full mb-2 focus:outline-none focus:border-primary/30"
                          placeholder={t("notes.titlePlaceholder")}
                          value={title}
                          onChange={(e) => {
                            setTitle(e.target.value);
                            updateCurrentNote(selectedNote.content);
                          }}
                        />
                        <div className="flex-1 flex flex-col rounded-lg overflow-hidden">
                          <RichTextEditor
                            onChange={handleEditorChange}
                            initialContent={selectedNote.content}
                            noteId={selectedNote.id}
                          />
                        </div>
                      </div>
                    </div>
                  )
                  : (
                    <div className="flex flex-col items-center justify-center h-full text-base-content/70">
                      <p className="mb-4">{t("notes.noNotesSelected")}</p>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={createNewNote}
                      >
                        {t("notes.createNew")}
                      </button>
                    </div>
                  )}
              </div>
            </>
          )}
      </div>
    </div>
  );
}

export default App;
