#!/usr/bin/env bash
# DeepSeek Harness 纯本地相对路径沙盒快捷启动脚本 (Bash / WSL / macOS / Linux)
# 所有模型配置、密钥仓、会话与工作区均读写当前目录下的相对路径 (默认 ./.dsh-sandbox)，不读取 ~/.dsh 或 ~/.agents。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CALLER_CWD="$(pwd)"

MODE="web"
SANDBOX_DIR="./.dsh-sandbox"
WORKSPACE_DIR=""
PERMISSION_MODE="workspace-write"
BIND_HOST="127.0.0.1"
PORT="0"
NO_OPEN="0"
INIT_ONLY="0"
KEEP_ENV_KEYS="0"
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"; shift 2 ;;
    --sandbox-dir)
      SANDBOX_DIR="$2"; shift 2 ;;
    --workspace-dir)
      WORKSPACE_DIR="$2"; shift 2 ;;
    --permission-mode)
      PERMISSION_MODE="$2"; shift 2 ;;
    --host)
      BIND_HOST="$2"; shift 2 ;;
    --port)
      PORT="$2"; shift 2 ;;
    --no-open)
      NO_OPEN="1"; shift ;;
    --init-only)
      INIT_ONLY="1"; shift ;;
    --keep-process-api-keys)
      KEEP_ENV_KEYS="1"; shift ;;
    --)
      shift; EXTRA_ARGS+=("$@"); break ;;
    *)
      EXTRA_ARGS+=("$1"); shift ;;
  esac
done

if [[ "$SANDBOX_DIR" = /* ]]; then
  RESOLVED_SANDBOX="$SANDBOX_DIR"
else
  mkdir -p "$CALLER_CWD/$SANDBOX_DIR"
  RESOLVED_SANDBOX="$(cd "$CALLER_CWD/$SANDBOX_DIR" && pwd)"
fi

DSH_HOME_DIR="$RESOLVED_SANDBOX/home"
AGENTS_HOME_DIR="$RESOLVED_SANDBOX/agents"
DEFAULT_WS_DIR="$RESOLVED_SANDBOX/workspace"
ELECTRON_DATA_DIR="$RESOLVED_SANDBOX/electron-data"
TEMP_DIR="$RESOLVED_SANDBOX/tmp"

mkdir -p "$DSH_HOME_DIR" "$AGENTS_HOME_DIR/skills" "$DEFAULT_WS_DIR" "$ELECTRON_DATA_DIR" "$TEMP_DIR"

if [[ -z "$WORKSPACE_DIR" ]]; then
  RESOLVED_WORKSPACE="$DEFAULT_WS_DIR"
elif [[ "$WORKSPACE_DIR" = /* ]]; then
  mkdir -p "$WORKSPACE_DIR"
  RESOLVED_WORKSPACE="$(cd "$WORKSPACE_DIR" && pwd)"
else
  mkdir -p "$CALLER_CWD/$WORKSPACE_DIR"
  RESOLVED_WORKSPACE="$(cd "$CALLER_CWD/$WORKSPACE_DIR" && pwd)"
fi

ENV_FILE="$DSH_HOME_DIR/.env"
CRED_FILE="$DSH_HOME_DIR/.credentials.yaml"
PATCH_FILE="$DSH_HOME_DIR/cordis.patch.yml"
AGENTS_MD="$AGENTS_HOME_DIR/AGENTS.md"

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'EOF'
# DeepSeek Harness 本地沙盒环境变量与模型密钥配置（仅对当前沙盒目录生效）
# DEEPSEEK_API_KEY=sk-your-deepseek-key
# DEEPSEEK_BASE_URL=https://api.deepseek.com
# CUSTOM_LLM_API_KEY=sk-your-custom-gateway-key
# OPENAI_API_KEY=sk-your-openai-key
# ANTHROPIC_API_KEY=sk-ant-your-key
EOF
  chmod 600 "$ENV_FILE" 2>/dev/null || true
fi

if [[ ! -f "$CRED_FILE" ]]; then
  cat > "$CRED_FILE" <<'EOF'
# 本地沙盒受管凭据仓（界面「设置 -> 模型」保存的 API Key 也会写入此处）
version: 1
refs: {}
EOF
  chmod 600 "$CRED_FILE" 2>/dev/null || true
fi

if [[ ! -f "$PATCH_FILE" ]]; then
  cat > "$PATCH_FILE" <<'EOF'
# DeepSeek Harness 本地沙盒模型路由与默认模型配置（Cordis Patch）
# 保持 [] 时可直接通过 Web/Desktop「设置 -> 模型」可视化配置并持久化在本沙盒目录；
# 也可取消下方注释，纯文件化接入任意 OpenAI 兼容网关：
[]

# - id: llm-pi-ai
#   config:
#     providers:
#       local-gateway:
#         displayName: 本地沙盒模型网关
#         api: openai-completions
#         baseURL: https://api.moonshot.cn/v1
#         apiKeyEnv: CUSTOM_LLM_API_KEY
#         models:
#           - id: kimi-k2.5
#             name: Kimi K2.5
#             contextWindow: 262144
#             maxTokens: 32768
#
# - id: agent-default-model
#   config:
#     provider: local-gateway
#     model: kimi-k2.5
EOF
fi

if [[ ! -f "$AGENTS_MD" ]]; then
  cat > "$AGENTS_MD" <<'EOF'
# Sandbox Global Instructions

当前会话运行在独立的本地沙盒环境中，所有持久化数据与技能均隔离在当前沙盒目录内。
EOF
fi

if [[ "$KEEP_ENV_KEYS" != "1" ]]; then
  unset DEEPSEEK_API_KEY DEEPSEEK_BASE_URL DEEPSEEK_SEARCH_BASE_URL OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY MOONSHOT_API_KEY || true
fi

export DSH_HOME="$DSH_HOME_DIR"
export DSH_AGENTS_HOME="$AGENTS_HOME_DIR"
export DSH_PERMISSION_MODE="$PERMISSION_MODE"
export DSH_TELEMETRY_DISABLED="1"
export TMPDIR="$TEMP_DIR"
export TEMP="$TEMP_DIR"
export TMP="$TEMP_DIR"
export XDG_CONFIG_HOME="$DSH_HOME_DIR/config"
export XDG_DATA_HOME="$DSH_HOME_DIR/data"
export XDG_STATE_HOME="$DSH_HOME_DIR/state"
export XDG_CACHE_HOME="$DSH_HOME_DIR/cache"

echo ""
echo "============================================================"
echo "  DeepSeek Harness - 纯本地沙盒环境 (Local Hermetic Sandbox)"
echo "============================================================"
echo "  运行模式 (Mode)       : $MODE"
echo "  沙盒权限 (Sandbox)    : $PERMISSION_MODE"
echo "  本地配置根 (DSH_HOME) : $DSH_HOME"
echo "  密钥配置 (.env)       : $ENV_FILE"
echo "  受管凭据 (.yaml)      : $CRED_FILE"
echo "  模型路由配置 (Patch)  : $PATCH_FILE"
echo "  全局技能根 (Agents)   : $DSH_AGENTS_HOME"
echo "  受限工作区 (Workspace): $RESOLVED_WORKSPACE"
echo "============================================================"
echo ""

if [[ "$INIT_ONLY" == "1" ]]; then
  echo "沙盒目录与本地配置模板初始化完成（--init-only 未启动服务）。"
  exit 0
fi

cd "$RESOLVED_WORKSPACE"

if [[ "$MODE" == "desktop" ]]; then
  cd "$REPO_ROOT"
  exec pnpm --filter @deepseek-ai/dsh-desktop run start -- "--user-data-dir=$ELECTRON_DATA_DIR" "${EXTRA_ARGS[@]}"
fi

IS_DUMP="0"
for arg in "${EXTRA_ARGS[@]:-}"; do
  if [[ "$arg" == "--dump-config" || "$arg" == "--dump-default-config" || "$arg" == "--dump-config-schema" ]]; then
    IS_DUMP="1"
  fi
done

CLI_ARGS=(--profile "$MODE")
if [[ "$MODE" == "web" && "$IS_DUMP" == "0" ]]; then
  [[ -n "$BIND_HOST" ]] && CLI_ARGS+=(--host "$BIND_HOST")
  [[ "$PORT" -gt 0 ]] && CLI_ARGS+=(--port "$PORT")
  [[ "$NO_OPEN" == "1" ]] && CLI_ARGS+=(--no-open)
fi
if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  CLI_ARGS+=("${EXTRA_ARGS[@]}")
fi

if [[ -f "$REPO_ROOT/apps/cli/lib/bin.js" ]]; then
  exec node "$REPO_ROOT/apps/cli/lib/bin.js" "${CLI_ARGS[@]}"
else
  TSX_URI="$(node -e "console.log(require('node:url').pathToFileURL(process.argv[1]).href)" "$REPO_ROOT/node_modules/tsx/dist/esm/index.mjs")"
  exec node --import "$TSX_URI" "$REPO_ROOT/apps/cli/src/bin.ts" "${CLI_ARGS[@]}"
fi
