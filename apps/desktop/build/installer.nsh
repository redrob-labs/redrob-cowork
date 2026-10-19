; Redrob Cowork - Windows installer / uninstaller page copy (NSIS, assisted mode).
;
; Presentation only: these macros set the text of the stock MUI pages. electron-builder still
; does the real copy, shortcut and registry work in its own sections. MUI2 reads a page's text
; defines when that page is inserted, so each define lives in the electron-builder hook that runs
; right before its page (see app-builder-lib templates/nsis/assistedInstaller.nsh). Uninstaller
; pages read the same MUI_WELCOMEPAGE_* / MUI_FINISHPAGE_* names as installer pages. The assisted
; installer has no welcome page, so there is no installer welcome copy.
; Sidebar art: build/installerSidebar.bmp and build/uninstallerSidebar.bmp; see
; build/README-installer-art.md.

; Installer Finish page copy; this hook runs before MUI_PAGE_INSTFILES, and that page leaves the
; finish defines alone, so they are still set when MUI_PAGE_FINISH is inserted after it.
!macro customPageAfterChangeDir
  !define MUI_FINISHPAGE_TITLE "Redrob Cowork is ready"
  !define MUI_FINISHPAGE_TEXT "Redrob Cowork is installed. Open it to start working with your files."
  !define MUI_FINISHPAGE_RUN_TEXT "Open Redrob Cowork now"
!macroend

; Uninstaller Welcome page: replaces the default page, so it sets the copy and inserts the page.
!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Remove Redrob Cowork"
  !define MUI_WELCOMEPAGE_TEXT "This removes the Redrob Cowork app from this computer. Your own files are not touched. Your settings and chats stay in your user folder, so a later install picks up where you left off.$\r$\n$\r$\nSelect Next to continue."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

; Uninstaller Finish page copy; this hook runs right before MUI_UNPAGE_FINISH, so it only sets text.
!macro customUninstallPage
  !define MUI_FINISHPAGE_TITLE "Redrob Cowork is removed"
  !define MUI_FINISHPAGE_TEXT "The app is no longer on this computer. Your files are where you left them."
!macroend

; One status line at the end of the install section, after electron-builder's own steps.
!macro customInstall
  DetailPrint "Finishing setup"
!macroend

; Removes the brand shortcut path the app recorded at first launch.
!macro customUnInstall
  StrCpy $1 ""
  FileOpen $0 "$APPDATA\io.redrob.work\windows-brand-shortcut.txt" r
  IfErrors +3
    FileRead $0 $1
    FileClose $0
  ${If} $1 != ""
    Delete "$1"
  ${EndIf}
  Delete "$APPDATA\io.redrob.work\windows-brand-shortcut.txt"
!macroend
