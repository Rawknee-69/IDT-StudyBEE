/**
 * Sanitize text by removing markdown formatting
 * Converts markdown to plain text while preserving readability
 */
export function sanitizeMarkdown(text: string): string {
  if (!text) return text;

  let sanitized = text;

  // Remove bold markers (**text** or __text__)
  sanitized = sanitized.replace(/\*\*(.+?)\*\*/g, '$1');
  sanitized = sanitized.replace(/__(.+?)__/g, '$1');

  // Remove italic markers (*text* or _text_)
  sanitized = sanitized.replace(/\*(.+?)\*/g, '$1');
  sanitized = sanitized.replace(/_(.+?)_/g, '$1');

  // Remove strikethrough (~~text~~)
  sanitized = sanitized.replace(/~~(.+?)~~/g, '$1');

  // Remove code blocks (```code```)
  sanitized = sanitized.replace(/```[\s\S]*?```/g, (match) => {
    // Extract just the code content without the backticks
    return match.replace(/```(\w+)?\n?/g, '').replace(/```/g, '');
  });

  // Remove inline code (`code`)
  sanitized = sanitized.replace(/`(.+?)`/g, '$1');

  // Convert headers to plain text with proper spacing
  sanitized = sanitized.replace(/^#{1,6}\s+(.+)$/gm, '$1\n');

  // Remove link syntax but keep the text [text](url) -> text
  sanitized = sanitized.replace(/\[(.+?)\]\(.+?\)/g, '$1');

  // Remove image syntax ![alt](url)
  sanitized = sanitized.replace(/!\[.*?\]\(.+?\)/g, '');

  // Remove bullet points and list markers
  sanitized = sanitized.replace(/^[\*\-\+]\s+/gm, '• ');
  sanitized = sanitized.replace(/^\d+\.\s+/gm, (match) => {
    const num = match.match(/\d+/);
    return num ? `${num[0]}. ` : '• ';
  });

  // Remove blockquote markers
  sanitized = sanitized.replace(/^>\s+/gm, '');

  // Remove horizontal rules
  sanitized = sanitized.replace(/^[-*_]{3,}$/gm, '');

  // Clean up excessive whitespace
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Sanitize user input to prevent injection or formatting issues
 */
export function sanitizeUserInput(text: string): string {
  if (!text) return text;

  // Trim whitespace
  let sanitized = text.trim();

  // Remove null bytes and control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Limit consecutive newlines to 2
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

  return sanitized;
}
