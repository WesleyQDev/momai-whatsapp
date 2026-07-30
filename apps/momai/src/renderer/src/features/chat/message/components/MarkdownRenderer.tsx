import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'

interface MarkdownRendererProps {
  children: string
  components?: any
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(({
  children,
  components = {}
}) => {
  return (
    <div
      className={`prose prose-zinc dark:prose-invert max-w-none
                 prose-p:leading-[1.6] prose-p:text-[15px] prose-p:text-zinc-800 dark:prose-p:text-zinc-300 prose-p:!m-0 prose-p:!mb-1
                 prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0
                 prose-li:text-[15px] prose-li:text-zinc-800 dark:prose-li:text-zinc-300 prose-li:!my-0.5 prose-li:!p-0
                 prose-ul:!my-1 prose-ul:!pl-0 prose-ul:!ml-5 prose-ul:!list-outside prose-ul:!marker:text-zinc-400
                 prose-ol:!my-1 prose-ol:!pl-0 prose-ol:!ml-5 prose-ol:!list-outside prose-ol:!marker:text-zinc-400
                 prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100 prose-strong:font-bold
                 prose-h1:text-zinc-900 dark:prose-h1:text-zinc-100 prose-h1:font-bold prose-h1:!m-0 prose-h1:!mt-2 prose-h1:!mb-1 prose-h1:!text-[15px]
                 prose-h2:text-zinc-900 dark:prose-h2:text-zinc-100 prose-h2:font-bold prose-h2:!m-0 prose-h2:!mt-2 prose-h2:!mb-1 prose-h2:!text-[15px]
                 prose-h3:text-zinc-900 dark:prose-h3:text-zinc-100 prose-h3:font-bold prose-h3:!m-0 prose-h3:!mt-1 prose-h3:!mb-1 prose-h3:!text-[15px]
                 prose-h4:text-zinc-900 dark:prose-h4:text-zinc-100 prose-h4:font-bold prose-h4:!m-0 prose-h4:!mt-1 prose-h4:!mb-1 prose-h4:!text-[15px]
                 prose-hr:!my-4 prose-hr:border-zinc-200 dark:prose-hr:border-white/10
                 prose-a:text-blue-500 hover:prose-a:text-blue-600 dark:prose-a:text-blue-400`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ node, ...props }) => <CodeBlock {...props} />,
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="bg-zinc-100 dark:bg-white/10 text-red-500 dark:text-red-400 px-1.5 py-0.5 rounded-[4px] font-mono text-[13px] tracking-tight mx-0.5"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          },
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4 scrollbar-thin rounded-lg border border-border/20">
              <table className="min-w-full border-collapse overflow-hidden font-sans" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-zinc-50 dark:bg-white/5 border-b border-border/20" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th
              className="px-4 py-3 text-left text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td
              className="px-4 py-3 text-[14px] text-zinc-700 dark:text-zinc-300 border-b border-border/10 last:border-0"
              {...props}
            />
          ),
          tr: ({ node, ...props }) => (
            <tr
              className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02] transition-colors"
              {...props}
            />
          ),
          ...components
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})
