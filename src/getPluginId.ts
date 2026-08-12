/** Reverse-domain id for THIS extension's own metadata/settings namespace. */
export function getPluginId(path: string): string {
  return `uk.tanserver.forgesteel-bridge/${path}`;
}
