// Audio files can be registered here later without coupling content to game logic.
export const audio = {
  clips: { click: null, item: null, emotion: null },
  play(name) { const source = this.clips[name]; if (source) new Audio(source).play().catch(() => {}); }
};
