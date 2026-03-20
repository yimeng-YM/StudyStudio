import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Cleans a string that contains JSON, removing markdown code blocks and comments
 * to increase tolerance for AI generated JSON.
 */
export function cleanAIJson(jsonString: string): string {
  // Remove markdown JSON code blocks
  let clean = jsonString.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
  const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    clean = match[1].trim();
  } else {
    clean = clean.replace(/```json/gi, '').replace(/```/g, '').trim();
  }

  // Remove single line (//) and multi-line (/* */) comments
  // This regex carefully avoids removing // or /* inside string literals
  clean = clean.replace(/\\.|"(?:\\.|[^"\\])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g1) => {
    if (g1) return ""; // It's a comment, remove it
    return m; // It's a string literal or something else, keep it
  });

  return clean.trim();
}

/**
 * Parses an AI generated JSON string safely, removing comments and markdown.
 */
export function parseAIJson<T = any>(jsonString: string): T {
  try {
    const clean = cleanAIJson(jsonString);
    return JSON.parse(clean);
  } catch (e) {
    throw new Error("Invalid AI JSON: " + (e instanceof Error ? e.message : String(e)));
  }
}
