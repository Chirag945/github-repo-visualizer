"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Send, Bot, User, AlertCircle, Database } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { FileSummary } from "@/app/actions"

interface RepoChatProps {
  fileSummaries: Record<string, FileSummary>
  repoInfo: { owner: string; repo: string; branch: string } | null
  apiProvider: "groq" | "openai"
  apiKey: string
  fullHeight?: boolean
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

// Create a unique key for storing chat history in localStorage
const getChatStorageKey = (repoInfo: { owner: string; repo: string }) => {
  return `chat_history_${repoInfo.owner}_${repoInfo.repo}`
}

export default function RepoChat({ fileSummaries, repoInfo, apiProvider, apiKey, fullHeight = false }: RepoChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello! I can answer questions about this repository based on the available file summaries. What would you like to know?",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Count how many files and directories have summaries
  const summarizedFiles = Object.keys(fileSummaries).filter(
    (key) => key.includes(":file") || !key.includes(":directory"),
  ).length

  const summarizedDirectories = Object.keys(fileSummaries).filter((key) => key.includes(":directory")).length

  // Load chat history from localStorage when component mounts
  useEffect(() => {
    if (repoInfo) {
      const storageKey = getChatStorageKey(repoInfo)
      const storedMessages = localStorage.getItem(storageKey)

      if (storedMessages) {
        try {
          const parsedMessages = JSON.parse(storedMessages)
          // Convert string timestamps back to Date objects
          const messagesWithDateObjects = parsedMessages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }))
          setMessages(messagesWithDateObjects)
        } catch (error) {
          console.error("Error parsing stored chat messages:", error)
        }
      }
    }
  }, [repoInfo])

  // Save chat history to localStorage when messages change
  useEffect(() => {
    if (repoInfo && messages.length > 1) {
      // Only save if we have more than the initial message
      const storageKey = getChatStorageKey(repoInfo)
      localStorage.setItem(storageKey, JSON.stringify(messages))
    }
  }, [messages, repoInfo])

  // Scroll to bottom of messages when new messages are added
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    // Add user message
    const userMessage: ChatMessage = {
      role: "user",
      content: input,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setError(null)
    setIsLoading(true)

    try {
      // Check if we have an API key
      if (!apiKey) {
        throw new Error(`${apiProvider === "groq" ? "Groq" : "OpenAI"} API key is required to use the chat feature.`)
      }

      // Check if we have any summaries
      if (Object.keys(fileSummaries).length === 0) {
        throw new Error("No file summaries available. Please summarize some files first.")
      }

      // Prepare the summaries for the prompt
      const summariesText = Object.entries(fileSummaries)
        .map(([key, summary]) => {
          // Extract file/directory path from the key
          // Format: owner/repo:path:type
          const parts = key.split(":")
          const path = parts.slice(1, parts.length - 1).join(":")
          const type = parts[parts.length - 1]

          return `${type === "file" ? "File" : "Directory"}: ${path}\nSummary: ${summary.summary}\n`
        })
        .join("\n---\n\n")

      // Create the prompt
      const prompt = `You are an assistant that helps users understand a GitHub repository. 
You have access to summaries of files and directories from the repository ${repoInfo?.owner}/${repoInfo?.repo}.
Answer the user's question based ONLY on the information in these summaries.
If you cannot answer the question based on the available summaries, respond with EXACTLY:
"I'm unable to provide an answer for this based on the available summary data."

Here are the summaries:

${summariesText}

User question: ${input}`

      // Make API request to generate response
      const endpoint =
        apiProvider === "groq"
          ? "https://api.groq.com/openai/v1/chat/completions"
          : "https://api.openai.com/v1/chat/completions"

      const model = apiProvider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o"

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that answers questions about GitHub repositories based on file summaries.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.5,
          max_tokens: 1000,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || `Failed to generate response with ${apiProvider}`)
      }

      const data = await response.json()
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.choices[0].message.content,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      console.error("Error generating chat response:", err)
      setError(err instanceof Error ? err.message : "Failed to generate response")

      // Add error message as assistant message
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "I encountered an error while trying to process your request. Please try again later.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const clearChat = () => {
    if (repoInfo) {
      // Clear from localStorage
      const storageKey = getChatStorageKey(repoInfo)
      localStorage.removeItem(storageKey)

      // Reset to initial message
      setMessages([
        {
          role: "assistant",
          content:
            "Hello! I can answer questions about this repository based on the available file summaries. What would you like to know?",
          timestamp: new Date(),
        },
      ])
    }
  }

  return (
    <Card
      className={`overflow-hidden border-0 shadow-lg ${fullHeight ? "h-[calc(100vh-180px)]" : "h-[600px]"} dark:bg-gray-800/30 backdrop-blur-sm flex flex-col`}
    >
      <CardContent className="p-0 flex flex-col h-full">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h3 className="font-medium text-lg">Repository Chat</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Ask questions about the repository based on file summaries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 border-violet-200 dark:border-violet-800"
            >
              <Database className="h-3 w-3 mr-1" />
              {summarizedFiles} files
            </Badge>
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
            >
              <Database className="h-3 w-3 mr-1" />
              {summarizedDirectories} directories
            </Badge>
            {messages.length > 1 && (
              <Button variant="outline" size="sm" onClick={clearChat} className="text-xs ml-2">
                Clear Chat
              </Button>
            )}
          </div>
        </div>

        {Object.keys(fileSummaries).length === 0 && (
          <Alert className="m-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No file summaries available. Please summarize some files first to use the chat feature.
            </AlertDescription>
          </Alert>
        )}

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`flex max-w-[80%] ${
                    message.role === "user"
                      ? "bg-violet-100 dark:bg-violet-900/20 text-violet-900 dark:text-violet-100"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  } rounded-lg px-4 py-3`}
                >
                  <div className="mr-3 mt-0.5">
                    {message.role === "user" ? (
                      <User className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    ) : (
                      <Bot className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    )}
                  </div>
                  <div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                    <div className="text-xs mt-1 opacity-50">{message.timestamp.toLocaleTimeString()}</div>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-3">
                  <div className="mr-3 mt-0.5">
                    <Bot className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div className="flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Ask a question about the repository..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading || Object.keys(fileSummaries).length === 0}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim() || Object.keys(fileSummaries).length === 0}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          {error && <div className="mt-2 text-sm text-red-500 dark:text-red-400">{error}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
