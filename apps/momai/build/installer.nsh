!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "FileFunc.nsh"

!insertmacro GetParameters
!insertmacro GetOptions

!ifndef BUILD_UNINSTALLER
Var MomAIClearData
Var MomAIInstalledVersion
Var MomAIInstalledDetected

!macro customHeader
  BrandingText "MomAI Installer"
!macroend

!macro customInit
  StrCpy $MomAIClearData "0"
  StrCpy $MomAIInstalledVersion ""
  StrCpy $MomAIInstalledDetected "0"

  ${If} ${Silent}
    Goto skip_init
  ${EndIf}

  ; Detect existing NSIS installation robustly (electron-builder can write *_is1 keys)
  ; Prefer exact version when available to differentiate update vs same-version reinstall.
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai" "DisplayVersion"
  ${If} $R0 != ""
    StrCpy $MomAIInstalledVersion $R0
    StrCpy $MomAIInstalledDetected "1"
  ${EndIf}

  ${If} $MomAIInstalledDetected != "1"
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai" "DisplayVersion"
    ${If} $R0 != ""
      StrCpy $MomAIInstalledVersion $R0
      StrCpy $MomAIInstalledDetected "1"
    ${EndIf}
  ${EndIf}

  ${If} $MomAIInstalledDetected != "1"
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai_is1" "DisplayVersion"
    ${If} $R0 != ""
      StrCpy $MomAIInstalledVersion $R0
      StrCpy $MomAIInstalledDetected "1"
    ${EndIf}
  ${EndIf}

  ${If} $MomAIInstalledDetected != "1"
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai_is1" "DisplayVersion"
    ${If} $R0 != ""
      StrCpy $MomAIInstalledVersion $R0
      StrCpy $MomAIInstalledDetected "1"
    ${EndIf}
  ${EndIf}

  ${If} $MomAIInstalledDetected != "1"
    ReadRegStr $R0 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai" "DisplayVersion"
    ${If} $R0 != ""
      StrCpy $MomAIInstalledVersion $R0
      StrCpy $MomAIInstalledDetected "1"
    ${EndIf}
  ${EndIf}

  ${If} $MomAIInstalledDetected != "1"
    ReadRegStr $R0 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai_is1" "DisplayVersion"
    ${If} $R0 != ""
      StrCpy $MomAIInstalledVersion $R0
      StrCpy $MomAIInstalledDetected "1"
    ${EndIf}
  ${EndIf}

  ; If any installation was detected and version is different, this is an update.
  ${If} $MomAIInstalledDetected == "1"
    ${If} $MomAIInstalledVersion != ""
      ${If} $MomAIInstalledVersion != "${VERSION}"
        Goto skip_init
      ${EndIf}
    ${Else}
      ; Installation detected but version unknown: prefer safe path and skip destructive prompt.
      Goto skip_init
    ${EndIf}
  ${EndIf}

  ; Detect previous installation — offer data reset only on reinstall (same version)
  IfFileExists "$APPDATA\MomAI\*.*" 0 skip_init
    MessageBox MB_YESNO|MB_ICONQUESTION "MomAI ja esta instalada.$\r$\nDeseja apagar todos os dados locais e recomecar do zero?" IDYES clearYes IDNO clearNo
    clearYes:
      StrCpy $MomAIClearData "1"
    clearNo:

  skip_init:

  ${If} $MomAIClearData == "1"
    ; Kill MomAI and related processes before deleting data
    nsExec::ExecToLog 'taskkill /f /im MomAI.exe'
    nsExec::ExecToLog 'taskkill /f /im python.exe /fi "WINDOWTITLE eq momai*"'
    nsExec::ExecToLog 'taskkill /f /im llama-server.exe'
    Sleep 2000

    ; clear old installations data (all variants)
    RMDir /r "$APPDATA\desktop"
    RMDir /r "$LOCALAPPDATA\desktop"

    ; userData path: %APPDATA%\MomAI and all variants
    RMDir /r "$APPDATA\MomAI"
    RMDir /r "$APPDATA\MomAI-Dev"
    RMDir /r "$APPDATA\MomAI-Store"
    RMDir /r "$APPDATA\MomAI-Teste"
    RMDir /r "$LOCALAPPDATA\MomAI"
    RMDir /r "$LOCALAPPDATA\MomAI-Dev"
    RMDir /r "$LOCALAPPDATA\MomAI-Store"
    RMDir /r "$LOCALAPPDATA\MomAI-Teste"
    RMDir /r "$LOCALAPPDATA\MomAI-updater"

    ; Global HuggingFace cache
    RMDir /r "$LOCALAPPDATA\huggingface"
    RMDir /r "$APPDATA\huggingface"
  ${EndIf}
!macroend

!macro customInstall
  # --- VC Redist Check and Install ---
  DetailPrint "Verificando Microsoft Visual C++ Redistributable..."
  
  # Check if VC++ 2015-2022 x64 is already installed using the registry
  StrCpy $0 "0"
  
  # Check 64-bit registry (Machine)
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  
  # If not found in 64-bit, check 32-bit registry (WOW6432Node)
  ${If} $0 != "1"
    ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${EndIf}
  
  # If still not found, check Current User registry
  ${If} $0 != "1"
    ReadRegStr $0 HKCU "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${EndIf}
  
  # Check also in WOW6432Node under HKCU
  ${If} $0 != "1"
    ReadRegStr $0 HKCU "SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${EndIf}
  
  ${If} $0 == "1"
    DetailPrint "Visual C++ Redistributable ja instalado."
  ${Else}
    DetailPrint "Visual C++ Redistributable nao encontrado. Instalando..."
    
    # Check if VC++ installer file exists at compile time
    !if /FileExists "${BUILD_RESOURCES_DIR}\..\bin\vc_redist.x64.exe"
      File "/oname=$PLUGINSDIR\vc_redist.x64.exe" "${BUILD_RESOURCES_DIR}\..\bin\vc_redist.x64.exe"
      
      # Run silently: /install /quiet /norestart
      ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart' $1
      
      # Check if installation was successful
      # 0 = success, 3010 = success but reboot required
      ${If} $1 == 0
        DetailPrint "Visual C++ Redistributable instalado com sucesso."
      ${ElseIf} $1 == 3010
        DetailPrint "Visual C++ Redistributable instalado. Reinicializacao recomendada."
      ${Else}
        DetailPrint "Aviso: Instalacao do VC Redist retornou codigo $1"
      ${EndIf}
    !else
      DetailPrint "Arquivo vc_redist.x64.exe nao empacotado. Pulando instalacao do VC++."
    !endif
  ${EndIf}

  ; --- Clean bundled momai.db from install dir ---
  Delete "$INSTDIR\resources\core\momai.db"
!macroend

!macro customInstallEnd
  ; One-click installer auto-launches the app
!macroend
!endif

; ========================
; UNINSTALLER — User data cleanup
; Cleans: all variants, HF cache, auto-start registry, updater cache
; ========================
!macro customUnInstall
  ; Kill MomAI and related processes before removing anything
  nsExec::ExecToLog 'taskkill /f /im MomAI.exe'
  nsExec::ExecToLog 'taskkill /f /im python.exe /fi "WINDOWTITLE eq momai*"'
  nsExec::ExecToLog 'taskkill /f /im llama-server.exe'
  Sleep 2000

  ; Detect update via electron-updater flag (preserves userData)
  ${GetParameters} $R0
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    ; If this is an update, do not delete user data
    Return
  ${EndIf}

  ; Detect manual update: if installed version != current, it's an upgrade → preserve
  ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai" "DisplayVersion"
  ${If} $R2 == ""
    ReadRegStr $R2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai" "DisplayVersion"
  ${EndIf}
  ${If} $R2 == ""
    ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai_is1" "DisplayVersion"
  ${EndIf}
  ${If} $R2 == ""
    ReadRegStr $R2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai_is1" "DisplayVersion"
  ${EndIf}
  ${If} $R2 == ""
    ReadRegStr $R2 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai" "DisplayVersion"
  ${EndIf}
  ${If} $R2 == ""
    ReadRegStr $R2 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai_is1" "DisplayVersion"
  ${EndIf}
  ${If} $R2 != ""
  ${AndIf} $R2 != "${VERSION}"
    ; Manual upgrade (different version, no --updated flag) → preserve userData
    Return
  ${EndIf}

  ; Real uninstall: clean ALL variants
  RMDir /r "$APPDATA\desktop"
  RMDir /r "$LOCALAPPDATA\desktop"

  ; All userData variants (NSIS + Dev + Store + Teste)
  RMDir /r "$APPDATA\MomAI"
  RMDir /r "$APPDATA\MomAI-Dev"
  RMDir /r "$APPDATA\MomAI-Store"
  RMDir /r "$APPDATA\MomAI-Teste"

  RMDir /r "$LOCALAPPDATA\MomAI"
  RMDir /r "$LOCALAPPDATA\MomAI-Dev"
  RMDir /r "$LOCALAPPDATA\MomAI-Store"
  RMDir /r "$LOCALAPPDATA\MomAI-Teste"

  ; Updater cache (any variant suffix)
  RMDir /r "$LOCALAPPDATA\MomAI-updater"

  ; Auto-start registry cleanup (defense-in-depth)
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MomAI"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.wesleyqdev.momai"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "MomAI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "MomAI"

  ; Global HuggingFace cache (defense-in-depth in case HF_HOME redirect didn't apply)
  RMDir /r "$LOCALAPPDATA\huggingface"
  RMDir /r "$APPDATA\huggingface"
!macroend
