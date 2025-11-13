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

