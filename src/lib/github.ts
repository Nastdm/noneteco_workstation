import type { GitHubConfig } from '../types';

const STORAGE_KEY = 'noneteco_github_config_v1';

export const DEFAULT_GITHUB_CONFIG: GitHubConfig = {
  owner: 'Nastdm',
  repo: 'noneteco_workstation',
  branch: 'main',
  token: '',
};

export function loadGitHubConfig(): GitHubConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GITHUB_CONFIG };
    const parsed = JSON.parse(raw) as Partial<GitHubConfig>;
    return {
      owner: parsed.owner || DEFAULT_GITHUB_CONFIG.owner,
      repo: parsed.repo || DEFAULT_GITHUB_CONFIG.repo,
      branch: parsed.branch || DEFAULT_GITHUB_CONFIG.branch,
      token: parsed.token || '',
    };
  } catch {
    return { ...DEFAULT_GITHUB_CONFIG };
  }
}

export function saveGitHubConfig(config: GitHubConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

async function ghFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { message?: string }).message || `GitHub API error (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function verifyGitHubAccess(config: GitHubConfig): Promise<{ canPush: boolean; defaultBranch: string }> {
  if (!config.token.trim()) throw new Error('Token is required');
  const repoInfo = await ghFetch<{ default_branch: string; permissions?: { push?: boolean } }>(
    `https://api.github.com/repos/${config.owner}/${config.repo}`,
    config.token.trim(),
  );
  return {
    canPush: Boolean(repoInfo.permissions?.push ?? true),
    defaultBranch: repoInfo.default_branch || 'main',
  };
}

export async function publishToGitHub(
  config: GitHubConfig,
  upsertFiles: Array<{ path: string; content: string }>,
  deletePaths: string[],
  commitMessage = 'Update Noneteco library tools and bundles',
): Promise<{ commitSha: string; commitUrl: string }> {
  const token = config.token.trim();
  if (!token) throw new Error('GitHub token is missing');

  const apiBase = `https://api.github.com/repos/${config.owner}/${config.repo}`;

  const ref = await ghFetch<{ object: { sha: string } }>(
    `${apiBase}/git/ref/heads/${encodeURIComponent(config.branch)}`,
    token,
  );
  const headSha = ref.object.sha;

  const headCommit = await ghFetch<{ tree: { sha: string } }>(
    `${apiBase}/git/commits/${headSha}`,
    token,
  );
  const baseTreeSha = headCommit.tree.sha;

  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];

  for (const file of upsertFiles) {
    const blob = await ghFetch<{ sha: string }>(`${apiBase}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({
        content: file.content,
        encoding: 'utf-8',
      }),
    });
    treeEntries.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  for (const delPath of deletePaths) {
    treeEntries.push({
      path: delPath,
      mode: '100644',
      type: 'blob',
      sha: null,
    });
  }

  const newTree = await ghFetch<{ sha: string }>(`${apiBase}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeEntries,
    }),
  });

  const newCommit = await ghFetch<{ sha: string; html_url: string }>(`${apiBase}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({
      message: commitMessage,
      tree: newTree.sha,
      parents: [headSha],
    }),
  });

  await ghFetch(`${apiBase}/git/refs/heads/${encodeURIComponent(config.branch)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      sha: newCommit.sha,
    }),
  });

  return {
    commitSha: newCommit.sha,
    commitUrl: newCommit.html_url,
  };
}
