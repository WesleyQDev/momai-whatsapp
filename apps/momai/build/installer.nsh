!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "FileFunc.nsh"

!insertmacro GetParameters
!insertmacro GetOptions

!ifndef BUILD_UNINSTALLER
Var MomAIClearData

!macro customHeader
  BrandingText "MomAI Installer"
!macroend

!macro customInit
  StrCpy $MomAIClearData "0"

  ${If} ${Silent}
    Goto skip_init
  ${EndIf}

  ; Check if it's an update (already installed with different version)
  ; appId: com.wesleyqdev.momai (from electron-builder.yml)
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai" "DisplayVersion"
  ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.wesleyqdev.momai" "DisplayVersion"
  
  StrCpy $R2 ""
  ${If} $R0 != ""
    StrCpy $R2 $R0
  ${ElseIf} $R1 != ""
    StrCpy $R2 $R1
  ${EndIf}

  ${If} $R2 != ""
    ${If} $R2 != "${VERSION}"
      ; It's an update, skip prompt and update direct
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

    ; clear old installations data
    RMDir /r "$APPDATA\desktop"
    RMDir /r "$LOCALAPPDATA\desktop"
    
    ; userData path: %APPDATA%\MomAI (from package.json "productName": "MomAI")
    RMDir /r "$APPDATA\MomAI"
    RMDir /r "$LOCALAPPDATA\MomAI"
    ; Also clean other MomAI-named folders (updater, or future migration)
    RMDir /r "$LOCALAPPDATA\MomAI-updater"
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
; ========================
!macro customUnInstall
  ; Kill MomAI and related processes before removing anything
  nsExec::ExecToLog 'taskkill /f /im MomAI.exe'
  nsExec::ExecToLog 'taskkill /f /im python.exe /fi "WINDOWTITLE eq momai*"'
  nsExec::ExecToLog 'taskkill /f /im llama-server.exe'
  Sleep 2000

  ${GetParameters} $R0
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    ; If this is an update, do not delete user data
    Return
  ${EndIf}

  ; Remove all user data
  RMDir /r "$APPDATA\desktop"
  RMDir /r "$LOCALAPPDATA\desktop"
  
  ; Real data path: %APPDATA%\MomAI (from package.json "productName": "MomAI")
  RMDir /r "$APPDATA\MomAI"
  RMDir /r "$LOCALAPPDATA\MomAI"
  ; Also clean MomAI-named folders (updater, or future migration)
  RMDir /r "$LOCALAPPDATA\MomAI-updater"
!macroend
