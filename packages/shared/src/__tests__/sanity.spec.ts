import { describe, expect, test } from 'bun:test';

describe('@sonar/shared', () => {
  test('exports package successfully', async () => {
    const module = await import('../index');
    expect(module).toBeDefined();
  });
});
