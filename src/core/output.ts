import YAML from "yaml";

export function printYaml(value: unknown): void {
  process.stdout.write(YAML.stringify(value));
}
