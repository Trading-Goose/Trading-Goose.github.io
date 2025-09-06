import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  // Safety check for empty or invalid content
  if (!content || typeof content !== 'string') {
    return <div className={`text-muted-foreground text-base ${className}`}>No content available</div>;
  }

  try {
    return (
      <div className={`prose prose-base dark:prose-invert max-w-none ${className}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Custom styling for different elements
            h1: ({ children }) => (
              <h1 className="text-2xl font-black mb-4 text-foreground">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-extrabold mb-3 text-foreground">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-bold mb-2 text-foreground">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="text-base mb-3 text-foreground font-light leading-relaxed">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside mb-3 text-base space-y-1.5">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside mb-3 text-base space-y-1.5">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="text-foreground font-light">{children}</li>
            ),
            strong: ({ children }) => (
              <strong className="font-black text-foreground">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="italic font-extralight text-foreground">{children}</em>
            ),
            code: ({ children }) => (
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="bg-muted p-3 rounded-md overflow-x-auto mb-3">
                <code className="text-sm font-mono text-foreground">{children}</code>
              </pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-primary pl-4 py-2 bg-muted/50 rounded-r-md mb-3">
                <div className="text-base font-thin italic text-muted-foreground">{children}</div>
              </blockquote>
            ),
            // Table styling
            table: ({ children }) => (
              <div className="overflow-x-auto mb-3">
                <table className="min-w-full border-collapse border border-border text-sm">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-muted">{children}</thead>
            ),
            tbody: ({ children }) => (
              <tbody>{children}</tbody>
            ),
            tr: ({ children }) => (
              <tr className="border-b border-border">{children}</tr>
            ),
            th: ({ children }) => (
              <th className="border border-border px-2 py-1 text-left font-extrabold text-foreground">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-border px-2 py-1 font-light text-foreground">{children}</td>
            ),
            // Links
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline"
              >
                {children}
              </a>
            ),
            // Horizontal rule
            hr: () => (
              <hr className="border-border my-4" />
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  } catch (error) {
    console.error('Markdown rendering error:', error);
    // Fallback to plain text rendering
    return (
      <div className={`text-base whitespace-pre-wrap ${className}`}>
        {content}
      </div>
    );
  }
}