import { rpc } from "./rpc/rpc.ts";

const NOTES_PREF_NAME = "floorp.browser.note.memos";

export interface NotesData {
  ids?: string[];
  titles: string[];
  contents: string[];
  createdAts?: number[];
  updatedAts?: number[];
}

function getDefaultNotes(t: (key: string) => string): NotesData {
  const now = Date.now();
  return {
    ids: [crypto.randomUUID()],
    titles: [t("notes.welcome")],
    contents: [t("notes.welcomeContent")],
    createdAts: [now],
    updatedAts: [now],
  };
}

export async function getNotes(t: (key: string) => string): Promise<NotesData> {
  try {
    const notesStr = await rpc.getStringPref(NOTES_PREF_NAME);
    if (!notesStr) {
      return getDefaultNotes(t);
    }

    const parsedNotes = JSON.parse(notesStr) as NotesData;

    // Migrate legacy data
    const len = parsedNotes.titles.length;
    if (!parsedNotes.ids) {
      parsedNotes.ids = Array.from({ length: len }, () => crypto.randomUUID());
    }
    if (!parsedNotes.createdAts) {
      parsedNotes.createdAts = Array.from({ length: len }, () => Date.now());
    }
    if (!parsedNotes.updatedAts) {
      parsedNotes.updatedAts = Array.from({ length: len }, () => Date.now());
    }

    return parsedNotes;
  } catch (e) {
    console.error("Failed to load note data:", e);
    return getDefaultNotes(t);
  }
}

export async function saveNotes(data: NotesData): Promise<void> {
  try {
    await rpc.setStringPref(NOTES_PREF_NAME, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save note data:", e);
    throw e;
  }
}

