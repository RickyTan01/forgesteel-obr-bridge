/**
 * Any URL string handed to the OBR SDK (buildImage's ImageContent.url,
 * contextMenu icon paths, etc.) gets resolved by OBR's OWN code, which runs
 * in the top-level www.owlbear.rodeo page — not inside our extension's
 * iframe. A root-relative path like "/action-icon.svg" resolves correctly
 * within our own document (action.html/background.html) but resolves
 * against www.owlbear.rodeo once it crosses that boundary, producing a
 * request like https://www.owlbear.rodeo/action-icon.svg instead of our own
 * origin. Confirmed live: a condition badge's image request actually went
 * out as https://www.owlbear.rodeo/forgesteel-obr-bridge/assets/bleeding-*.png.
 * Always resolve against window.location.origin (this document's own
 * origin, correct regardless of which deployment — Pages vs. private — is
 * serving it) before handing a path to the SDK.
 */
export function toAbsoluteUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, window.location.origin).href;
}
