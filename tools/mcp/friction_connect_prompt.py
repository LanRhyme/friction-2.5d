#!/usr/bin/env python3
"""
Friction 2.5D AI Connection Helper
-----------------------------------
运行此脚本，自动生成一段可以直接粘贴给任意 AI 的连接提示词（含当前场景实时状态）

用法：python3 tools/mcp/friction_connect_prompt.py [--token <令牌>] [--copy]
     令牌也可用环境变量 FRICTION_MCP_TOKEN 提供（设置 → AI Agent → 访问令牌 中查看）
     --copy 自动复制到剪贴板
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

MCP_URL = "http://127.0.0.1:9527/mcp"
PROMPT_FILE = Path(__file__).parent / "FRICTION_AI_CONNECT.md"


def get_token():
    for i, a in enumerate(sys.argv):
        if a == "--token" and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return os.environ.get("FRICTION_MCP_TOKEN", "")


TOKEN = get_token()


def call_tool(name, args=None):
    payload = {
        "jsonrpc": "2.0", "id": 1,
        "method": "tools/call",
        "params": {"name": name, "arguments": args or {}}
    }
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["X-Friction-Token"] = TOKEN
    req = urllib.request.Request(MCP_URL, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        return {"error": str(e)}


def get_scene_status():
    resp = call_tool("friction_get_scene_info")
    if "error" in resp:
        return {}
    # Result can be a direct dict, or wrapped in content[].text
    result = resp.get("result", {})
    if isinstance(result, dict):
        # Direct flat dict from our eval_script approach
        if "width" in result:
            return result
        # Nested in content[].text
        content = result.get("content", [])
        if content and isinstance(content, list):
            try:
                text = content[0].get("text", "{}")
                return json.loads(text)
            except Exception:
                pass
        # Maybe result itself has the data nested
        if "data" in result:
            return result["data"]
    return {}


def main():
    copy_mode = "--copy" in sys.argv

    # Check if Friction is running
    scene = get_scene_status()

    base_prompt = PROMPT_FILE.read_text(encoding="utf-8")

    if scene:
        status_block = f"""
---

## 当前场景实时状态（已自动获取）

| 属性 | 值 |
|:---|:---|
| 分辨率 | {scene.get('width', '?')} × {scene.get('height', '?')} px |
| 帧率 | {scene.get('fps', '?')} FPS |
| 时长 | {scene.get('duration', '?')} 秒（共 {scene.get('totalFrames', '?')} 帧）|
| 当前帧 | {scene.get('currentFrame', '?')} 帧（{scene.get('currentTime', '?')} 秒）|
| 图层数 | {scene.get('numLayers', '?')} |

Friction 正在运行，可以直接开始操作
"""
    else:
        status_block = ""

    full_prompt = base_prompt + status_block

    if copy_mode:
        copied = False
        try:
            import subprocess
            if sys.platform == "win32":
                # clip.exe expects the locale encoding-safe bytes; utf-8
                # with a BOM-less pipe is usually fine for AI consumption
                proc = subprocess.Popen(["clip"], stdin=subprocess.PIPE)
                proc.communicate(input=full_prompt.encode("utf-8", errors="replace"))
                copied = True
            else:
                subprocess.run(["wl-copy"], input=full_prompt.encode("utf-8"), check=True)
                copied = True
        except Exception:
            try:
                import subprocess
                proc = subprocess.Popen(["xclip", "-selection", "clipboard"],
                                        stdin=subprocess.PIPE)
                proc.communicate(input=full_prompt.encode("utf-8"))
                copied = True
            except Exception as e:
                print(f"复制失败: {e}")
        if copied:
            print("已复制到剪贴板")
        else:
            print("---\n" + full_prompt)
    else:
        print(full_prompt)

    if scene:
        print(f"\n✓ Friction 已连接 | 场景: {scene.get('width')}×{scene.get('height')} @ {scene.get('fps')}fps | {scene.get('numLayers')} 图层",
              file=sys.stderr)


if __name__ == "__main__":
    main()
