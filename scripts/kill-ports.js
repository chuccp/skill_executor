const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const PORTS = [38592, 38593];

async function killPort(port) {
  const isWindows = process.platform === 'win32';
  try {
    if (isWindows) {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n').filter(line => line.includes('LISTENING'));
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          console.log(`Killing process ${pid} on port ${port}...`);
          try {
            await execAsync(`taskkill /F /PID ${pid}`);
            console.log(`Process ${pid} killed`);
          } catch (e) {
            console.log(`Failed to kill ${pid}`);
          }
        }
      }
    } else {
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(p => p);
      for (const pid of pids) {
        console.log(`Killing process ${pid} on port ${port}...`);
        try {
          await execAsync(`kill -9 ${pid}`);
          console.log(`Process ${pid} killed`);
        } catch (e) {
          console.log(`Failed to kill ${pid}`);
        }
      }
    }
  } catch (e) {
    // Port not in use, ignore
  }
}

async function main() {
  console.log('Checking and freeing ports...');
  for (const port of PORTS) {
    await killPort(port);
  }
  console.log('Ports ready.');
}

main().catch(console.error);