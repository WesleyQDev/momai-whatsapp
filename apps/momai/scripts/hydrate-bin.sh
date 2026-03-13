#!/bin/bash
set -e

# Automation to prepare the portable binaries for MomAI build on Linux/macOS
SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
cd "$SCRIPTPATH"
BIN_DIR="../bin"

mkdir -p "$BIN_DIR"

# 1. Download UV
echo "[MomAI] Downloading UV..."

if [[ "$(uname -m)" == "aarch64" || "$(uname -m)" == "arm64" ]]; then
    ARCH="aarch64"
else
    ARCH="x86_64"
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
    UV_URL="https://github.com/astral-sh/uv/releases/latest/download/uv-${ARCH}-apple-darwin.tar.gz"
else
    UV_URL="https://github.com/astral-sh/uv/releases/latest/download/uv-${ARCH}-unknown-linux-musl.tar.gz"
fi

UV_TAR="$BIN_DIR/uv.tar.gz"
curl -L "$UV_URL" -o "$UV_TAR"
tar -xzf "$UV_TAR" -C "$BIN_DIR" --strip-components=1
rm "$UV_TAR"

echo "[MomAI] UV installed: $("$BIN_DIR/uv" --version)"

# 2. Download Portable Python 3.12
echo "[MomAI] Downloading Portable Python 3.12..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20250115/cpython-3.12.8+20250115-${ARCH}-apple-darwin-install_only.tar.gz"
else
    PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20250115/cpython-3.12.8+20250115-${ARCH}-unknown-linux-gnu-install_only.tar.gz"
fi

PY_TAR="$BIN_DIR/python.tar.gz"
curl -L "$PY_URL" -o "$PY_TAR"
mkdir -p "$BIN_DIR/python"
tar -xzf "$PY_TAR" -C "$BIN_DIR/python" --strip-components=1
rm "$PY_TAR"

echo "[MomAI] Python installed: $("$BIN_DIR/python/bin/python3" --version)"

# NOTE: VC++ Redistributable is Windows-only, skipping for Linux/macOS
echo "[MomAI] Hydration complete! UV and Python are ready in apps/momai/bin"

# 3. Download dependency wheels for offline installation
WHEELS_DIR="$BIN_DIR/wheels"
CORE_DIR="$SCRIPTPATH/../../core"
LOCK_FILE="$BIN_DIR/requirements-linux.lock"
UV_EXE="$BIN_DIR/uv"
PYTHON_EXE="$BIN_DIR/python/bin/python3"

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
        PIP_PLATFORM="manylinux2014_aarch64"
    else
        PIP_PLATFORM="manylinux2014_x86_64"
    fi

    echo "[MomAI] Downloading dependency wheels for $PIP_PLATFORM..."
    "$PYTHON_EXE" -m pip download \
        -d "$WHEELS_DIR" \
        -r "$LOCK_FILE" \
        --only-binary :all: \
        --platform "$PIP_PLATFORM" \
        --python-version 3.12 \
        --implementation cp \
        --quiet

    if [ $? -ne 0 ]; then
        echo "[MomAI] WARNING: Some wheels failed to download. Runtime will fallback to internet."
    else
        WHEEL_COUNT=$(find "$WHEELS_DIR" -name "*.whl" | wc -l)
        TOTAL_SIZE=$(du -sh "$WHEELS_DIR" | cut -f1)
        echo "[MomAI] Downloaded $WHEEL_COUNT wheels ($TOTAL_SIZE)"
    fi
fi

echo "[MomAI] Full hydration complete! All binaries and wheels are ready."
