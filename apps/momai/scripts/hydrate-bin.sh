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

assert_sha256() {
    local target="$1"
    local expected="$2"
    local actual
    actual=$(hash_file "$target")
    if [[ "$actual" != "$expected" ]]; then
        echo "[MomAI] ERROR: SHA-256 mismatch for $target. Expected $expected, got $actual."
        exit 1
    fi
}

UV_VERSION="0.11.29"
DEFAULT_LLAMA_VERSION="b10068"

if [[ "$(uname -m)" == "aarch64" || "$(uname -m)" == "arm64" ]]; then
    ARCH="aarch64"
else
    ARCH="x86_64"
fi

# 1. Download UV
if command -v uv >/dev/null 2>&1; then
    echo "[MomAI] UV already in PATH: $(uv --version)"
elif [[ "$FORCE_HYDRATE" != "1" && -x "$BIN_DIR/uv" ]]; then
    echo "[MomAI] Reusing cached UV: $($BIN_DIR/uv --version)"
else
    echo "[MomAI] Downloading UV..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    UV_URL="https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${ARCH}-apple-darwin.tar.gz"
    if [[ "$ARCH" == "aarch64" ]]; then
        UV_SHA256="61c04acc52a33ef0f331e494bdfbedcdb6c26c6970c022ed3699e5860f8930e3"
    else
        UV_SHA256="c4c4de482da9ccdd076dc4fb5cfe7b740609029385c72f58606be3153602387d"
    fi
else
    UV_URL="https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${ARCH}-unknown-linux-musl.tar.gz"
    if [[ "$ARCH" == "aarch64" ]]; then
        UV_SHA256="593d79a797ece3f1dfaaf3e0a973263422a135d9262c7dbc6cd75d9c11acc0b4"
    else
        UV_SHA256="46711858adb2a3acaa9cee00f9060688ad1fd5706aecc005b96a6a7f285a00b7"
    fi
fi

    UV_TAR="$BIN_DIR/uv.tar.gz"
    curl -L "$UV_URL" -o "$UV_TAR"
    assert_sha256 "$UV_TAR" "$UV_SHA256"
    tar -xzf "$UV_TAR" -C "$BIN_DIR" --strip-components=1
    rm "$UV_TAR"

    echo "[MomAI] UV installed: $($BIN_DIR/uv --version)"
fi

# 2. Download Portable Python 3.12
if command -v python3 >/dev/null 2>&1; then
    echo "[MomAI] Python3 already in PATH: $(python3 --version)"
elif [[ "$FORCE_HYDRATE" != "1" && -x "$PYTHON_DIR/bin/python3" ]]; then
    echo "[MomAI] Reusing cached Python: $($PYTHON_DIR/bin/python3 --version)"
else
    echo "[MomAI] Downloading Portable Python 3.12..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20250115/cpython-3.12.8+20250115-${ARCH}-apple-darwin-install_only.tar.gz"
    if [[ "$ARCH" == "aarch64" ]]; then
        PY_SHA256="e29003b69465c33692830032d9d237d84ea43a2e8461db9134641640fb49f040"
    else
        PY_SHA256="b81ae8ea17fce6e173649120fcc4eda123bb8df54890894bbec432f527fbe75c"
    fi
else
    PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20250115/cpython-3.12.8+20250115-${ARCH}-unknown-linux-gnu-install_only.tar.gz"
    if [[ "$ARCH" == "aarch64" ]]; then
        PY_SHA256="2e08c1d4de239290b9fc3bef90f121349819b473149083470d16081dd293050c"
    else
        PY_SHA256="e5435e717c934ed30d4066f64e858497c27f37c1ba547f403b050d9221e50ea4"
    fi
fi

    PY_TAR="$BIN_DIR/python.tar.gz"
    curl -L "$PY_URL" -o "$PY_TAR"
    assert_sha256 "$PY_TAR" "$PY_SHA256"
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

    LLAMA_VERSION="${MOMAI_LLAMA_VERSION:-$DEFAULT_LLAMA_VERSION}"
    if [[ -z "$LLAMA_VERSION" ]]; then
        echo "[MomAI] ERROR: Could not determine llama.cpp release tag."
        exit 1
    fi

    if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
        CPU_ASSET="llama-${LLAMA_VERSION}-bin-ubuntu-arm64.tar.gz"
        VULKAN_ASSET="llama-${LLAMA_VERSION}-bin-ubuntu-vulkan-arm64.tar.gz"
        DEFAULT_LLAMA_CPU_SHA256="2c0e4d3d5932e472b6c669090968fdc84a7f6a2940f2e8bb40fa03225bd01960"
        DEFAULT_LLAMA_VULKAN_SHA256="c3c49e6e124a574165ca28317be021b1a12a2ea06977e3eb7daee3eb443eb186"
    else
        CPU_ASSET="llama-${LLAMA_VERSION}-bin-ubuntu-x64.tar.gz"
        VULKAN_ASSET="llama-${LLAMA_VERSION}-bin-ubuntu-vulkan-x64.tar.gz"
        DEFAULT_LLAMA_CPU_SHA256="6bf3d20de562e4df230f1a7c54fb7a06a80c7ff40f5311c953e8255744be4eb2"
        DEFAULT_LLAMA_VULKAN_SHA256="713641920dce6c8efb953ebc9ffa309977e200cec5e182e6ad0e8b086203cdc3"
    fi

    if [[ "$LLAMA_VERSION" == "$DEFAULT_LLAMA_VERSION" ]]; then
        LLAMA_CPU_SHA256="$DEFAULT_LLAMA_CPU_SHA256"
        LLAMA_VULKAN_SHA256="$DEFAULT_LLAMA_VULKAN_SHA256"
    else
        LLAMA_CPU_SHA256="${MOMAI_LLAMA_CPU_SHA256:-}"
        LLAMA_VULKAN_SHA256="${MOMAI_LLAMA_VULKAN_SHA256:-}"
    fi

    if [[ -z "$LLAMA_CPU_SHA256" || -z "$LLAMA_VULKAN_SHA256" ]]; then
        echo "[MomAI] ERROR: llama.cpp overrides require MOMAI_LLAMA_CPU_SHA256 and MOMAI_LLAMA_VULKAN_SHA256."
        exit 1
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
        assert_sha256 "$CPU_TAR" "$LLAMA_CPU_SHA256"
        extract_llama_tar "$CPU_TAR" "$CPU_DIR" || { echo "[MomAI] ERROR: Could not extract CPU llama-server."; exit 1; }
        rm -f "$CPU_TAR"

        echo "[MomAI] Downloading llama Vulkan build: $VULKAN_ASSET"
        curl -fL "${LLAMA_BASE_URL}/${VULKAN_ASSET}" -o "$VULKAN_TAR"
        assert_sha256 "$VULKAN_TAR" "$LLAMA_VULKAN_SHA256"
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
UV_EXE=$(command -v uv 2>/dev/null || echo "$BIN_DIR/uv")
PYTHON_EXE=$(command -v python3 2>/dev/null || echo "$PYTHON_DIR/bin/python3")
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
