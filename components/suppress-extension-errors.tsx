"use client"

import { useEffect } from "react"

export function SuppressExtensionErrors() {
  useEffect(() => {
    // Helper function to check if error should be suppressed
    const shouldSuppress = (message: string): boolean => {
      if (!message) return false
      const lowerMessage = message.toLowerCase()
      return (
        lowerMessage.includes("chrome.runtime.sendmessage") ||
        lowerMessage.includes("extension id") ||
        lowerMessage.includes("runtime.sendmessage() called from a webpage") ||
        lowerMessage.includes("error in invocation of runtime.sendmessage") ||
        lowerMessage.includes("typeerror: error in invocation of runtime.sendmessage") ||
        lowerMessage.includes("must specify an extension id") ||
        lowerMessage.includes("optional string extensionid") ||
        lowerMessage.includes("extensionid (string) for its first argument")
      )
    }

    // Suppress chrome.runtime.sendMessage errors from browser extensions (MetaMask, etc.)
    const originalError = console.error
    const originalWarn = console.warn
    
    console.error = (...args: any[]) => {
      // Check all arguments for the error message
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg
        if (arg?.message) return arg.message
        if (arg?.toString) return arg.toString()
        return String(arg)
      }).join(' ')

      if (shouldSuppress(message)) {
        // Suppress this specific error - it's harmless and comes from browser extensions
        return
      }
      originalError.apply(console, args)
    }

    console.warn = (...args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg
        if (arg?.message) return arg.message
        if (arg?.toString) return arg.toString()
        return String(arg)
      }).join(' ')

      if (shouldSuppress(message)) {
        return
      }
      originalWarn.apply(console, args)
    }

    // Catch unhandled errors
    const handleError = (event: ErrorEvent) => {
      const errorMessage = event.message?.toString() || event.error?.toString() || ""
      if (shouldSuppress(errorMessage)) {
        event.preventDefault()
        event.stopPropagation()
        return false
      }
    }

    // Catch unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason?.toString() || event.reason?.message || ""
      if (shouldSuppress(message)) {
        event.preventDefault()
        event.stopPropagation()
        return false
      }
    }

    // Override window.onerror as well
    const originalOnError = window.onerror
    window.onerror = (message, source, lineno, colno, error) => {
      const errorMessage = message?.toString() || error?.message || error?.toString() || ""
      if (shouldSuppress(errorMessage)) {
        return true // Prevent default error handling
      }
      if (originalOnError) {
        return originalOnError.call(window, message, source, lineno, colno, error)
      }
      return false
    }

    window.addEventListener("error", handleError, true)
    window.addEventListener("unhandledrejection", handleRejection)

    return () => {
      console.error = originalError
      console.warn = originalWarn
      window.onerror = originalOnError
      window.removeEventListener("error", handleError, true)
      window.removeEventListener("unhandledrejection", handleRejection)
    }
  }, [])

  return null
}

