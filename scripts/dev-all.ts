import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const webui = join(root, 'webui');
const environment = { ...process.env, CONSTANTS_FILE: 'dev' };

const children: ChildProcess[] = [
    spawn('bun', ['--watch', 'src/index.ts'], {
        cwd: root,
        env: environment,
        stdio: 'inherit',
    }),
    spawn('bun', ['run', 'dev'], {
        cwd: webui,
        env: environment,
        stdio: 'inherit',
    }),
];

let stopping = false;
function stop(): void {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill();
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

function waitForExit(child: ChildProcess): Promise<number> {
    return new Promise((resolve) => {
        child.once('exit', (code) => resolve(code ?? 1));
    });
}

async function main(): Promise<void> {
    const exits = children.map(waitForExit);
    const firstExit = await Promise.race(exits);
    stop();
    await Promise.all(exits);
    process.exitCode = firstExit;
}

main().catch((error) => {
    stop();
    console.error(error);
    process.exitCode = 1;
});
