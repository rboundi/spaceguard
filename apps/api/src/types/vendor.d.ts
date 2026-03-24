// Minimal type declarations for js-yaml (no @types/js-yaml available in this env).
// Only the surface used by the rule loader is declared here.
declare module "js-yaml" {
  /**
   * Parse a YAML string and return the JavaScript object.
   * Returns `undefined` for empty documents.
   */
  export function load(input: string): unknown;
}
