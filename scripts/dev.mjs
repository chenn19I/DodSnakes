import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

function launch(label, args) {
  const child = spawn(npmCmd, args, {
    stdio: 'inherit',
    shell: isWindows,
  });
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });
  return child;
}

console.log('Menyalakan server dan client DodSnake...');
const server = launch('server', ['run', 'dev', '--workspace=@doodle-dash/server']);
const client = launch('client', ['run', 'dev', '--workspace=@doodle-dash/client']);

function shutdown() {
  server.kill();
  client.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
