// Short, human-distinguishable form of a database id for display. Slices
// from the END, not the start: Mongo ObjectIds share their leading ~10 hex
// chars (timestamp + per-process random) for documents inserted in the same
// second by the same process — e.g. a batch of agents created together for
// one simulation — so a front-truncated id shows the same-looking string
// for every one of them. The trailing hex digits are a per-document
// counter, so they're what actually differs.
export function shortId(id: string, length = 8): string {
  return id.slice(-length);
}
