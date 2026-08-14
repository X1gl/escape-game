let context = null;
let hum = null;
let enabled = true;

function getContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  context ||= new AudioContext();
  if (context.state === "suspended") context.resume();
  return context;
}

export function play(kind = "tap") {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx) return;
  const settings = {
    tap: [520, 0.025, 0.025],
    item: [690, 0.08, 0.05],
    unlock: [180, 0.16, 0.08],
    metal: [970, 0.12, 0.045],
    knob: [92, 0.13, 0.11],
  }[kind] || [520, 0.025, 0.025];
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  oscillator.type = kind === "knob" ? "sawtooth" : "sine";
  oscillator.frequency.setValueAtTime(settings[0], now);
  if (kind === "item") oscillator.frequency.exponentialRampToValueAtTime(1040, now + settings[1]);
  gain.gain.setValueAtTime(settings[2], now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[1]);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + settings[1]);
}

export function startHum() {
  if (!enabled || hum) return;
  const ctx = getContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 46;
  gain.gain.value = 0.012;
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start();
  hum = { oscillator, gain };
}

export function stopHum() {
  if (!hum) return;
  hum.gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.05);
  hum.oscillator.stop(context.currentTime + 0.06);
  hum = null;
}

export function setEnabled(value) {
  enabled = value;
  if (!enabled) stopHum();
  return enabled;
}

export function isEnabled() {
  return enabled;
}
