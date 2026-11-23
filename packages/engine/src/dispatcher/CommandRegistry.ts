import type { AnyCommand } from '../commands/Command';

/** Зарегистрированные команды по имени. */
export class CommandRegistry {
  private readonly commands = new Map<string, AnyCommand>();

  register(command: AnyCommand): void {
    this.commands.set(command.type, command);
  }

  unregister(type: string): void {
    this.commands.delete(type);
  }

  has(type: string): boolean {
    return this.commands.has(type);
  }

  get(type: string): AnyCommand | undefined {
    return this.commands.get(type);
  }
}
