export type Language = 'ru' | 'en';

export type RuntimeMode = 'server' | 'static';

export type CefrLevel = 'All' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type ToolAccent = 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';

export interface EncryptedPayload {
  v: 1;
  alg: 'PBKDF2-AES-256-GCM';
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  data: string; // base64 (ciphertext || 16-byte authTag)
}

export interface ToolRecord {
  id: string;
  title: string;
  description: string;
  fileName: string;
  tags: string[];
  level: CefrLevel;
  accent: ToolAccent;
  protected: boolean;
  passwordHint?: string;
  blobPath?: string;
  source?: 'server' | 'static' | 'local' | 'drop';
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface BundleRecord {
  id: string;
  title: string;
  description: string;
  welcomeNote?: string;
  toolIds: string[];
  tags: string[];
  accent: ToolAccent;
  protected: boolean;
  passwordHint?: string;
  passwordVerify?: EncryptedPayload;
  createdAt: string;
  updatedAt: string;
  source?: 'server' | 'static' | 'local';
}

export interface CatalogData {
  version: 1;
  tools: ToolRecord[];
  bundles: BundleRecord[];
}

export interface SharePayloadTool {
  id: string;
  title: string;
  description: string;
  fileName: string;
  tags: string[];
  level: CefrLevel;
  accent: ToolAccent;
  protected: boolean;
  passwordHint?: string;
  html?: string;
  encrypted?: EncryptedPayload;
}

export interface SharePayloadPlain {
  v: 1;
  bundle: {
    id: string;
    title: string;
    description: string;
    welcomeNote?: string;
    accent: ToolAccent;
    tags: string[];
    createdAt: string;
    isSingleTool?: boolean;
  };
  tools: SharePayloadTool[];
}

export interface ShareEnvelope {
  v: 1;
  protected: boolean;
  title: string;
  passwordHint?: string;
  plain?: SharePayloadPlain;
  encrypted?: EncryptedPayload;
}

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}
