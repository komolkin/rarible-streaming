import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate a deterministic gradient from a seed string (wallet address, username, etc.)
 * Returns CSS gradient string and individual colors
 */
export function generateGradient(seed: string): { gradient: string; color1: string; color2: string } {
  // Simple hash function to convert string to number
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash // Convert to 32-bit integer
  }

  // Generate two colors from the hash
  const hue1 = Math.abs(hash) % 360
  const hue2 = (hue1 + 60) % 360 // Complementary color
  
  // Use vibrant colors with good saturation and lightness
  const saturation = 70 + (Math.abs(hash) % 20) // 70-90%
  const lightness1 = 50 + (Math.abs(hash >> 8) % 20) // 50-70%
  const lightness2 = 40 + (Math.abs(hash >> 16) % 20) // 40-60%

  const color1 = `hsl(${hue1}, ${saturation}%, ${lightness1}%)`
  const color2 = `hsl(${hue2}, ${saturation}%, ${lightness2}%)`
  
  // Create gradient with angle based on hash
  const angle = Math.abs(hash >> 24) % 360
  const gradient = `linear-gradient(${angle}deg, ${color1}, ${color2})`

  return { gradient, color1, color2 }
}

/**
 * Get gradient style for an avatar based on seed
 */
export function getAvatarGradient(seed: string): { background: string } {
  const { gradient } = generateGradient(seed)
  return {
    background: gradient,
  }
}

/**
 * Format a date as relative time (e.g., "1 hour ago", "2 minutes ago")
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return ""
  
  const now = new Date()
  const past = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000)
  
  if (diffInSeconds < 0) {
    return "just now"
  }
  
  if (diffInSeconds < 60) {
    return diffInSeconds === 1 ? "1 second ago" : `${diffInSeconds} seconds ago`
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return diffInMinutes === 1 ? "1 minute ago" : `${diffInMinutes} minutes ago`
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return diffInHours === 1 ? "1 hour ago" : `${diffInHours} hours ago`
  }
  
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 30) {
    return diffInDays === 1 ? "1 day ago" : `${diffInDays} days ago`
  }
  
  const diffInMonths = Math.floor(diffInDays / 30)
  if (diffInMonths < 12) {
    return diffInMonths === 1 ? "1 month ago" : `${diffInMonths} months ago`
  }
  
  const diffInYears = Math.floor(diffInMonths / 12)
  return diffInYears === 1 ? "1 year ago" : `${diffInYears} years ago`
}

