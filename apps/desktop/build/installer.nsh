!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Var MomAIClearData
Var MomAICheckbox
Var MomAIStartCheckbox
Var MomAIStartApp
Var MomAIIconHandle

!macro customHeader
  BrandingText "MomAI Installer"
  Caption "MomAI - Instalacao"
!macroend

!macro customInit
  InitPluginsDir
  ; Use compile-time check for icon file — runtime IfFileExists cannot guard
  ; the compile-time File command and would cause a compiler error if the file
  ; is missing.
  !if /FileExists "${BUILD_RESOURCES_DIR}\icon.ico"
    File /oname=$PLUGINSDIR\momai.ico "${BUILD_RESOURCES_DIR}\icon.ico"
  !else
    !warning "icon.ico nao encontrado em ${BUILD_RESOURCES_DIR}"
  !endif
!macroend

Function MomAI_SetFont
  ; Stack: [HWND, size, weight]
  Exch $2        ; $2 = weight
  Exch 1
  Exch $1        ; $1 = size  
  Exch 2
  Exch $0        ; $0 = HWND
  Push $3
  CreateFont $3 "Segoe UI" $1 $2
  SendMessage $0 ${WM_SETFONT} $3 0
  Pop $3
  Pop $0
  Pop $2
  Pop $1
FunctionEnd

Function MomAIWelcomePage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; Only set icon if the file was bundled at compile time
  IfFileExists "$PLUGINSDIR\momai.ico" 0 +3
    ${NSD_CreateIcon} 0 0 80u 80u ""
    Pop $0
    ${NSD_SetIcon} $0 "$PLUGINSDIR\momai.ico" $MomAIIconHandle

  ${NSD_CreateLabel} 90u 6u 210u 24u "Bem-vindo ao MomAI"
  Pop $0
  Push $0
  Push 18
  Push 700
  Call MomAI_SetFont

  ${NSD_CreateLabel} 90u 34u 210u 36u "Instalacao personalizada com opcao de manter ou recomecar dados locais."
  Pop $0
  Push $0
  Push 10
  Push 400
  Call MomAI_SetFont

  nsDialogs::Show
FunctionEnd

Function MomAIWelcomePageLeave
  ; Free icon handle to prevent GDI resource leak
  ${If} $MomAIIconHandle != ""
  ${AndIf} $MomAIIconHandle != "error"
    ${NSD_FreeIcon} $MomAIIconHandle
    StrCpy $MomAIIconHandle ""
  ${EndIf}
FunctionEnd

Function MomAIClearDataPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "Encontrou um erro?"
  Pop $0
  Push $0
  Push 18
  Push 700
  Call MomAI_SetFont

  ${NSD_CreateLabel} 0 25u 100% 50u "AVISO: MomAI esta em fase de teste.$\r$\nSe encontrar erros, considere reinstalar$\r$\nOu reporte o erro diretamente no site."
  Pop $0
  Push $0
  Push 10
  Push 400
  Call MomAI_SetFont
  SetCtlColors $0 0xFF0000 transparent

  ${NSD_CreateCheckbox} 0 80u 100% 14u "Apagar dados locais e recomecar do zero"
  Pop $MomAICheckbox
  ${NSD_SetState} $MomAICheckbox ${BST_UNCHECKED}

  ${NSD_CreateLabel} 0 105u 100% 20u "Obrigado por testar!"
  Pop $0
  Push $0
  Push 10
  Push 400
  Call MomAI_SetFont

  ${NSD_CreateLabel} 0 125u 100% 20u "Wesley Developer Studios"
  Pop $0
  Push $0
  Push 10
  Push 400
  Call MomAI_SetFont

  nsDialogs::Show
FunctionEnd

Function MomAIClearDataLeave
  ${NSD_GetState} $MomAICheckbox $MomAIClearData
  ${If} $MomAIClearData == ${BST_CHECKED}
    ; === CRITICAL: Kill MomAI BEFORE deleting data ===
    ; The app may still be running, locking files (momai.db, python_env, etc.)
    ; RMDir /r silently fails on locked files, so we must kill first.
    nsExec::ExecToLog 'taskkill /f /im MomAI.exe'
    nsExec::ExecToLog 'taskkill /f /im python.exe /fi "WINDOWTITLE eq momai*"'
    nsExec::ExecToLog 'taskkill /f /im llama-server.exe'
    ; Give processes time to fully terminate and release file locks
    Sleep 2000

    ; NOTE: Electron userData path comes from package.json "name": "desktop"
    ; so the actual data folder is %APPDATA%\desktop, NOT %APPDATA%\MomAI

    ; Remove user data (momai.db, python_env, onboarding, logs, etc.)
    RMDir /r "$APPDATA\desktop"
    ; Remove Electron cache and GPU cache
    RMDir /r "$LOCALAPPDATA\desktop"
    ; Also clean MomAI-named folders (updater, or future migration)
    RMDir /r "$APPDATA\MomAI"
    RMDir /r "$LOCALAPPDATA\MomAI"
    RMDir /r "$LOCALAPPDATA\MomAI-updater"
  ${EndIf}
FunctionEnd

Function MomAIFinishPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 10u 100% 22u "Instalacao concluida"
  Pop $0
  Push $0
  Push 18
  Push 700
  Call MomAI_SetFont

  ${NSD_CreateLabel} 0 34u 100% 30u "MomAI esta pronta para uso. Clique em Concluir para iniciar."
  Pop $0
  Push $0
  Push 10
  Push 400
  Call MomAI_SetFont

  ${NSD_CreateCheckbox} 0 70u 100% 14u "Iniciar MomAI ao concluir"
  Pop $MomAIStartCheckbox
  ${NSD_SetState} $MomAIStartCheckbox ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function MomAIFinishPageLeave
  ${NSD_GetState} $MomAIStartCheckbox $MomAIStartApp
  ${If} $MomAIStartApp == ${BST_CHECKED}
    ; Use correct quoting — no inner escaped quotes needed
    ExecShell "open" "$INSTDIR\${PRODUCT_NAME}.exe"
  ${EndIf}
FunctionEnd

!macro customWelcomePage
  Page custom MomAIWelcomePage MomAIWelcomePageLeave
!macroend

!macro customPageAfterChangeDir
  Page custom MomAIClearDataPage MomAIClearDataLeave
!macroend

!macro customFinishPage
  Page custom MomAIFinishPage MomAIFinishPageLeave
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
  ; The build may accidentally include a dev database. Delete it so the app
  ; creates a fresh one in %APPDATA%\MomAI\data\ on first launch.
  Delete "$INSTDIR\resources\core\momai.db"
!macroend

!macro customInstallEnd
  ; Launch handled in MomAIFinishPageLeave
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

  ; Remove all user data — no confirmation needed
  ; Real data path: %APPDATA%\desktop (from package.json "name": "desktop")
  RMDir /r "$APPDATA\desktop"
  RMDir /r "$LOCALAPPDATA\desktop"
  ; Also clean MomAI-named folders (updater, or future migration)
  RMDir /r "$APPDATA\MomAI"
  RMDir /r "$LOCALAPPDATA\MomAI"
  RMDir /r "$LOCALAPPDATA\MomAI-updater"
!macroend
