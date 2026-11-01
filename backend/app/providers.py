# Map each LLM provider
# Standard: OpenAI wire format
# Non-OpenAI-compatible providers: Get own translation function 
# Keep gateway.py decoulped
# H18IALMOND 21-streaming (Add class Openstream and open_stream(provider, endpoint, body))
import httpx
from fastapi import HTTPException

from app import config

DEFAULT_TIMEOUT=60
# provider name (`provider` column in the models table) -> how to call it.
# Add a provider with an openAI-compatible API here
# Decide later whether we create a separated PROVIDER file.
# stream_usage: Provider reports token usage in a stream (not sure for Anthropic=false)
# native_responses: Povider has its own /responses endpoint (Otheres are translated to /chat/complestions in gateway_logic_helper.py)
PROVIDERS={
    "google":{
        "base_url":lambda: "https://generativelanguage.googleapis.com/v1beta/openai",
        "api_key": lambda: config.GEMINI_API_KEY,
        # Use lambda to call at runtime, not import time
        "stream_usage": True,
        "native_response": False,
    },
    "openai":{
        "base_url":lambda: "https://api.openai.com/v1",
        "api_key": lambda: config.OPENAI_API_KEY,
        "stream_usage": True,
        "native_response": True,
    },
    "anthropic":{
        "base_url":lambda: "https://api.anthropic.com/v1",
        "api_key": lambda: config.ANTHROPIC_API_KEY,
        "stream_usage": False,
        "native_response": False,
    },
    "ollama":{
        "base_url":lambda: f"{config.OLLAMA_BASE_URL.rstrip('/')}/v1",
        "api_key": lambda: None, # a self-hosted Ollama does not need key
        "timeout": 180, # Take time fo load the model into memory in the first request
        "stream_usage": True, 
        "native_response": True,
    },
}

# Path on the provider

ENDPOINT_PATHS={
    # OpenAI-style: almost all openAI-compatible providers
    "chat":"/chat/completions", 
    # OpenAI, Gemini(openAI compatible), Anthropic(OpenAI compatible mode), Ollama
    
    "embeddings":"/embeddings", 
    # Provider that support embedding models: OpenAI, Gemini(openAI compatible), Ollama(model-dependant)
    
    "completions":"/completions", 
    # Legacy text completion (old prompt format)
    
    "responses":"/responses", 
    # OpenAI's new api: Only OpenAI and proxies that support it
    
    "messages":"/messages" 
    # Anthropic native messages API: https://api.anthropic.com or .../v1
}

# Verify whether the given provider support token usage during a streaming

def supp_stream_usage(provider:str)->bool:
    return bool(PROVIDERS.get(provider,{}).get("stream_usage"))

# Verify whether the given provider support the native response format

def supp_nat_response(provider:str)->bool:
    return bool(PROVIDERS.get(provider,{}).get("native_response"))

# Separate _prov_info from call_prov to use in streaming
def _prov_info(provider:str, endpoint: str)->tuple[str,dict,int]:
    cfg=PROVIDERS.get(provider)
    if cfg is None:
        raise HTTPException(501, f"Provider '{provider}' is not supported")
    path=ENDPOINT_PATHS[endpoint] 
    
    api_key=cfg["api_key"]()
    headers={"Authorization":f"Bearer {api_key}"} if api_key else{}
    
    return cfg["base_url"]()+path, headers, cfg.get("timeout", DEFAULT_TIMEOUT)
    
def call_prov(provider: str, endpoint:str, body: dict) -> httpx.Response:
    url, headers, timeout=_prov_info(provider, endpoint)
    
    return httpx.post(
        url,
        json=body,
        headers=headers,
        timeout=timeout,
    )    

# For streaming

class OpenStream:
    # Open streaming response from a provider. Don't forget to close() it.

    def __init__(self, client: httpx.Client, response: httpx.Response):
        self._client=client
        self._response=response
    
    @property
    def status_code(self)->int:
        return self._response.status_code

    def iter_lines(self):
        return self._response.iter_lines()

    def read(self)->bytes:
        # When the provider refuses before streaming
        return self._response.read()

    def close(self)->None:
        self._response.close()
        self._client.close()

def open_stream(provider:str, endpoint:str, body: dict)-> OpenStream:
    # Send the request and return as soon as the provider starts answering
    url, headers, timeout=_prov_info(provider, endpoint)
    client=httpx.Client(timeout=timeout)
    try:
        request=client.build_request("POST", url, json=body, headers=headers)
        response=client.send(request, stream=True)
    except BaseException:
        client.close()
        raise
    return OpenStream(client, response)