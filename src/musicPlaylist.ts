export function orderedMusicUrls(files: Record<string, string>): string[] {
  return Object.keys(files)
    .sort((first, second) => first.localeCompare(second, 'es', { numeric: true }))
    .map(name => files[name]);
}
