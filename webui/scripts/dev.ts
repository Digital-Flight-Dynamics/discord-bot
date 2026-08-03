import { watch } from 'node:fs';

const environment = {
    ...process.env,
    CONSTANTS_FILE: 'dev',
};

async function buildFrontend(canRetry = true): Promise<boolean> {
    const build = Bun.spawn(['bun', 'run', 'build'], {
        env: environment,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
    });
    const succeeded = (await build.exited) === 0;
    if (succeeded || !canRetry) return succeeded;

    console.warn('[dev] Frontend build failed; retrying once.');
    await Bun.sleep(250);
    return buildFrontend(false);
}

if (!(await buildFrontend())) process.exit(1);

const server = Bun.spawn(
    ['bun', '--env-file=../.env', '--env-file=.env', '--watch', 'src/server.ts'],
    {
        env: environment,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
    },
);

let buildTimer: Timer | undefined;
let building = false;
let rebuildQueued = false;

async function rebuild(): Promise<void> {
    if (building) {
        rebuildQueued = true;
        return;
    }

    building = true;
    await buildFrontend();
    building = false;

    if (rebuildQueued) {
        rebuildQueued = false;
        await rebuild();
    }
}

const sourceWatcher = watch('src', { recursive: true }, () => {
    clearTimeout(buildTimer);
    buildTimer = setTimeout(() => void rebuild(), 120);
});

function stop(): void {
    clearTimeout(buildTimer);
    sourceWatcher.close();
    server.kill();
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

const exitCode = await server.exited;
sourceWatcher.close();
process.exit(exitCode);
