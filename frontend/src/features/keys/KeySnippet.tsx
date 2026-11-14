import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// The gateway answers the OpenAI API under /api/v1 on this site, so any
// OpenAI client can use a virtual key (client meeting, Mon 19 Oct 2026:
// connection details for code).
function gatewayBaseUrl() {
  return `${window.location.origin}/api/v1`
}

function examples(apiKey: string, model: string) {
  const baseUrl = gatewayBaseUrl()
  return {
    python: `# pip install openai
from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${apiKey}",
)
reply = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(reply.choices[0].message.content)`,
    curl: `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Hello"}]}'`,
  }
}

const languages = [
  ['python', 'Python'],
  ['curl', 'curl'],
] as const

// A short example that calls a model with a key, in Python and curl.
export function KeySnippet({
  apiKey,
  model,
}: {
  apiKey: string
  model: string
}) {
  const code = examples(apiKey, model)

  function copy(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Code copied'))
      .catch(() => toast.error("Couldn't copy. Select the code and copy it."))
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Any OpenAI-compatible library works with this base URL:
      </p>
      <code className="block font-mono text-xs break-all">
        {gatewayBaseUrl()}
      </code>
      <Tabs defaultValue="python">
        <TabsList>
          {languages.map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {languages.map(([value, label]) => (
          <TabsContent key={value} value={value} className="relative">
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 pr-10 font-mono text-xs">
              {code[value]}
            </pre>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Copy the ${label} example`}
              className="absolute top-1 right-1"
              onClick={() => copy(code[value])}
            >
              <Copy />
            </Button>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
