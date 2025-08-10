import MarkdownRenderer from './MarkdownRenderer';

interface MessageRendererProps {
  content: string | any;  // Accept any type but prefer string
  className?: string;
}

export default function MessageRenderer({ content, className = '' }: MessageRendererProps) {
  // Safety check for empty or invalid content
  if (!content) {
    return <div className={`text-muted-foreground text-sm ${className}`}>No content available</div>;
  }
  
  // Convert non-string content to string
  let stringContent = content;
  if (typeof content !== 'string') {
    console.warn('MessageRenderer received non-string content:', typeof content, content);
    stringContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
  }

  // Use MarkdownRenderer for proper markdown formatting
  return <MarkdownRenderer content={stringContent} className={className} />;
}