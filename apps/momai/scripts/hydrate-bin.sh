#!/bin/bash
set -e

# Automation to prepare the portable binaries for MomAI build on Linux/macOS
SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
cd "$SCRIPTPATH"
BIN_DIR="../bin"
FORCE_HYDRATE="${MOMAI_FORCE_HYDRATE:-0}"

if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM_KEY="darwin"
else
    PLATFORM_KEY="linux"
fi

PYTHON_DIR="$BIN_DIR/python/$PLATFORM_KEY"
WHEELS_DIR="$BIN_DIR/wheels/$PLATFORM_KEY"

mkdir -p "$BIN_DIR"

hash_file() {
    local target="$1"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$target" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$target" | awk '{print $1}'
    else
        return 1
    fi
}

if [[ "$(uname -m)" == "aarch64" || "$(uname -m)" == "arm64" ]]; then
    ARCH="aarch64"
else
    ARCH="x86_64"
fi

# 1. Download UV
if [[ "$FORCE_HYDRATE" != "1" && -x "$BIN_DIR/uv" ]]; then
    echo "[MomAI] Reusing cached UV: $($BIN_DIR/uv --version)"
else
    echo "[MomAI] Downloading UV..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    UV_URL="https://github.com/astral-sh/uv/releases/latest/download/uv-${ARCH}-apple-darwin.tar.gz"
else
    UV_URL="https://github.com/astral-sh/uv/releases/latest/download/uv-${ARCH}-unknown-linux-musl.tar.gz"
fi

    UV_TAR="$BIN_DIR/uv.tar.gz"
    curl -L "$UV_URL" -o "$UV_TAR"
    tar -xzf "$UV_TAR" -C "$BIN_DIR" --strip-components=1
    rm "$UV_TAR"

    echo "[MomAI] UV installed: $($BIN_DIR/uv --version)"
fi

# 2. Download Portable Python 3.12
if [[ "$FORCE_HYDRATE" != "1" && -x "$PYTHON_DIR/bin/python3" ]]; then
    echo "[MomAI] Reusing cached Python: $($PYTHON_DIR/bin/python3 --version)"
else
    echo "[MomAI] Downloading Portable Python 3.12..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20250115/cpython-3.12.8+20250115-${ARCH}-apple-darwin-install_only.tar.gz"
else
    PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20250115/cpython-3.12.8+20250115-${ARCH}-unknown-linux-gnu-install_only.tar.gz"
fi

    PY_TAR="$BIN_DIR/python.tar.gz"
    curl -L "$PY_URL" -o "$PY_TAR"
    rm -rf "$PYTHON_DIR"
    mkdir -p "$PYTHON_DIR"
    tar -xzf "$PY_TAR" -C "$PYTHON_DIR" --strip-components=1
    rm "$PY_TAR"

    echo "[MomAI] Python installed: $($PYTHON_DIR/bin/python3 --version)"
fi

# NOTE: VC++ Redistributable is Windows-only, skipping for Linux/macOS
echo "[MomAI] Hydration complete! UV and Python are ready in apps/momai/bin"

# 3. Download llama.cpp runtime binaries for Linux (CPU + Vulkan)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "[MomAI] Preparing llama.cpp Linux binaries..."

    LLAMA_VERSION="${MOMAI_LLAMA_VERSION:-}"
    if [[ -z "$LLAMA_VERSION" ]]; then
        LLAMA_VERSION=$(curl -fsSL "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
    fi
    if [[ -z "$LLAMA_VERSION" ]]; then
        echo "[MomAI] ERROR: Could not determine llama.cpp release tag."
        exit 1
    fi

    if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
        CPU_ASSET="llama-${LLAMA_VERSION}-bin-ubuntu-arm64.tar.gz"
        VULKAN_ASSET="llama-${LLAMA_VERSION}-bin-ubuntu-vulkan-arm64.tar.gz"
    else
        CPU_ASSET="llama-${LLAMA_VERSION}-bin-ubuntu-x64.tar.gz"
        VULKAN_ASSET="llama-${LLAMA_VERSION}-bin-ubuntu-vulkan-x64.tar.gz"
    fi

    LLAMA_BASE_URL="https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_VERSION}"
    LLAMA_DIR="$BIN_DIR/llama"
    CPU_DIR="$LLAMA_DIR/cpu"
    VULKAN_DIR="$LLAMA_DIR/vulkan"

    if [[ "$FORCE_HYDRATE" != "1" && -f "$CPU_DIR/llama-server" && -f "$VULKAN_DIR/llama-server" ]]; then
        chmod +x "$CPU_DIR/llama-server" "$VULKAN_DIR/llama-server" || true
        echo "[MomAI] Reusing cached llama.cpp Linux binaries (tag target: $LLAMA_VERSION)"
    else

        mkdir -p "$CPU_DIR" "$VULKAN_DIR"

        CPU_TAR="$BIN_DIR/${CPU_ASSET}"
        VULKAN_TAR="$BIN_DIR/${VULKAN_ASSET}"

    extract_llama_tar() {
        local tar_path="$1"
        local target_dir="$2"
        local tmp_extract="$BIN_DIR/.llama-extract-$(date +%s%N)"

        mkdir -p "$tmp_extract"
        tar -xzf "$tar_path" -C "$tmp_extract"

        local server_path
        server_path=$(find "$tmp_extract" -type f -name "llama-server" | head -n1 || true)
        if [[ -z "$server_path" ]]; then
            rm -rf "$tmp_extract"
            return 1
        fi

        local source_dir
        source_dir=$(dirname "$server_path")

        mkdir -p "$target_dir"
        # Remove only Linux-native binaries/libraries to preserve Windows artifacts.
        find "$target_dir" -type f \( -name 'llama-server' -o -name '*.so' -o -name '*.a' \) -delete 2>/dev/null || true
        cp -a "$source_dir"/. "$target_dir"/
        rm -rf "$tmp_extract"
        return 0
    }

        echo "[MomAI] Downloading llama CPU build: $CPU_ASSET"
        curl -fL "${LLAMA_BASE_URL}/${CPU_ASSET}" -o "$CPU_TAR"
        extract_llama_tar "$CPU_TAR" "$CPU_DIR" || { echo "[MomAI] ERROR: Could not extract CPU llama-server."; exit 1; }
        rm -f "$CPU_TAR"

        echo "[MomAI] Downloading llama Vulkan build: $VULKAN_ASSET"
        curl -fL "${LLAMA_BASE_URL}/${VULKAN_ASSET}" -o "$VULKAN_TAR"
        extract_llama_tar "$VULKAN_TAR" "$VULKAN_DIR" || { echo "[MomAI] ERROR: Could not extract Vulkan llama-server."; exit 1; }
        rm -f "$VULKAN_TAR"

        if [[ ! -f "$CPU_DIR/llama-server" || ! -f "$VULKAN_DIR/llama-server" ]]; then
            echo "[MomAI] ERROR: llama-server not found after extraction."
            exit 1
        fi

        chmod +x "$CPU_DIR/llama-server" "$VULKAN_DIR/llama-server" || true
        echo "[MomAI] llama.cpp Linux binaries ready (tag: $LLAMA_VERSION)"
    fi
fi

# 4. Download dependency wheels for offline installation
CORE_DIR="$SCRIPTPATH/../../core"
LOCK_FILE="$BIN_DIR/requirements-linux.lock"
UV_EXE="$BIN_DIR/uv"
PYTHON_EXE="$PYTHON_DIR/bin/python3"
WHEEL_HASH_FILE="$BIN_DIR/.wheels-pyproject.sha256"

CURRENT_CORE_HASH=""
CURRENT_CORE_HASH=$(hash_file "$CORE_DIR/pyproject.toml" || true)

if [[ "$FORCE_HYDRATE" != "1" && -n "$CURRENT_CORE_HASH" && -f "$WHEEL_HASH_FILE" ]] && [[ "$(cat "$WHEEL_HASH_FILE")" == "$CURRENT_CORE_HASH" ]]; then
    echo "[MomAI] Skipping wheel cache refresh (core pyproject unchanged)."
    echo "[MomAI] Full hydration complete! All binaries and wheels are ready."
    exit 0
fi

echo "[MomAI] Generating lockfile for Linux..."
"$UV_EXE" pip compile "$CORE_DIR/pyproject.toml" \
    --python-version 3.12 \
    --python-platform linux \
    --output-file "$LOCK_FILE"

if [ $? -ne 0 ]; then
    echo "[MomAI] WARNING: Failed to generate lockfile. Wheels will not be cached."
else
    rm -rf "$WHEELS_DIR"
    mkdir -p "$WHEELS_DIR"

    if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
        PIP_PLATFORMS=("manylinux2014_aarch64" "manylinux_2_28_aarch64")
    else
        PIP_PLATFORMS=("manylinux2014_x86_64" "manylinux_2_28_x86_64")
    fi

    depsDownloadExitCode=1
    for PIP_PLATFORM in "${PIP_PLATFORMS[@]}"; do
        echo "[MomAI] Downloading dependency wheels for $PIP_PLATFORM..."
        set +e
        "$PYTHON_EXE" -m pip download \
            -d "$WHEELS_DIR" \
            -r "$LOCK_FILE" \
            --only-binary :all: \
            --platform "$PIP_PLATFORM" \
            --python-version 3.12 \
            --implementation cp \
            --quiet
        depsDownloadExitCode=$?
        set -e
        if [ $depsDownloadExitCode -eq 0 ]; then
            echo "[MomAI] Dependency wheels downloaded successfully for $PIP_PLATFORM."
            break
        fi
        echo "[MomAI] WARNING: Wheel download failed for $PIP_PLATFORM. Trying fallback platform..."
    done

    # Also download build-system dependencies for fully offline builds
    echo "[MomAI] Downloading build-system wheels..."
    set +e
    "$PYTHON_EXE" -m pip download \
        -d "$WHEELS_DIR" \
        "setuptools>=69" "wheel" \
        --only-binary :all: \
        --python-version 3.12 \
        --quiet
    buildDepsDownloadExitCode=$?
    set -e

    if [ $depsDownloadExitCode -ne 0 ] || [ $buildDepsDownloadExitCode -ne 0 ]; then
        echo "[MomAI] WARNING: Some wheels failed to download. Runtime will fallback to internet."
    else


        WHEEL_COUNT=$(find "$WHEELS_DIR" -name "*.whl" | wc -l)
        TOTAL_SIZE=$(du -sh "$WHEELS_DIR" | cut -f1)
        echo "[MomAI] Downloaded $WHEEL_COUNT wheels ($TOTAL_SIZE)"
    fi
fi

if [[ -n "$CURRENT_CORE_HASH" ]]; then
    printf '%s' "$CURRENT_CORE_HASH" > "$WHEEL_HASH_FILE"
fi

echo "[MomAI] Full hydration complete! All binaries and wheels are ready."
