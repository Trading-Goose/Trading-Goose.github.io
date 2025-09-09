import React from 'react';
import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface HelpButtonProps {
  content: string | React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
  iconSize?: number;
  delayDuration?: number;
  maxWidth?: string;
}

export function HelpButton({
  content,
  side = 'top',
  align = 'center',
  className,
  iconSize = 14,
  delayDuration = 200,
  maxWidth = '300px',
}: HelpButtonProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center justify-center rounded-full',
              'text-muted-foreground hover:text-foreground',
              'transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'disabled:pointer-events-none disabled:opacity-50',
              className
            )}
            onClick={(e) => e.preventDefault()}
          >
            <HelpCircle size={iconSize} />
            <span className="sr-only">Help</span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className={cn(
            'max-w-xs text-sm',
            'bg-popover text-popover-foreground',
            'border border-border'
          )}
          style={{ maxWidth }}
        >
          {typeof content === 'string' ? (
            <p className="text-xs leading-relaxed">{content}</p>
          ) : (
            content
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Compound component for more complex help content
interface HelpContentProps {
  title?: string;
  description: string;
  example?: string;
  tips?: string[];
  warning?: string;
}

export function HelpContent({
  title,
  description,
  example,
  tips,
  warning,
}: HelpContentProps) {
  return (
    <div className="space-y-2">
      {title && <h4 className="font-semibold text-sm">{title}</h4>}
      <p className="text-xs leading-relaxed">{description}</p>
      {example && (
        <div className="mt-2">
          <span className="text-xs font-medium">Example:</span>
          <code className="block mt-1 text-xs bg-muted px-2 py-1 rounded">
            {example}
          </code>
        </div>
      )}
      {tips && tips.length > 0 && (
        <div className="mt-2">
          <span className="text-xs font-medium">Tips:</span>
          <ul className="mt-1 space-y-1">
            {tips.map((tip, index) => (
              <li key={index} className="text-xs flex items-start">
                <span className="text-green-500 mr-1">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {warning && (
        <div className="mt-2 p-2 bg-destructive/10 rounded">
          <p className="text-xs text-destructive flex items-start">
            <span className="mr-1">⚠️</span>
            <span>{warning}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// Label with help button component for form fields
interface LabelWithHelpProps {
  label: string;
  helpContent: string | React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
}

export function LabelWithHelp({
  label,
  helpContent,
  htmlFor,
  required,
  className,
}: LabelWithHelpProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('flex items-center gap-1 text-sm font-medium', className)}
    >
      {label}
      {required && <span className="text-destructive">*</span>}
      <HelpButton content={helpContent} />
    </label>
  );
}