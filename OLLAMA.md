# OLLAMA Local Environment Manual

An evironment for testing the gateway (`chat/completions`) with a local model.

## 1. Setup

```
Windows
 └─ Ollama (model llama3.2:1b, port 11434)
      ▲
      │  http://host.docker.internal:11434
      │
Docker Desktop
 └─ backend container (FastAPI, gateway)
      ▲
      │  http://localhost:8000
      │
WSL terminal (curl, pytest, git)
```

- I'm assuming that Ollama is installed on **Windows** (We use Docker Desktop, where `host.docker.internal` points to the Windows host) 

- If Ollama runs on the host (not as a docker-compose service) and the backend is in Docker on Linux, Ollama must listen on `0.0.0.0` (`OLLAMA_HOST=0.0.0.0`), not the default `127.0.0.1`, because the container reaches the host through the Docker bridge, not through loopback. Ollama has no authentication, so do not expose port 11434 publicly.

- The gateways's provider settings are the `ollama` entry in `app/providers.py` and the address is read from `OLLAMA_BASE_URL` in `.env`. No key is needed and the timeout is 180 seconds to wait the model loaded into memory.

## 2. Install and configuration

- Install using installer from ollama.com/download
- Download the model. For example: `ollama pull llama3.2:1b` (1.3GB) 
- Windows user environment variable: `OLLAMA_HOST`=`0.0.0.0`
- `.env` in the project root `OLLAMA_BASE_URL=http://host.docker.internal:11434` for docker environment (Win-WSL). For server with same OS environment, `OLLAMA_BASE_URL=http://ollama:11434/`
- DB example: alias `llama-local` in `models` (provider `ollama`, model `llama3.2:1b`, price 0), linked to the test project's `model_ids`

After change `.env`, the container must be recreated for the change to take effect: 
```
docker compose up -d --force-recreate backend
```

## 3. Checks

### 3.1. Check that ollama is open to the container (PowerShell)
```
netstat -ano | findstr :11434
```

| Output | Meaning |
|---|---|
| `0.0.0.0:11434` or `[::]:11434` LISTENING | Open, Correctly configured |
| `127.0.0.1:11434` LISTENING | Open only insider Windows. The container cannot connect |
| Nothing | Ollama is not running. Start it from the Start menu |

### 3.2. Check the connection from the container (WSL)

```
docker compose exec backend printenv OLLAMA_BASE_URL
docker compose exec backend python -c "import urllib.request;print(urllib.request.urlopen('http://host.docker.internal:11434/api/tags').read()[:100])"
```

If you get JSON containing `llama3.2:1b`, it is working.

### 3.3. Call the gateway (WSL)

I am assuming that you have a virtual key, belongs to team and project which Ollama is allowed.

```
export VIRTUAL_KEY=<test virtual key>     # valid only in this terminal
curl -i localhost:8000/chat/completions \
  -H "Authorization: Bearer $VIRTUAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "llama-local", "messages": [{"role": "user", "content": "hi"}]}'
```

- Expected responses: `200`, an `X-request-id` header, and `"model"` in the body is `llama3.2:1b`, not the alias
- A virtual key can only use `llama-local` if the `model_ids` of the project the key belongs to include it.

### 3.4. Check the request log (Supabase SQL editor)

```sql
select id, model_id, key_id, input_tokens, output_tokens, cost, status, latency
from requests
where id = '<x-request-id header value>';
```

Observe that as the price is 0, `cost` is also 0. 




## 4. How to open Ollama to the container

The environment variable `OLLAMA_HOST=0.0.0.0` must be read when the ollama process starts (Observe that if you start the app from the Start menu, it sometimes does not pick up the new variabl, so it is better to start it yourself).

1) Check if ollama is not running. If it is running, quit completely
```
taskkill /F /IM "ollama app.exe"
taskkill /F /IM ollama.exe
netstat -ano | findstr :11434 # there shoul be no LISTENING line
```

2) Start the server with the variable set (keep this window open)
```
$env:OLLAMA_HOST="0.0.0.0"
ollama serve
```

3) Check from another PowerShell window
```
netstat -ano | findstr :11434        # should show 0.0.0.0 or [::]
```

Notes:
- When testing directly on Windows, use `127.0.0.1` rather than `localhost` (`localhost` may resolve to IPv6 and fail).

- In this environment the container connecte without a firewall rule. If you get a timeout, add one from an administrator PowerShell.

```
New-NetFirewallRule -DisplayName "Ollama" -Direction Inbound -Protocol TCP -LocalPort 11434 -Action Allow -Profile Private
```
After close the `ollama serve` window. If you created a firewall rule, run `Remove-NetFirewallRule -DisplayName "Ollama"` to remove the rule.

- **Because the Windows user environment variable `OLLAMA_HOST=0.0.0.0` is set, the tray app will also listen on all addresses after you log out or reboot.** To go back to local-only, delete the variable and restart Ollama.

```
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", $null, "User")
# Quit Ollama from the tray → start it again from the Start menu → in a new PowerShell
netstat -ano | findstr :11434        # should show 127.0.0.1
```

## 5. Command cheat sheet

```
# PowerShell (Windows)
ollama ls                              # downloaded models
ollama ps                              # models loaded in memory
ollama run llama3.2:1b "hi"            # local check
curl.exe http://127.0.0.1:11434/api/tags
netstat -ano | findstr :11434
tasklist | findstr /i ollama

# WSL
docker compose up -d --force-recreate backend
docker compose exec backend printenv OLLAMA_BASE_URL
docker compose logs backend
```