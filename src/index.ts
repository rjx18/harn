#!/usr/bin/env node
import { createCli } from "./cli.js";

const cli = createCli();

await cli.parseAsync(process.argv);
