export function notImplemented(commandName: string): never {
  throw new Error(`${commandName} is not implemented yet.`);
}
