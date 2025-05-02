import { Redis } from "@upstash/redis"

// Initialize Redis client using environment variables
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
})

// Key format: summary:{owner}/{repo}:{path}:{type}
export function getSummaryKey(owner: string, repo: string, path: string, type: "file" | "directory"): string {
  return `summary:${owner}/${repo}:${path}:${type}`
}

// Key format: summarized-children:{owner}/{repo}:{path}
export function getSummarizedChildrenKey(owner: string, repo: string, path: string): string {
  return `summarized-children:${owner}/${repo}:${path}`
}
