// Lists of file extensions that can and cannot be summarized
export const SUMMARIZABLE_EXTENSIONS = [
  ".py",
  ".js",
  ".ts",
  ".java",
  ".cpp",
  ".cc",
  ".cxx",
  ".c",
  ".cs",
  ".go",
  ".rb",
  ".php",
  ".dart",
  ".rs",
  ".kt",
  ".kts",
  ".swift",
  ".scala",
  ".m",
  ".mm",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".xml",
  ".json",
  ".yaml",
  ".yml",
  ".md",
  ".sh",
  ".bash",
  ".bat",
  ".ps1",
  ".toml",
  ".ini",
  ".cfg",
  ".env",
  ".make",
  "Makefile",
  "CMakeLists.txt",
  ".gradle",
  ".pom",
  ".tsconfig",
  ".eslintrc",
  ".prettierrc",
  ".babelrc",
]

export const NON_SUMMARIZABLE_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".mp3",
  ".wav",
  ".ogg",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".pyc",
  ".class",
  ".o",
  ".a",
  ".out",
  ".log",
  ".lock",
  ".gitignore",
  ".gitattributes",
  ".DS_Store",
  "Thumbs.db",
  "LICENSE",
  "COPYING",
  ".txt",
]

/**
 * Check if a file can be summarized based on its extension or name
 * @param fileName The name of the file to check
 * @returns boolean indicating if the file can be summarized
 */
export function canFileBeSummarized(fileName: string): boolean {
  // Handle special cases like "Makefile" that don't have extensions
  if (SUMMARIZABLE_EXTENSIONS.includes(fileName)) {
    return true
  }

  // Extract the file extension
  const extension = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : fileName

  // Check if the extension is in the summarizable list
  if (SUMMARIZABLE_EXTENSIONS.includes(extension)) {
    return true
  }

  // Check if the extension is in the non-summarizable list
  if (NON_SUMMARIZABLE_EXTENSIONS.includes(extension)) {
    return false
  }

  // For unknown extensions, default to not summarizable
  return false
}
