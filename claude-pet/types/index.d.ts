/** Mods whose one-line readout Clawd draws beside itself; they leave their own band out. */
export type PetHosts = string[];

declare module "claude-code" {
  interface PluginState {
    "claude-pet": { hosts: PetHosts };
  }
}
