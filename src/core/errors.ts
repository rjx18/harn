export class HarnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnError";
  }
}

export class ValidationError extends HarnError {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}
