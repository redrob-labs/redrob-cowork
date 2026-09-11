export type PathEnv = Record<string, string | undefined>;

export interface PathOptions {
  env?: PathEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
  userDataDir?: string;
}

export declare const MAX_CONFIG_ROOT_LENGTH: 4096;

export declare function normalizeWorkspaceRootPath(value: unknown, opts?: PathOptions): string;
export declare function redrobConfigDir(opts?: PathOptions): string;
export declare function redrobServerConfigPath(opts?: PathOptions): string;
export declare function redrobEnvStorePath(opts?: PathOptions): string;
export declare function globalEngineConfigDir(opts?: PathOptions): string;
export declare function resolveGlobalEngineConfigPath(opts?: PathOptions): string;
export declare function workspaceEngineConfigCandidates(workspaceRoot: string): string[];
export declare function resolveWorkspaceEngineConfigPath(workspaceRoot: string): string;
export declare function legacyWorkspaceConfigCandidates(workspaceRoot: string): string[];
export declare function legacyGlobalConfigCandidates(opts?: PathOptions): string[];
export declare function desktopBootstrapPath(opts?: PathOptions): string;
export declare function legacyDesktopBootstrapPath(opts?: PathOptions): string;
export declare function expandHomePath(value: string, opts?: PathOptions): string;
export declare function redrobServerDataDir(opts?: PathOptions): string;
export declare function opencodeDataDirs(opts?: PathOptions): string[];
export declare function opencodeCacheDirs(opts?: PathOptions): string[];
