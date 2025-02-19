process.env.FORCE_COLOR = "0";

import LRU from "nanolru";
import { dirname } from "path";
import path from "path";
import type Prettier from "prettier";

const cacheParams = { max: 20, maxAge: 60000 };

const configCache = new LRU(cacheParams);

const importCache = new LRU(cacheParams);

async function resolveConfig(
  prettier: typeof Prettier,
  cwd: string,
  filepath: string
): Promise<Prettier.Options> {
  let v = configCache.get<string, Prettier.Options>(cwd);

  if (!v) {
    v = await prettier.resolveConfig(filepath, {
      editorconfig: true,
      useCache: false,
    });

    if (!v && process.env.PRETTIERD_DEFAULT_CONFIG) {
      console.log(process.env.PRETTIERD_DEFAULT_CONFIG);
      v = await prettier.resolveConfig(
        dirname(process.env.PRETTIERD_DEFAULT_CONFIG),
        {
          config: process.env.PRETTIERD_DEFAULT_CONFIG,
          editorconfig: true,
          useCache: false,
        }
      );
    }

    if (v) {
      configCache.set(cwd, v);
    }
  }

  return {
    ...v,
    filepath,
  };
}

async function resolvePrettier(cwd: string): Promise<typeof Prettier> {
  const cached = importCache.get<string, typeof Prettier>(cwd);
  if (cached) {
    return cached;
  }

  return import(require.resolve("prettier", { paths: [cwd] }))
    .catch(() => import("prettier"))
    .then((v) => {
      importCache.set(cwd, v);
      return v;
    });
}

function resolveFile(cwd: string, fileName: string): [string, string] {
  if (path.isAbsolute(fileName)) {
    return [fileName, fileName];
  }

  return [cwd, path.join(cwd, fileName)];
}

async function run(cwd: string, args: string[], text: string): Promise<string> {
  const fileName = args[0] === "--no-color" ? args[1] : args[0];
  const [cacheKey, fullPath] = resolveFile(cwd, fileName);
  const prettier = await resolvePrettier(cwd);
  const options = await resolveConfig(prettier, cacheKey, fullPath);

  return prettier.format(text, options);
}

export function invoke(
  cwd: string,
  args: string[],
  text: string,
  _mtime: number,
  cb: (_err?: string, _resp?: string) => void
): void {
  run(cwd, args, text)
    .then((resp) => void cb(undefined, resp))
    .catch((error) => void cb(error));
}
