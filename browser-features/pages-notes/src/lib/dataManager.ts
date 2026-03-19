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

export async function addNote(t: (key: string) => string, title: string, content: string): Promise<void> {
  const notes = await getNotes(t);
  const ts = Date.now();
  notes.ids!.push(crypto.randomUUID());
  notes.titles.push(title);
  notes.contents.push(content);
  notes.createdAts!.push(ts);
  notes.updatedAts!.push(ts);
  await saveNotes(notes);
}

export async function updateNote(
  t: (key: string) => string,
  index: number,
  title: string,
  content: string,
): Promise<void> {
  const notes = await getNotes(t);
  if (index >= 0 && index < notes.titles.length) {
    notes.titles[index] = title;
    notes.contents[index] = content;
    notes.updatedAts![index] = Date.now();
    await saveNotes(notes);
  } else {
    throw new Error(`Index ${index} is out of range`);
  }
}

export async function deleteNote(t: (key: string) => string, index: number): Promise<void> {
  const notes = await getNotes(t);
  if (index >= 0 && index < notes.titles.length) {
    notes.ids!.splice(index, 1);
    notes.titles.splice(index, 1);
    notes.contents.splice(index, 1);
    notes.createdAts!.splice(index, 1);
    notes.updatedAts!.splice(index, 1);
    await saveNotes(notes);
  } else {
    throw new Error(`Index ${index} is out of range`);
  }
}

export async function reorderNotes(
  t: (key: string) => string,
  fromIndex: number,
  toIndex: number,
): Promise<void> {
  const notes = await getNotes(t);

  if (
    fromIndex < 0 ||
    fromIndex >= notes.titles.length ||
    toIndex < 0 ||
    toIndex >= notes.titles.length
  ) {
    throw new Error("Index is out of range");
  }

  const [movedId] = notes.ids!.splice(fromIndex, 1);
  notes.ids!.splice(toIndex, 0, movedId);

  const [movedTitle] = notes.titles.splice(fromIndex, 1);
  notes.titles.splice(toIndex, 0, movedTitle);

  const [movedContent] = notes.contents.splice(fromIndex, 1);
  notes.contents.splice(toIndex, 0, movedContent);

  const [movedCreatedAt] = notes.createdAts!.splice(fromIndex, 1);
  notes.createdAts!.splice(toIndex, 0, movedCreatedAt);

  const [movedUpdatedAt] = notes.updatedAts!.splice(fromIndex, 1);
  notes.updatedAts!.splice(toIndex, 0, movedUpdatedAt);

  await saveNotes(notes);
}
