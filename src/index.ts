#!/usr/bin/env node
import { createCli } from "./cli.js";
import { HarnError, ValidationError } from "./core/errors.js";

const cli = createCli();

try {
  await cli.parseAsync(process.argv);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(error.message);
    for (const issue of error.issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
  } else if (error instanceof HarnError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
