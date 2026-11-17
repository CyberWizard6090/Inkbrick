import type { ResolvedPaletteCommand as PaletteCommand } from './types';

function score(command: PaletteCommand, query: string): number {
  const title = command.title.toLowerCase();
  const words = [
    title,
    ...title.split(/\s+/),
    ...(command.keywords ?? []).map((keyword) => keyword.toLowerCase()),
    ...(command.group ? [command.group.toLowerCase()] : []),
    command.id.toLowerCase(),
  ];

  if (title.startsWith(query)) return 4;
  if (words.some((word) => word.startsWith(query))) return 3;
  if (title.includes(query)) return 2;
  if (words.some((word) => word.includes(query))) return 1;

  return 0;
}

/** Команды по запросу: сначала те, чьё название начинается с запроса, затем остальные совпадения; порядок внутри уровня сохраняется. */
export function filterCommands(
  commands: readonly PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const q = query.trim().toLowerCase();

  if (q === '') return [...commands];

  return commands
    .map((command, index) => ({ command, index, score: score(command, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command);
}

/** Без запроса команды идут разделами в порядке появления раздела; с запросом — по релевантности, без разделов. */
export function groupCommands(commands: readonly PaletteCommand[]): PaletteCommand[] {
  const order: (string | undefined)[] = [];

  for (const command of commands) {
    if (!order.includes(command.group)) order.push(command.group);
  }

  // Команды без раздела стоят в конце.
  const keys = [
    ...order.filter((group) => group !== undefined),
    ...(order.includes(undefined) ? [undefined] : []),
  ];

  return keys.flatMap((group) => commands.filter((command) => command.group === group));
}
