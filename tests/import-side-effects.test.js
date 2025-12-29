import { jest } from '@jest/globals';

describe('import side effects', () => {
  test('importing src/index.js does not call loadConfig()', async () => {
    const loadConfig = jest.fn(() => {
      throw new Error('loadConfig should not be called on import');
    });

    jest.unstable_mockModule('../src/config.js', () => ({
      loadConfig
    }));

    await import(`../src/index.js?ts=${Date.now()}`);

    expect(loadConfig).not.toHaveBeenCalled();
  });
});

