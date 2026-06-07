export function getFilename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

export function getParentPath(path: string): string {
  const filename = getFilename(path);
  return path.slice(0, path.length - filename.length).replace(/[/\\]+$/, "");
}

export function getFileExtension(path: string): string {
  return path.split(".").pop()?.toUpperCase() || "FILE";
}
