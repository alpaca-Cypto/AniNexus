from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class ModelRequestError(RuntimeError):
    pass


DEFAULT_ENDPOINTS = {
    "openai": "https://api.openai.com/v1",
    "google": "https://generativelanguage.googleapis.com/v1beta/openai",
    "deepseek": "https://api.deepseek.com/v1",
    "moonshot": "https://api.moonshot.cn/v1",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "zhipu": "https://open.bigmodel.cn/api/paas/v4",
    "minimax": "https://api.minimax.chat/v1",
    "yi": "https://api.lingyiwanwu.com/v1",
    "stepfun": "https://api.stepfun.com/v1",
    "ollama": "http://localhost:11434/v1",
    "groq": "https://api.groq.com/openai/v1",
    "perplexity": "https://api.perplexity.ai",
    "mistral": "https://api.mistral.ai/v1",
}


def resolve_api_url(provider: str, custom_endpoint: str | None, resource: str) -> str:
    if provider in {"anthropic", "azure"}:
        raise ModelRequestError(f"当前版本暂不支持 {provider} 的专用协议")
    endpoint = (custom_endpoint or DEFAULT_ENDPOINTS.get(provider, "")).strip().rstrip("/")
    if not endpoint:
        raise ModelRequestError(f"没有配置 {provider} 的接口地址")
    parsed = urlparse(endpoint)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
        raise ModelRequestError("模型接口地址无效")
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ModelRequestError("远程模型接口必须使用 HTTPS")
    if endpoint.endswith(f"/{resource}"):
        return endpoint
    return f"{endpoint}/{resource}"


def resolve_chat_url(provider: str, custom_endpoint: str | None) -> str:
    return resolve_api_url(provider, custom_endpoint, "chat/completions")


def check_model_connection(url: str, api_key: str) -> None:
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = Request(url, headers=headers)
    try:
        with urlopen(request, timeout=20) as response:  # noqa: S310 - validated URL
            if response.status >= 400:
                raise ModelRequestError(f"模型服务返回 {response.status}")
    except HTTPError as exc:
        raise ModelRequestError(f"模型服务返回 {exc.code}") from exc
    except (URLError, TimeoutError) as exc:
        raise ModelRequestError("暂时无法连接模型服务") from exc


def request_chat_completion(
    *,
    url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = Request(url, data=payload, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=90) as response:  # noqa: S310 - validated URL
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            detail = exc.read().decode("utf-8")[:500]
        except OSError:
            detail = ""
        raise ModelRequestError(
            f"模型服务返回 {exc.code}" + (f"：{detail}" if detail else "")
        ) from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ModelRequestError("暂时无法连接模型服务") from exc
    if not isinstance(result, dict):
        raise ModelRequestError("模型服务返回了无法识别的数据")
    return result
