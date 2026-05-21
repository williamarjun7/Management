import { logger } from './logger';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function playKitchenAlert(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(1100, now + 0.1);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.5, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    oscillator.start(now);
    oscillator.stop(now + 0.3);
  } catch (err) {
    logger.warn('kitchen_alert_sound_failed', 'kitchen-sound', {
      metadata: { error: (err as Error)?.message },
    });
  }
}
