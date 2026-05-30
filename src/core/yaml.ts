import YAML from "yaml";
import { readTextFile, writeTextFile } from "./fs.js";

export function parseYamlText(content: string): unknown {
  return YAML.parse(content);
}

export async function readYamlFile(path: string): Promise<unknown> {
  return parseYamlText(await readTextFile(path));
}

export async function writeYamlFile(path: string, value: unknown): Promise<void> {
  await writeTextFile(path, YAML.stringify(value));
}
