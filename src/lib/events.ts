import { EventEmitter } from "node:events";

// One process, one bus: every open SSE connection subscribes here. A change
// inside a group (a join, a pick, a vote) goes to that group's pages; a new
// shared place goes to every open page, since every group's Explore shows it.
// This only works because the app runs on exactly one machine (see fly.toml).
export const bus = new EventEmitter();
bus.setMaxListeners(0);

export const changed = (groupId: string) => bus.emit("change", { groupId });
export const placesChanged = () => bus.emit("places");
// Something said, deleted or brought back in one of a group's Talk threads:
// which place's, and nothing more. Never the words: the page asks for the
// thread itself, from a route that checks a member is asking (src/lib/talk.ts).
export const talked = (groupId: string, placeId: number) => bus.emit("talk", { groupId, placeId });
