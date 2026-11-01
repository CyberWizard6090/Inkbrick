import { Engine, type EngineOptions } from './Engine';

export function createEngine(options: EngineOptions): Engine {
  return new Engine(options);
}
