"use server"

import { redis, getSummaryKey, getSummarizedChildrenKey } from "@/lib/redis"
// Add the import for the file utility
import { canFileBeSummarized } from "@/lib/file-utils"

// Type for file summary
export interface FileSummary {
  summary: string
  generatedAt: string
  provider: "groq" | "openai"
  fromCache?: boolean
}

// Cache for file summaries (in-memory cache as a backup)
const summaryCache: Record<string, FileSummary> = {}

// Update the summarizeFile function to add better error handling and logging

export async function summarizeFile(
  fileContent: string,
  fileName: string,
  apiKey: string,
  provider: "groq" | "openai" = "groq",
  owner?: string,
  repo?: string,
  path?: string,
  forceRefresh = false,
): Promise<FileSummary> {
  // Check if the file can be summarized based on its extension
  if (!canFileBeSummarized(fileName)) {
    throw new Error(`This file type cannot be summarized. Only code and text files are supported.`)
  }

  // Check if we have repository info for caching
  const canUseRedisCache = owner && repo && path

  // Check Redis cache first if we have repository info
  if (canUseRedisCache && !forceRefresh) {
    try {
      const cacheKey = getSummaryKey(owner, repo, path, "file")
      console.log(`Checking cache for key: ${cacheKey}`)
      const cachedSummary = await redis.get<FileSummary>(cacheKey)

      if (cachedSummary) {
        console.log(`Cache hit for ${cacheKey}`)
        return {
          ...cachedSummary,
          fromCache: true,
        }
      }
      console.log(`Cache miss for ${cacheKey}`)
    } catch (error) {
      console.error("Redis cache error:", error)
      // Continue with generation if cache fails
    }
  }

  // Check in-memory cache as fallback
  const memoryCacheKey = `${fileName}-${fileContent.length}`
  if (!forceRefresh && summaryCache[memoryCacheKey]) {
    console.log(`Memory cache hit for ${fileName}`)
    return {
      ...summaryCache[memoryCacheKey],
      fromCache: true,
    }
  }

  if (!apiKey) {
    throw new Error(`${provider === "groq" ? "Groq" : "OpenAI"} API key is required`)
  }

  try {
    let summaryText: string
    console.log(`Generating summary for ${fileName} using ${provider}`)

    if (provider === "groq") {
      // Use Groq API
      console.log("Making request to Groq API")
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that summarizes code files. Provide concise summaries focusing on the main purpose, key functions, and overall structure.",
            },
            {
              role: "user",
              content: `Please provide a concise summary of the following file named "${fileName}". Focus on the main purpose, key functions, and overall structure. Keep your summary under 200 words.

File content:
\`\`\`
${fileContent}
\`\`\``,
            },
          ],
          temperature: 0.5,
          max_tokens: 500,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Groq API error response: ${errorText}`)
        let errorMessage = "Failed to generate summary with Groq"

        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorMessage
        } catch (e) {
          // If JSON parsing fails, use the raw error text
          errorMessage = `Groq API error: ${errorText}`
        }

        throw new Error(errorMessage)
      }

      const data = await response.json()
      summaryText = data.choices[0].message.content
      console.log(`Groq summary generated successfully for ${fileName}`)
    } else {
      // Use OpenAI API
      console.log("Making request to OpenAI API")
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that summarizes code files. Provide concise summaries focusing on the main purpose, key functions, and overall structure.",
            },
            {
              role: "user",
              content: `Please provide a concise summary of the following file named "${fileName}". Focus on the main purpose, key functions, and overall structure. Keep your summary under 200 words.

File content:
\`\`\`
${fileContent}
\`\`\``,
            },
          ],
          temperature: 0.5,
          max_tokens: 500,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`OpenAI API error response: ${errorText}`)
        let errorMessage = "Failed to generate summary with OpenAI"

        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorMessage
        } catch (e) {
          // If JSON parsing fails, use the raw error text
          errorMessage = `OpenAI API error: ${errorText}`
        }

        throw new Error(errorMessage)
      }

      const data = await response.json()
      summaryText = data.choices[0].message.content
      console.log(`OpenAI summary generated successfully for ${fileName}`)
    }

    const summary: FileSummary = {
      summary: summaryText,
      generatedAt: new Date().toISOString(),
      provider: provider,
    }

    // Cache the summary in memory
    summaryCache[memoryCacheKey] = summary

    // Store in Redis cache if we have repository info
    if (canUseRedisCache) {
      try {
        const cacheKey = getSummaryKey(owner, repo, path, "file")
        console.log(`Storing summary in Redis cache with key: ${cacheKey}`)
        await redis.set(cacheKey, summary, { ex: 60 * 60 * 24 * 30 }) // 30 days expiration
      } catch (error) {
        console.error("Failed to store summary in Redis cache:", error)
      }
    }

    return summary
  } catch (error) {
    console.error("Error generating summary:", error)
    throw new Error(error instanceof Error ? error.message : "Failed to generate summary")
  }
}

// New function to summarize directories based on child summaries
export async function summarizeDirectory(
  directoryName: string,
  directoryPath: string,
  childSummaries: { name: string; path: string; type: string; summary: string }[],
  apiKey: string,
  provider: "groq" | "openai" = "groq",
  owner?: string,
  repo?: string,
  forceRefresh = false,
): Promise<FileSummary> {
  // Check if we have repository info for caching
  const canUseRedisCache = owner && repo && directoryPath

  // Check Redis cache first if we have repository info
  if (canUseRedisCache && !forceRefresh) {
    try {
      const cacheKey = getSummaryKey(owner, repo, directoryPath, "directory")
      const cachedSummary = await redis.get<FileSummary>(cacheKey)

      if (cachedSummary) {
        console.log(`Cache hit for ${cacheKey}`)

        // Also get the summarized children count
        const childrenCountKey = getSummarizedChildrenKey(owner, repo, directoryPath)
        const childrenCount = (await redis.get<number>(childrenCountKey)) || childSummaries.length

        return {
          ...cachedSummary,
          fromCache: true,
        }
      }
    } catch (error) {
      console.error("Redis cache error:", error)
      // Continue with generation if cache fails
    }
  }

  // Check if summary exists in memory cache
  const cacheKey = `dir-${directoryPath}-${childSummaries.length}`
  if (!forceRefresh && summaryCache[cacheKey]) {
    return {
      ...summaryCache[cacheKey],
      fromCache: true,
    }
  }

  if (!apiKey) {
    throw new Error(`${provider === "groq" ? "Groq" : "OpenAI"} API key is required`)
  }

  try {
    let summaryText: string

    // Format child summaries for the prompt
    const childSummariesText = childSummaries
      .map(
        (child) =>
          `${child.type === "file" ? "File" : "Directory"}: ${child.name}\nPath: ${child.path}\nSummary: ${child.summary}\n`,
      )
      .join("\n---\n\n")

    if (provider === "groq") {
      // Use Groq API
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that summarizes directories in code repositories. Provide concise summaries focusing on the main purpose and overall structure of the directory based on its contents.",
            },
            {
              role: "user",
              content: `Please provide a concise summary of the directory named "${directoryName}" at path "${directoryPath}". This summary should synthesize the information from the summaries of its contents listed below. Focus on the overall purpose of this directory, the main components it contains, and how they relate to each other. Keep your summary under 250 words.\n\nDirectory contents and their summaries:\n\n${childSummariesText}`,
            },
          ],
          temperature: 0.5,
          max_tokens: 600,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || "Failed to generate directory summary with Groq")
      }

      const data = await response.json()
      summaryText = data.choices[0].message.content
    } else {
      // Use OpenAI API
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that summarizes directories in code repositories. Provide concise summaries focusing on the main purpose and overall structure of the directory based on its contents.",
            },
            {
              role: "user",
              content: `Please provide a concise summary of the directory named "${directoryName}" at path "${directoryPath}". This summary should synthesize the information from the summaries of its contents listed below. Focus on the overall purpose of this directory, the main components it contains, and how they relate to each other. Keep your summary under 250 words.\n\nDirectory contents and their summaries:\n\n${childSummariesText}`,
            },
          ],
          temperature: 0.5,
          max_tokens: 600,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || "Failed to generate directory summary with OpenAI")
      }

      const data = await response.json()
      summaryText = data.choices[0].message.content
    }

    const summary: FileSummary = {
      summary: summaryText,
      generatedAt: new Date().toISOString(),
      provider: provider,
    }

    // Cache the summary in memory
    summaryCache[cacheKey] = summary

    // Store in Redis cache if we have repository info
    if (canUseRedisCache) {
      try {
        const summaryKey = getSummaryKey(owner, repo, directoryPath, "directory")
        await redis.set(summaryKey, summary, { ex: 60 * 60 * 24 * 30 }) // 30 days expiration

        // Also store the summarized children count
        const childrenCountKey = getSummarizedChildrenKey(owner, repo, directoryPath)
        await redis.set(childrenCountKey, childSummaries.length, { ex: 60 * 60 * 24 * 30 }) // 30 days expiration
      } catch (error) {
        console.error("Failed to store directory summary in Redis cache:", error)
      }
    }

    return summary
  } catch (error) {
    console.error("Error generating directory summary:", error)
    throw new Error(error instanceof Error ? error.message : "Failed to generate directory summary")
  }
}

// Function to fetch raw file content from GitHub
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  token?: string,
): Promise<string> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3.raw",
  }

  if (token) {
    headers["Authorization"] = `token ${token}`
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
    headers,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch file content: ${response.statusText}`)
  }

  return await response.text()
}

// New function to load all cached summaries for a repository
export async function loadCachedSummaries(owner: string, repo: string): Promise<Record<string, FileSummary>> {
  try {
    // Get all keys matching the pattern
    const keys = await redis.keys(`summary:${owner}/${repo}:*`)

    if (keys.length === 0) {
      return {}
    }

    // Get all values for these keys
    const values = await Promise.all(keys.map((key) => redis.get<FileSummary>(key)))

    // Create a map of path to summary
    const summaries: Record<string, FileSummary> = {}

    keys.forEach((key, index) => {
      const value = values[index]
      if (value) {
        // Extract the path from the key
        // Format: summary:{owner}/{repo}:{path}:{type}
        const parts = key.split(":")
        const type = parts[parts.length - 1] // Get the type (file or directory)
        const path = parts.slice(2, parts.length - 1).join(":") // Get the path without the type

        // Create a key that matches what's used in the component
        const summaryKey = `${owner}/${repo}:${path}`

        summaries[summaryKey] = {
          ...value,
          fromCache: true,
        }
      }
    })

    return summaries
  } catch (error) {
    console.error("Failed to load cached summaries:", error)
    return {}
  }
}

// New function to load summarized children counts
export async function loadSummarizedChildrenCounts(owner: string, repo: string): Promise<Record<string, number>> {
  try {
    // Get all keys matching the pattern
    const keys = await redis.keys(`summarized-children:${owner}/${repo}:*`)

    if (keys.length === 0) {
      return {}
    }

    // Get all values for these keys
    const values = await Promise.all(keys.map((key) => redis.get<number>(key)))

    // Create a map of path to count
    const counts: Record<string, number> = {}

    keys.forEach((key, index) => {
      const value = values[index]
      if (value !== null && value !== undefined) {
        // Extract the path from the key
        // Format: summarized-children:{owner}/{repo}:{path}
        const parts = key.split(":")
        const path = parts.slice(2).join(":")

        counts[`${owner}/${repo}:${path}`] = value
      }
    })

    return counts
  } catch (error) {
    console.error("Failed to load summarized children counts:", error)
    return {}
  }
}

// Add a new function to batch summarize files
export async function batchSummarizeFiles(
  files: { content: string; fileName: string; path: string }[],
  apiKey: string,
  provider: "groq" | "openai" = "groq",
  owner?: string,
  repo?: string,
  forceRefresh = false,
): Promise<Record<string, FileSummary>> {
  const results: Record<string, FileSummary> = {}

  for (const file of files) {
    try {
      // Check if the file can be summarized
      if (!canFileBeSummarized(file.fileName)) {
        console.warn(`File ${file.fileName} cannot be summarized. Skipping.`)
        continue
      }

      // Generate summary
      const summary = await summarizeFile(
        file.content,
        file.fileName,
        apiKey,
        provider,
        owner,
        repo,
        file.path,
        forceRefresh,
      )

      // Store result
      if (owner && repo) {
        results[`${owner}/${repo}:${file.path}`] = summary
      } else {
        results[file.path] = summary
      }
    } catch (error) {
      console.error(`Error summarizing file ${file.fileName}:`, error)
    }
  }

  return results
}

// Add a new function to batch summarize directories
export async function batchSummarizeDirectories(
  directories: {
    name: string
    path: string
    childSummaries: { name: string; path: string; type: string; summary: string }[]
  }[],
  apiKey: string,
  provider: "groq" | "openai" = "groq",
  owner?: string,
  repo?: string,
  forceRefresh = false,
): Promise<Record<string, FileSummary>> {
  const results: Record<string, FileSummary> = {}

  for (const dir of directories) {
    try {
      // Skip directories with no summarized children
      if (dir.childSummaries.length === 0) {
        console.warn(`Directory ${dir.path} has no summarized children. Skipping.`)
        continue
      }

      // Generate summary
      const summary = await summarizeDirectory(
        dir.name,
        dir.path,
        dir.childSummaries,
        apiKey,
        provider,
        owner,
        repo,
        forceRefresh,
      )

      // Store result
      if (owner && repo) {
        results[`${owner}/${repo}:${dir.path}`] = summary
      } else {
        results[dir.path] = summary
      }
    } catch (error) {
      console.error(`Error summarizing directory ${dir.path}:`, error)
    }
  }

  return results
}

// Add this new function at the end of the file
export async function deleteSummary(
  owner: string,
  repo: string,
  path: string,
  type: "file" | "directory",
): Promise<boolean> {
  try {
    const cacheKey = getSummaryKey(owner, repo, path, type)
    await redis.del(cacheKey)

    // If it's a directory, also delete the summarized children count
    if (type === "directory") {
      const childrenCountKey = getSummarizedChildrenKey(owner, repo, path)
      await redis.del(childrenCountKey)
    }

    return true
  } catch (error) {
    console.error(`Failed to delete summary for ${path}:`, error)
    return false
  }
}

// Add this new function to batch delete summaries
export async function batchDeleteSummaries(
  owner: string,
  repo: string,
  paths: { path: string; type: "file" | "directory" }[],
): Promise<boolean> {
  try {
    const promises = paths.map(({ path, type }) => deleteSummary(owner, repo, path, type))
    await Promise.all(promises)
    return true
  } catch (error) {
    console.error(`Failed to batch delete summaries:`, error)
    return false
  }
}
