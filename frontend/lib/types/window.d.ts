/**
 * Global Window Interface Extensions
 * Type definitions for browser APIs and vendor prefixes
 */

declare global {
  interface Window {
    /**
     * WebKit (Safari) vendor prefix for AudioContext
     * Used for cross-browser audio context creation
     */
    webkitAudioContext?: typeof AudioContext;

    /**
     * WebKit (Safari) vendor prefix for OfflineAudioContext
     * Used for offline audio processing
     */
    webkitOfflineAudioContext?: typeof OfflineAudioContext;

    /**
     * WebKit (Safari) vendor prefix for AudioWorklet
     * Used for advanced audio processing
     */
    webkitAudioWorklet?: typeof AudioWorklet;
  }
}

export {};
