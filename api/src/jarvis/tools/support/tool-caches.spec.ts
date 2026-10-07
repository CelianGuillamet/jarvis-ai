import {
  getLastTodoList,
  setLastTodoList,
  withLocalToolCaches,
} from './tool-caches';
import * as toolsModule from '../tools';

describe('tool caches', () => {
  it('shares one cache instance between support modules and tools.ts', async () => {
    await withLocalToolCaches('shared', () => {
      setLastTodoList('shared', [{ id: 'a', text: 'x', done: false }]);
      expect(getLastTodoList('shared')).toEqual([
        { id: 'a', text: 'x', done: false },
      ]);
      toolsModule.clearLocalToolCaches('shared');
      expect(getLastTodoList('shared')).toEqual([]);
      return Promise.resolve();
    });
  });

  it('keeps the session list after the operation so #N refs work next turn', async () => {
    await withLocalToolCaches('ended', () => {
      setLastTodoList('ended', [{ id: 'b', text: 'y', done: false }]);
      return Promise.resolve();
    });
    expect(getLastTodoList('ended')).toEqual([
      { id: 'b', text: 'y', done: false },
    ]);
    toolsModule.clearLocalToolCaches('ended');
  });

  it('re-exports the public cache helpers from tools.ts', () => {
    expect(toolsModule.withLocalToolCaches).toBe(withLocalToolCaches);
  });
});
