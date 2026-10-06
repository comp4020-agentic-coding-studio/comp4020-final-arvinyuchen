import { EventEmitter } from "node:events";

// One process, one bus: every open SSE connection subscribes here, and a
// change in a group is broadcast to everyone watching that group. This only
// works because the app runs on exactly one machine (see fly.toml).
export const bus = new EventEmitter();
bus.setMaxListeners(0);

export const changed = (groupId: string) => bus.emit("change", { groupId });
