import YAML from "yaml";
import { readTextFile, writeTextFile } from "./fs.js";

export async function readYamlFile(path: string): Promise<unknown> {
  const content = await readTextFile(path);
  return YAML.parse(content);
}

export async function writeYamlFile(path: string, value: unknown): Promise<void> {
  await writeTextFile(path, YAML.stringify(value));
}
