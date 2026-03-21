import subprocess
import os
import time
import requests
import logging
import ctypes
import platform
from pathlib import Path
from huggingface_hub import hf_hub_download
from langchain_openai import ChatOpenAI

# Configure logger
logger = logging.getLogger("uvicorn.error")

# Global variable
server_process = None
CTX_SIZE = int(os.getenv("MOMAI_CTX_SIZE", "8192"))

# --- Windows Job Object Support ---
# This ensures that if the Python process dies (crash/kill),
# Windows automatically kills the llama-server.
if os.name == "nt":
    try:
        job_handle = ctypes.windll.kernel32.CreateJobObjectW(None, None)

        # JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [
                ("ReadOperationCount", ctypes.c_ulonglong),
                ("WriteOperationCount", ctypes.c_ulonglong),
                ("OtherOperationCount", ctypes.c_ulonglong),
                ("ReadTransferCount", ctypes.c_ulonglong),
                ("WriteTransferCount", ctypes.c_ulonglong),
                ("OtherTransferCount", ctypes.c_ulonglong),
            ]

        class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [
                ("PerProcessUserTimeLimit", ctypes.c_longlong),
                ("PerJobUserTimeLimit", ctypes.c_longlong),
                ("LimitFlags", ctypes.c_ulong),
                ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t),
                ("ActiveProcessLimit", ctypes.c_ulong),
                ("Affinity", ctypes.c_size_t),
                ("PriorityClass", ctypes.c_ulong),
                ("SchedulingClass", ctypes.c_ulong),
            ]

        class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [
                ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
                ("IoInfo", IO_COUNTERS),
                ("ProcessMemoryLimit", ctypes.c_size_t),
                ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t),
                ("PeakJobMemoryUsed", ctypes.c_size_t),
            ]

        # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
        info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        info.BasicLimitInformation.LimitFlags = 0x2000

        ret = ctypes.windll.kernel32.SetInformationJobObject(
            job_handle,
            9,  # JobObjectExtendedLimitInformation
            ctypes.byref(info),
            ctypes.sizeof(info),
        )
        if not ret:
            logger.warning(
                "[local_model] Failed to configure Job Object (SetInformationJobObject)"
            )

    except Exception as e:
        logger.warning(f"[local_model] Error creating Job Object: {e}")
        job_handle = None
else:
    job_handle = None


import utils.downloader as downloader
from database.models import SessionLocal, Settings


def _find_vcruntime_dir() -> str | None:
    """Locate the directory containing vcruntime140.dll for MSIX child processes."""
    if os.name != "nt":
        return None
    try:
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetModuleHandleW("vcruntime140.dll")
        if handle:
            buf = ctypes.create_unicode_buffer(260)
            if kernel32.GetModuleFileNameW(handle, buf, 260):
                d = os.path.dirname(buf.value)
                if os.path.isdir(d):
                    return d
    except Exception:
        pass
    return None


def get_paths(forced_backend=None):
    """
    Returns the paths for binaries and models based on the installed backend.

    Returns:
        dict: Paths for 'exe', 'models' and the detected 'backend'.
    """
    env_path = os.environ.get("MOMAI_CORE_PATH")
    base_dir = Path(env_path) if env_path else Path(__file__).parent.parent.parent

    # Fetch user preference from database
    db = SessionLocal()
    settings = db.query(Settings).first()
    preferred_backend = settings.local_backend if settings else "auto"
    db.close()

    backend = "cpu"  # Default fallback

    if forced_backend:
        backend = forced_backend
    elif preferred_backend != "auto":
        backend = preferred_backend
    else:
        hw_info = downloader.get_hardware_info()
        backend = hw_info.get("backend", "cpu")

    logger.debug(f"[local_model] Resolved base_dir={base_dir}, backend={backend}")

    exe_name = "llama-server.exe" if platform.system() == "Windows" else "llama-server"
    exe_path = base_dir / "bin" / backend / exe_name

    # If the optimal backend is not installed, but another one IS installed,
    # we should ideally download the optimal one.
    # But if we strictly want fallback when offline, we can check network or just
    # rely on the download step which will fail correctly if offline.
    # By removing the silent fallback loop here, 'auto' will actually trigger
    # downloading the GPU engine if it detects a GPU but it's not installed yet.
    if preferred_backend == "auto" and not exe_path.exists():
        # Only fallback if NO network/can't install, but we do this gracefully in load_model
        pass

    return {"exe": exe_path, "models": base_dir / "models", "backend": backend}


def stop_server():
    """Stops the llama-server if it is currently running."""
    global server_process
    if server_process:
        logger.debug("[local_model] Stopping previous Llama.cpp server...")
        try:
            # Try to terminate gracefully
            server_process.terminate()
            # Give 2 seconds to clean up
            server_process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            logger.warning("[local_model] Forcing server kill...")
            # Force kill
            try:
                server_process.kill()
                server_process.wait(timeout=1)
            except Exception:
                pass
        except Exception as e:
            logger.error(f"[local_model] Error stopping process: {e}")

        server_process = None


def load_model(repo_id: str, filename: str, ctx_size: int = None, gpu_layers: int = None, on_progress=None, temperature: float = 0.1, top_p: float = 0.8, top_k: int = 20, presence_penalty: float = 0.0, repetition_penalty: float = 1.1) -> ChatOpenAI | None:
    """
    Downloads and starts the llama-server with the specified model.

    Args:
        repo_id (str): HuggingFace repository ID.
        filename (str): Model filename (.gguf).
        ctx_size (int, optional): Context window size.
        gpu_layers (int, optional): Number of layers to offload to GPU.
        on_progress (callable, optional): Callback for progress reporting.
        temperature (float): Model temperature.
        top_p (float): Model top_p.
        top_k (int): Model top_k.

    Returns:
        ChatOpenAI | None: A LangChain ChatOpenAI instance pointing to local LLM.
    """
    global server_process

    def report(msg):
        prefixed_msg = f"[Local LLM] {msg}"
        if on_progress:
            on_progress(prefixed_msg)
        logger.info(f"[Local LLM] {msg}")

    stop_server()

    try:
        result = _try_start_server(repo_id, filename, ctx_size, gpu_layers, report, temperature, top_p, top_k, presence_penalty, repetition_penalty)
        if result is not None:
            return result

        # If primary backend failed, try CPU fallback
        paths = get_paths()
        if paths["backend"] != "cpu":
            report(f"Backend {paths['backend']} failed. Falling back to CPU...")
            result = _try_start_server(repo_id, filename, ctx_size, 0, report, temperature, top_p, top_k, presence_penalty, repetition_penalty, forced_backend="cpu")
            if result is not None:
                return result

        return None

    except Exception as e:
        report(f"Critical error: {str(e)}")
        stop_server()
        return None


def _try_start_server(repo_id, filename, ctx_size, gpu_layers, report, temperature, top_p, top_k, presence_penalty, repetition_penalty, forced_backend=None) -> ChatOpenAI | None:
    global server_process

    stop_server()

    try:
        paths = get_paths(forced_backend=forced_backend)
        local_model_path = paths["models"] / filename

        if local_model_path.exists():
            model_path = str(local_model_path)
            report(f"Using cached model: {filename}")
        else:
            report(f"Model not found locally, attempting to download {filename}...")
            # Temporarily allow network for initial download
            old_offline = os.environ.get("HF_HUB_OFFLINE")
            os.environ["HF_HUB_OFFLINE"] = "0"
            try:
                # Try to use progress tracking if available
                try:
                    from huggingface_hub import hf_hub_download

                    model_path = hf_hub_download(
                        repo_id=repo_id,
                        filename=filename,
                        local_dir=paths["models"],
                        progress_callback=lambda current, total: report(
                            f"Downloading model: {current / 1024 / 1024:.1f}MB / {total / 1024 / 1024:.1f}MB"
                        ),
                    )
                except TypeError:
                    # Older huggingface_hub doesn't support progress_callback
                    model_path = hf_hub_download(
                        repo_id=repo_id, filename=filename, local_dir=paths["models"]
                    )
                report("Download successful!")
            finally:
                # Restore offline mode
                if old_offline is not None:
                    os.environ["HF_HUB_OFFLINE"] = old_offline
                else:
                    os.environ["HF_HUB_OFFLINE"] = "1"

        abs_model_path = str(Path(model_path).resolve())
        abs_exe_path = str(paths["exe"].resolve())

        if not paths["exe"].exists():
            report(
                f"Local engine ({paths['backend']}) not found. Attempting auto-installation..."
            )
            success = downloader.ensure_engine_installed(
                progress_callback=lambda p: report(f"Downloading engine: {p}%"),
                backend=paths["backend"],
            )
            if not success:
                report("ERROR: Failed to install local LLM engine!")
                raise FileNotFoundError(
                    f"Local engine ({paths['backend']}) not found and auto-installation failed."
                )
            # Refresh paths after installation
            paths = get_paths(forced_backend=forced_backend)
            abs_exe_path = str(paths["exe"].resolve())

        import psutil

        physical_cores = psutil.cpu_count(logical=False) or 4

        report(f"Using backend: {paths['backend']} | exe: {abs_exe_path}")

        exe_dir = str(Path(abs_exe_path).parent)

        if not Path(abs_exe_path).exists():
            report(f"FATAL: exe not found at {abs_exe_path}")
            return None

        expected_dlls = ["ggml.dll", "llama.dll", "ggml-base.dll"]
        missing = [d for d in expected_dlls if not (Path(exe_dir) / d).exists()]
        if missing:
            report(f"WARNING: Missing DLLs in {exe_dir}: {missing}")

        if os.name == "nt":
            try:
                os.add_dll_directory(exe_dir)
            except OSError:
                pass

        # Parallel slots for concurrent requests (title generation, chat, summary, etc)
        PARALLEL_SLOTS = 4

        cmd = [
            abs_exe_path,
            "-m",
            abs_model_path,
            "--port",
            "8080",
            "-c",
            str((ctx_size or CTX_SIZE) * PARALLEL_SLOTS),
            "-t",
            str(physical_cores),
            "-ngl",
            str(gpu_layers if gpu_layers is not None else 99),
            "--parallel",
            str(PARALLEL_SLOTS),
            "--flash-attn",
            "auto",
            "--cache-prompt",
            "-b",
            "2048",
            "-ub",
            "512",
            "--no-mmap" if paths["backend"] == "cpu" else "--mmap",
            "--min-p",
            "0.00",
            "--top-p",
            str(top_p),
            "--top-k",
            str(top_k),
            "--presence-penalty",
            str(presence_penalty),
            "--repeat-penalty",
            str(repetition_penalty),
        ]

        logger.debug("[Local LLM] Starting local LLM process...")

        env_path = os.environ.get("MOMAI_CORE_PATH")
        log_base = Path(env_path) if env_path else Path(__file__).parent
        llama_log_path = log_base / "llama_server.log"
        llama_log_file = open(llama_log_path, "wb", buffering=0)

        proc_env = os.environ.copy()
        path_parts = [exe_dir]
        if os.name == "nt":
            sys_root = os.environ.get("SystemRoot", r"C:\Windows")
            path_parts.append(os.path.join(sys_root, "System32"))
            path_parts.append(sys_root)
            vc_dir = _find_vcruntime_dir()
            if vc_dir:
                path_parts.insert(1, vc_dir)
        path_parts.append(proc_env.get("PATH", ""))
        proc_env["PATH"] = os.pathsep.join(path_parts)

        server_process = subprocess.Popen(
            cmd,
            stdout=llama_log_file,
            stderr=llama_log_file,
            cwd=exe_dir,
            env=proc_env,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )

        # Assign to Job Object (Windows Magic)
        if job_handle and server_process:
            try:
                perm = ctypes.windll.kernel32.AssignProcessToJobObject(
                    job_handle, ctypes.c_void_p(server_process._handle)
                )
                if not perm:
                    logger.warning("[local_model] Failed AssignProcessToJobObject")
            except Exception as e:
                logger.warning(f"[local_model] Error assigning Job: {e}")

        # Healthcheck Loop
        logger.debug("[Local LLM] Waiting for local LLM initialization (Healthcheck)...")
        last_percent = -1
        for i in range(240):  # 240 * 0.25 = 60s
            # Safety check: server_process might be killed by ResourceManager
            if server_process is None:
                report("Startup aborted: local LLM process was closed.")
                return None

            if server_process.poll() is not None:
                exit_code = server_process.returncode
                llama_log_file.close()

                extra_info = ""
                if exit_code == 3221225781:  # 0xC0000135 STATUS_DLL_NOT_FOUND
                    try:
                        dir_files = list(Path(exe_dir).iterdir())
                        dll_list = [f.name for f in dir_files if f.suffix in (".dll", ".exe")]
                        extra_info = f"\nSTATUS_DLL_NOT_FOUND (0xC0000135) - Missing system DLL. exe_dir={exe_dir} files({len(dll_list)})={dll_list[:20]}"
                    except Exception:
                        extra_info = f"\nSTATUS_DLL_NOT_FOUND - exe_dir={exe_dir}"

                try:
                    with open(llama_log_path, "r", encoding="utf-8", errors="replace") as f:
                        log_content = f.read()[-500:]
                    report(f"Local LLM died unexpectedly! exit_code={exit_code} Log:\n{log_content}{extra_info}")
                except Exception:
                    report(f"Local LLM died unexpectedly (exit_code={exit_code}) and log could not be read.")
                return None

            # Dynamic Progress Tracking via log file
            try:
                import re
                with open(llama_log_path, "r", encoding="utf-8", errors="replace") as f:
                    log_content = f.read()
                    matches = re.findall(r"tensor\s+(\d+)\s*/\s*(\d+)", log_content)
                    if matches:
                        current, total = int(matches[-1][0]), int(matches[-1][1])
                        if total > 0:
                            percent = min(99, int((current / total) * 100))
                            if percent > last_percent:
                                report(f"Carregando o modelo Llama ({percent}%)")
                                last_percent = percent
            except Exception:
                pass

            try:
                if (
                    requests.get(
                        "http://127.0.0.1:8080/health", timeout=0.25
                    ).status_code
                    == 200
                ):
                    report("Local server ready and connected!")
                    return ChatOpenAI(
                        base_url="http://127.0.0.1:8080/v1",
                        api_key="sk-none",
                        model="gpt-4o",
                        temperature=temperature,
                        streaming=True,
                    )
            except Exception:
                # Healthcheck failed, server not ready yet
                pass

            if i % 20 == 0 and i > 0 and last_percent == -1:
                report(f"Inicializando motor IA... ({(i * 250) // 1000}s decorridos)")
            time.sleep(0.25)

        llama_log_file.close()
        report("Local LLM startup timeout reached.")
        stop_server()
        return None

    except Exception as e:
        report(f"Error starting backend {paths['backend']}: {str(e)}")
        if 'llama_log_file' in dir() and not llama_log_file.closed:
            llama_log_file.close()
        stop_server()
        return None
