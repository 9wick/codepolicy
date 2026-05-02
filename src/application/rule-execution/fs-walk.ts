export function shouldSkipEntry(name: string): boolean {
  return name === '.git' || name === 'node_modules';
}
