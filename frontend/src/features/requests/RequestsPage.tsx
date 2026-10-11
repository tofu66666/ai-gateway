import { useState } from 'react'
import { Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export function RequestsPage() {
  const [team, setTeam] = useState('')
  const [project, setProject] = useState('')
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Requests</h1>
        <p className="text-muted-foreground">
          Send a request to an AI model and view its response.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Request</CardTitle>
          <CardDescription>
            Select a team, project and model, then enter your prompt.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Team</Label>
              <Select
                value={team}
                onValueChange={(value) => {
                  setTeam(value)
                  setProject('')
                  setModel('')
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="demo-team">Demo Team</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={project}
                onValueChange={(value) => {
                  setProject(value)
                  setModel('')
                }}
                disabled={!team}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="demo-project">
                    Demo Project
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Select
                value={model}
                onValueChange={setModel}
                disabled={!project}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="demo-model">
                    Demo Model
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Enter your prompt..."
              className="min-h-32"
            />
          </div>

          <div className="flex justify-end">
            <Button
              disabled={!team || !project || !model || !prompt.trim()}
            >
              <Send />
              Send Request
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Response</CardTitle>
          <CardDescription>
            The model response will appear here.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="min-h-32 rounded-md border p-4 text-sm text-muted-foreground">
            No response yet.
          </div>

          <div className="mt-4 flex justify-between text-sm text-muted-foreground">
            <span>Tokens: --</span>
            <span>Cost: --</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline">
          Request History
        </Button>
      </div>
    </div>
  )
}