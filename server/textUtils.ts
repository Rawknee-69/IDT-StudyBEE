
export function sanitizeMarkdown(text: string): string {
  if (!text) return text;

  let sanitized = text;

  
  sanitized = sanitized.replace(/\*\*(.+?)\*\*/g, '$1');
  sanitized = sanitized.replace(/__(.+?)__/g, '$1');

  
  sanitized = sanitized.replace(/\*(.+?)\*/g, '$1');
  sanitized = sanitized.replace(/_(.+?)_/g, '$1');

  
  sanitized = sanitized.replace(/~~(.+?)~~/g, '$1');

  
  sanitized = sanitized.replace(/```[\s\S]*?```/g, (match) => {
    
    return match.replace(/```(\w+)?\n?/g, '').replace(/```/g, '');
  });

  
  sanitized = sanitized.replace(/`(.+?)`/g, '$1');

  
  sanitized = sanitized.replace(/^#{1,6}\s+(.+)$/gm, '$1\n');

  
  sanitized = sanitized.replace(/\[(.+?)\]\(.+?\)/g, '$1');

  
  sanitized = sanitized.replace(/!\[.*?\]\(.+?\)/g, '');

  
  sanitized = sanitized.replace(/^[\*\-\+]\s+/gm, '• ');
  sanitized = sanitized.replace(/^\d+\.\s+/gm, (match) => {
    const num = match.match(/\d+/);
    return num ? `${num[0]}. ` : '• ';
  });

  
  sanitized = sanitized.replace(/^>\s+/gm, '');

  
  sanitized = sanitized.replace(/^[-*_]{3,}$/gm, '');

  
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  sanitized = sanitized.trim();

  return sanitized;
}


export function sanitizeUserInput(text: string): string {
  if (!text) return text;

  
  let sanitized = text.trim();

  
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

  return sanitized;
}


export function sanitizeForAudio(text: string): string {
  if (!text) return text;

  
  let sanitized = sanitizeMarkdown(text);

  
  sanitized = sanitized.replace(/∑/g, 'sum');
  sanitized = sanitized.replace(/∫/g, 'integral');
  sanitized = sanitized.replace(/∂/g, 'partial derivative');
  sanitized = sanitized.replace(/∆/g, 'delta');
  sanitized = sanitized.replace(/π/g, 'pi');
  sanitized = sanitized.replace(/α/g, 'alpha');
  sanitized = sanitized.replace(/β/g, 'beta');
  sanitized = sanitized.replace(/γ/g, 'gamma');
  sanitized = sanitized.replace(/θ/g, 'theta');
  sanitized = sanitized.replace(/λ/g, 'lambda');
  sanitized = sanitized.replace(/μ/g, 'mu');
  sanitized = sanitized.replace(/σ/g, 'sigma');
  sanitized = sanitized.replace(/ω/g, 'omega');
  sanitized = sanitized.replace(/Σ/g, 'Sigma');
  sanitized = sanitized.replace(/Ω/g, 'Omega');
  
  
  sanitized = sanitized.replace(/≈/g, 'approximately equals');
  sanitized = sanitized.replace(/≠/g, 'not equals');
  sanitized = sanitized.replace(/≤/g, 'less than or equal to');
  sanitized = sanitized.replace(/≥/g, 'greater than or equal to');
  sanitized = sanitized.replace(/×/g, 'times');
  sanitized = sanitized.replace(/÷/g, 'divided by');
  sanitized = sanitized.replace(/±/g, 'plus or minus');
  sanitized = sanitized.replace(/√/g, 'square root of');
  sanitized = sanitized.replace(/∞/g, 'infinity');
  
  
  sanitized = sanitized.replace(/°/g, ' degrees');
  sanitized = sanitized.replace(/©/g, 'copyright');
  sanitized = sanitized.replace(/®/g, 'registered');
  sanitized = sanitized.replace(/™/g, 'trademark');
  sanitized = sanitized.replace(/€/g, 'euros');
  sanitized = sanitized.replace(/£/g, 'pounds');
  sanitized = sanitized.replace(/¥/g, 'yen');
  
  
  sanitized = sanitized.replace(/[^\w\s.,!?;:()\-'"]/g, ' ');
  
  // Clean up excessive whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  sanitized = sanitized.trim();

  return sanitized;
}


export function sanitizeMindMapNode(node: any): any {
  if (!node) return node;
  return {
    ...node,
    label: sanitizeMarkdown(node.label || ""),
    children: (node.children || []).map(sanitizeMindMapNode),
  };
}
