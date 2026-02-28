declare module "tinykeys" {
  export function tinykeys(
    target: Window | HTMLElement,
    keybindings: Record<string, (event: KeyboardEvent) => void>,
    options?: { event?: "keydown" | "keyup" }
  ): () => void;
}
