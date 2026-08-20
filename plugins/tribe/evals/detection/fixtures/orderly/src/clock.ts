// module: src/clock
export interface Clock {
  nowUtc(): string;
}

export const systemClock: Clock = {
  nowUtc(): string {
    return new Date().toISOString();
  },
};
