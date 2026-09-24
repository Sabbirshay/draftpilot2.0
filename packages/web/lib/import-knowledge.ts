export async function importKnowledge(file: File): Promise<string> {
  if (file.size > 512000) throw new Error("Choose a file smaller than 500 KB.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt" || ext === "md") {
    const text = await file.text();
    if (text.length > 100000)
      throw new Error("Keep source content below 100,000 characters.");
    return text;
  }
  if (!["xlsx", "csv", "tsv"].includes(ext || ""))
    throw new Error("Use a text, Markdown, XLSX, CSV, or TSV file.");
  const bytes = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker("/workers/import.js");
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          "This workbook took too long to read. Export a smaller CSV instead.",
        ),
      );
    }, 5000);
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (event) => {
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.text);
    };
    worker.onerror = () => {
      cleanup();
      reject(
        new Error(
          "This spreadsheet could not be read. Try a smaller CSV file.",
        ),
      );
    };
    worker.postMessage({ bytes, name: file.name }, [bytes]);
  });
}
