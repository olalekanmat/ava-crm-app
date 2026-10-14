let demo = false;

/** The demo company has no server sign-in, so Ava AI cannot run there. The store keeps this in step with the session. */
export function setAiDemo(on: boolean): void {
  demo = on;
}

export const aiDemo = (): boolean => demo;
