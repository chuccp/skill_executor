let workingDir = process.cwd();

export function getWorkingDir(): string {
  return workingDir;
}

export function setWorkingDir(dir: string): void {
  workingDir = dir;
}
