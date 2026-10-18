; Redrob Cowork - Windows installer / uninstaller UI (NSIS, assisted mode).
;
; uiux-refresh round 3: redesigned to match the approved browser preview. This file is
; PRESENTATION ONLY - warm copy, branded page text, friendly-but-informative status metaphors,
; and an optional uninstaller feedback page that opens a web form in the browser. It does NOT
; change any build, signing, publish, or install LOGIC: electron-builder still drives the real
; copy/shortcut/registry work through its own assistedInstaller sections. The branded sidebar
; bitmaps (build/installerSidebar.bmp, build/uninstallerSidebar.bmp, 164x314, 24-bit) are picked
; up automatically by electron-builder when present; see build/README-installer-art.md.

; --- Warm welcome / finish copy (overrides the stock MUI strings) -----------------------------
!macro customHeader
  ; Short hyphens only, warm and plain, Redrob Group voice.
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Redrob Cowork"
  !define MUI_WELCOMEPAGE_TEXT "You're a couple of clicks from doing real work with AI on your own files, all on your computer. We'll put Cowork where you want it and leave the rest to you.$\r$\n$\r$\nSelect Next to begin."
  !define MUI_FINISHPAGE_TITLE "Redrob Cowork is ready"
  !define MUI_FINISHPAGE_TEXT "That's it, everything's in place. Open Cowork and make something good."
  !define MUI_FINISHPAGE_RUN_TEXT "Open Redrob Cowork now"
  ; Uninstaller welcome / finish copy: warm, no pressure.
  !define MUI_UNWELCOMEPAGE_TITLE "We're sorry to see you go"
  !define MUI_UNWELCOMEPAGE_TEXT "This removes Redrob Cowork from your computer. Your files stay exactly where they are, we only take out what we put in. You're always welcome back.$\r$\n$\r$\nSelect Next to continue."
  !define MUI_UNFINISHPAGE_TITLE "All done, take care"
  !define MUI_UNFINISHPAGE_TEXT "Redrob Cowork has been removed. Thanks for giving it a try. The door's open whenever you want to come back."
!macroend

; --- Install progress: friendly metaphors naming the real step --------------------------------
; Each line is shown on the progress page as that step runs. The metaphor is the warm part; the
; parenthetical is what is actually happening, so the copy stays informative, not gamey.
!macro customInstall
  DetailPrint "Clearing a space for your work (preparing the install folder)"
  DetailPrint "Unpacking the workshop (copying application files)"
  DetailPrint "Hanging the tools on the wall (writing Start menu and desktop shortcuts)"
  DetailPrint "Introducing Cowork to Windows (registering the redrob:// link handler)"
  DetailPrint "Handing the keys to the launcher (linking Redrob Launcher)"
  DetailPrint "Tidying up (finishing touches)"
!macroend

; --- Optional uninstaller feedback step -------------------------------------------------------
; Shown after the uninstall welcome page. It gathers nothing locally (no backend): it only offers
; to open a web feedback form in the browser. Skipping it continues the uninstall unchanged.
!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UnPage custom un.FeedbackPageCreate un.FeedbackPageLeave
!macroend

Function un.FeedbackPageCreate
  !insertmacro MUI_HEADER_TEXT "Before you go, mind telling us why?" "Totally optional, and it helps us get better. Nothing is sent from here."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "If you have a minute, we'd genuinely love to hear what felt off. It opens a short form in your browser, nothing is collected inside this uninstaller."
  Pop $1
  ${NSD_CreateButton} 0 40u 60% 14u "Share feedback in the browser"
  Pop $2
  ${NSD_OnClick} $2 un.OpenFeedback
  nsDialogs::Show
FunctionEnd

Function un.OpenFeedback
  ; Opens the public feedback page in the default browser. No data leaves the installer itself.
  ExecShell "open" "https://redrob.ai/cowork/feedback?from=uninstaller"
FunctionEnd

Function un.FeedbackPageLeave
FunctionEnd

; --- Existing cleanup (unchanged): remove the brand shortcut we recorded at install -----------
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
