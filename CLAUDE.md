Check the `docs/` subfolder for `llms.txt`-style and other docs for libraries you might need.

## MCP Servers

```
claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp --api-key <YOUR_CONTEXT7_API_KEY>
claude mcp add playwright -- npx @playwright/mcp --headless --caps vision
```

## Project `.claude/settings.json`

```json
{
    "env": {
        "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
    }
}
```
