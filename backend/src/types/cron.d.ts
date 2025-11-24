declare module 'cron' {
  export class CronJob {
    constructor(
      cronTime: string,
      onTick: () => void,
      onComplete?: (() => void) | null,
      start?: boolean,
      timeZone?: string,
    );
    start(): void;
    stop(): void;
  }
}
