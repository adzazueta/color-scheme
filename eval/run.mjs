// Like color-extractor's evaluation, use Vite's module runner for TypeScript and the @/ alias.
// Middleware mode, with HMR and WebSocket disabled, opens no listening port.
import { fileURLToPath } from "node:url";
import { createServer, isRunnableDevEnvironment } from "vite-plus";

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  logLevel: "warn",
  appType: "custom",
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const environment = server.environments.ssr;
  if (!isRunnableDevEnvironment(environment)) throw new Error("Cannot run evaluation modules.");
  const cli = await environment.runner.import(fileURLToPath(new URL("./cli.ts", import.meta.url)));
  process.exitCode = await cli.main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await server.close();
}
