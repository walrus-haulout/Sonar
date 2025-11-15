import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DocContentProps {
  children: ReactNode;
  className?: string;
}

export function DocContent({ children, className }: DocContentProps) {
  return (
    <div className={cn('flex-1 px-8 py-12 overflow-y-auto', className)}>
      <article className="max-w-3xl prose-invert mx-auto space-y-6 text-sonar-highlight-bright">
        {children}
      </article>
    </div>
  );
}

interface DocHeadingProps {
  level?: 1 | 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}

export function DocHeading({ level = 1, children, className }: DocHeadingProps) {
  const sizes = {
    1: 'text-5xl',
    2: 'text-3xl',
    3: 'text-2xl',
    4: 'text-xl',
  };

  const Heading = `h${level}` as const;

  return (
    <Heading
      className={cn(
        'font-mono tracking-radar text-sonar-highlight mb-4',
        sizes[level],
        className
      )}
    >
      {children}
    </Heading>
  );
}

interface DocSectionProps {
  children: ReactNode;
  className?: string;
}

export function DocSection({ children, className }: DocSectionProps) {
  return <section className={cn('space-y-4', className)}>{children}</section>;
}

interface DocParagraphProps {
  children: ReactNode;
  className?: string;
}

export function DocParagraph({ children, className }: DocParagraphProps) {
  return <p className={cn('text-sonar-highlight-bright/80 leading-relaxed', className)}>{children}</p>;
}

interface DocListProps {
  children: ReactNode;
  ordered?: boolean;
  className?: string;
}

export function DocList({ children, ordered = false, className }: DocListProps) {
  const Component = ordered ? 'ol' : 'ul';
  return (
    <Component
      className={cn(
        'space-y-2 ml-6',
        ordered ? 'list-decimal' : 'list-disc',
        'text-sonar-highlight-bright/80',
        className
      )}
    >
      {children}
    </Component>
  );
}

interface DocListItemProps {
  children: ReactNode;
}

export function DocListItem({ children }: DocListItemProps) {
  return <li className="text-sonar-highlight-bright/80">{children}</li>;
}

interface DocCodeBlockProps {
  children: string;
  language?: string;
  className?: string;
}

export function DocCodeBlock({ children, language = 'text', className }: DocCodeBlockProps) {
  return (
    <pre
      className={cn(
        'bg-sonar-deep/30 border border-sonar-signal/20 rounded-lg p-4 overflow-x-auto',
        'font-mono text-sm text-sonar-highlight-bright',
        className
      )}
    >
      <code>{children}</code>
    </pre>
  );
}

interface DocInlineCodeProps {
  children: ReactNode;
  className?: string;
}

export function DocInlineCode({ children, className }: DocInlineCodeProps) {
  return (
    <code
      className={cn(
        'bg-sonar-deep/30 border border-sonar-signal/20 rounded px-2 py-1',
        'font-mono text-sm text-sonar-signal',
        className
      )}
    >
      {children}
    </code>
  );
}

interface DocTableProps {
  children: ReactNode;
  className?: string;
}

export function DocTable({ children, className }: DocTableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          'w-full border-collapse border border-sonar-signal/20',
          'text-sonar-highlight-bright/80 text-sm',
          className
        )}
      >
        {children}
      </table>
    </div>
  );
}

interface DocTableHeaderProps {
  children: ReactNode;
}

export function DocTableHeader({ children }: DocTableHeaderProps) {
  return (
    <thead className="bg-sonar-deep/40 border-b border-sonar-signal/20">
      {children}
    </thead>
  );
}

interface DocTableBodyProps {
  children: ReactNode;
}

export function DocTableBody({ children }: DocTableBodyProps) {
  return <tbody className="divide-y divide-sonar-signal/20">{children}</tbody>;
}

interface DocTableRowProps {
  children: ReactNode;
}

export function DocTableRow({ children }: DocTableRowProps) {
  return <tr>{children}</tr>;
}

interface DocTableCellProps {
  children: ReactNode;
  header?: boolean;
}

export function DocTableCell({ children, header = false }: DocTableCellProps) {
  const Component = header ? 'th' : 'td';
  return (
    <Component className={cn('border border-sonar-signal/20 px-4 py-2 text-left', header && 'font-mono text-sonar-highlight')}>
      {children}
    </Component>
  );
}

interface DocCardProps {
  children: ReactNode;
  variant?: 'default' | 'info' | 'warning' | 'success';
  className?: string;
}

export function DocCard({ children, variant = 'default', className }: DocCardProps) {
  const variants = {
    default: 'bg-sonar-deep/20 border-sonar-signal/20',
    info: 'bg-sonar-signal/10 border-sonar-signal/40',
    warning: 'bg-sonar-coral/10 border-sonar-coral/40',
    success: 'bg-green-500/10 border-green-500/40',
  };

  return (
    <div
      className={cn(
        'border rounded-lg p-4',
        'text-sonar-highlight-bright/80',
        variants[variant],
        className
      )}
    >
      {children}
    </div>
  );
}
