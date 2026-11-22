@echo off
rem Test przegladarkowy sesji roli (e2e\sesja-roli.spec.ts) na Windows.
rem Dziala z cmd i z PowerShella, z dowolnego folderu, bez zmiany ExecutionPolicy.
rem Dodatkowe argumenty ida do "playwright test", np.: test-e2e.cmd --headed
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (echo [test-e2e] Brak Node.js w PATH. Zainstaluj Node.js 20 lub nowszy: https://nodejs.org & goto blad)
node -e "process.exit(Number(process.versions.node.split('.')[0]) < 20 ? 1 : 0)" || (echo [test-e2e] Potrzebny Node.js 20 lub nowszy, a jest: & node -v & goto blad)

if not exist "node_modules\@playwright\test\package.json" (
  echo [test-e2e] Instaluje zaleznosci z package-lock.json...
  call npm.cmd ci || goto blad
)

echo [test-e2e] Chromium dla Playwright z projektu, czyli 1.63.0...
call "node_modules\.bin\playwright.cmd" install chromium || goto blad

echo [test-e2e] Uruchamiam test. Vite startuje sam na 127.0.0.1:5173, backend niepotrzebny.
call "node_modules\.bin\playwright.cmd" test %*
set KOD=%ERRORLEVEL%
if "%KOD%"=="0" (echo [test-e2e] Test przeszedl.) else (echo [test-e2e] Test nie przeszedl, kod %KOD%. Szczegoly wyzej.)
exit /b %KOD%

:blad
echo [test-e2e] Przerwano.
exit /b 1
