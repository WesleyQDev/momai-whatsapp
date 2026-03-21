import requests
import zipfile
import shutil
import json
import os
import subprocess
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from .manager import skill_registry

logger = logging.getLogger(__name__)

REGISTRY_URL = "https://raw.githubusercontent.com/WesleyQDev/MomAI/main/registry.json"


class ExtensionInstaller:
    """Handles the installation and lifecycle of extensions from the MomAI Store."""

    def __init__(self):
        self.extensions_dir = skill_registry.base_dirs.get("user")
        if not self.extensions_dir:
            # Fallback to a sensible default if for some reason it's missing
            self.extensions_dir = Path.home() / ".local" / "share" / "MomAI" / "skills_extensions"
        
        self.extensions_dir.mkdir(parents=True, exist_ok=True)

    def fetch_registry(self) -> List[Dict[str, Any]]:
        """Fetches the list of available extensions from the registry."""
        # Try local registry first (for development)
        local_registry = Path(__file__).parent.parent.parent.parent.parent / "registry.json"
        if local_registry.exists():
            try:
                logger.info(f"[Installer] Using local registry: {local_registry}")
                with open(local_registry, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return data.get("extensions", [])
            except Exception as e:
                logger.error(f"[Installer] Error reading local registry: {e}")

        # Fetch from cloud
        try:
            logger.info(f"[Installer] Fetching registry from cloud: {REGISTRY_URL}")
            response = requests.get(REGISTRY_URL, timeout=10)
            response.raise_for_status()
            data = response.json()
            return data.get("extensions", [])
        except Exception as e:
            logger.error(f"[Installer] Error fetching registry: {e}")
            return []

    def install(self, download_url: str, extension_id: str) -> bool:
        """Downloads, extracts, and prepares an extension."""
        temp_zip = self.extensions_dir / f"{extension_id}_temp.zip"
        target_dir = self.extensions_dir / extension_id
        
        try:
            repo_name = download_url.split("/")[-4] + "/" + download_url.split("/")[-3] if "github.com" in download_url else extension_id
            logger.info(f"[Installer] Downloading {extension_id} from repo: {repo_name} (URL: {download_url})")
            
            # 1. Download with progress logging
            response = requests.get(download_url, stream=True, timeout=30)
            response.raise_for_status()
            
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(temp_zip, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
                    if total_size > 0:
                        downloaded += len(chunk)
                        # progress = int(100 * downloaded / total_size)
                        # Optionally broadcast progress here if needed

            # 2. Cleanup old version if exists
            if target_dir.exists():
                shutil.rmtree(target_dir)
            target_dir.mkdir(parents=True)

            # 3. Extract
            with zipfile.ZipFile(temp_zip, "r") as zip_ref:
                zip_ref.extractall(target_dir)
            
            # Handle nested folder in zip (common with GitHub downloads)
            self._flatten_directory(target_dir)

            # 4. Cleanup Zip
            temp_zip.unlink()

            # 5. Validate manifest (SKILL.md)
            if not (target_dir / "SKILL.md").exists() and not (target_dir / "skill.md").exists():
                logger.error(f"[Installer] Validation failed: No SKILL.md in {extension_id}")
                shutil.rmtree(target_dir)
                return False

            # 6. Install Dependencies
            self._install_dependencies(target_dir)

            # 7. Reload Registry
            skill_registry.load_all()
            
            logger.info(f"[Installer] {extension_id} installed and loaded successfully.")
            return True

        except Exception as e:
            logger.exception(f"[Installer] Installation of {extension_id} failed: {e}")
            if temp_zip.exists():
                temp_zip.unlink()
            return False

    def uninstall(self, extension_id: str) -> bool:
        """Removes an extension from the user directory."""
        target_dir = self.extensions_dir / extension_id
        if target_dir.exists():
            try:
                shutil.rmtree(target_dir)
                skill_registry.load_all()
                logger.info(f"[Installer] {extension_id} uninstalled.")
                return True
            except Exception as e:
                logger.error(f"[Installer] Uninstall error: {e}")
        return False

    def _flatten_directory(self, target_dir: Path):
        """If the zip contains a single folder (common in GitHub), move its content up."""
        contents = [c for c in target_dir.iterdir() if not c.name.startswith(".") and c.is_dir()]
        
        # GitHub zips usually have a single folder named "repo-name-branchname"
        if len(list(target_dir.iterdir())) == 1 and len(contents) == 1:
            subfolder = contents[0]
            logger.info(f"[Installer] Flattening structure: moving content out of {subfolder.name}")
            for item in subfolder.iterdir():
                dest = target_dir / item.name
                if dest.exists():
                    if dest.is_dir(): shutil.rmtree(dest)
                    else: dest.unlink()
                shutil.move(str(item), str(target_dir))
            subfolder.rmdir()
        else:
            # Check if SKILL.md is inside ANY subfolder (sometimes zips are messy)
            skill_files = list(target_dir.glob("**/SKILL.md")) or list(target_dir.glob("**/skill.md"))
            if skill_files and skill_files[0].parent != target_dir:
                subfolder = skill_files[0].parent
                logger.info(f"[Installer] Found skill in subfolder {subfolder.name}, pulling contents up...")
                for item in subfolder.iterdir():
                    dest = target_dir / item.name
                    if not dest.exists():
                        shutil.move(str(item), str(target_dir))

    def _install_dependencies(self, target_dir: Path):
        """Installs dependencies locally in a 'lib' directory to avoid global environment pollution."""
        pyproject = target_dir / "pyproject.toml"
        requirements = target_dir / "requirements.txt"
        
        uv_bin = os.environ.get("MOMAI_UV_BIN", "uv")
        lib_dir = target_dir / "lib"
        
        try:
            if pyproject.exists():
                logger.info(f"[Installer] Found pyproject.toml, installing isolated via 'uv pip install --target lib .'...")
                subprocess.run([uv_bin, "pip", "install", "--target", str(lib_dir), ".", "--python", sys.executable], cwd=str(target_dir), check=True)
            elif requirements.exists():
                logger.info(f"[Installer] Found requirements.txt, installing isolated via 'uv pip install --target lib -r'...")
                subprocess.run(
                    [uv_bin, "pip", "install", "-r", str(requirements), "--target", str(lib_dir), "--python", sys.executable], 
                    cwd=str(target_dir),
                    check=True
                )
        except Exception as e:
            logger.warning(f"[Installer] Dependency installation warning: {e}")


extension_installer = ExtensionInstaller()

