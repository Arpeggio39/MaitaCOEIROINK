const { execFileSync } = require('node:child_process');
// Windows children inherit the process affinity mask, including Chromium and FFmpeg.
// Four logical processors is a conservative upper bound of four physical CPU cores.
function applyCpuBudget() {
  if (process.platform !== 'win32') return;
  const script = `$ErrorActionPreference = 'Stop'; $p = Get-Process -Id ${process.pid}; $allowed = $p.ProcessorAffinity.ToInt64(); $mask = [long]0; $count = 0; for ($i = 0; $i -lt 64 -and $count -lt 4; $i++) { $bit = [long]1 -shl $i; if (($allowed -band $bit) -ne 0) { $mask = $mask -bor $bit; $count++ } }; if ($count -eq 0) { throw 'No available CPU' }; $p.ProcessorAffinity = [IntPtr]$mask; Get-CimInstance Win32_Process -Filter "ParentProcessId = ${process.pid}" | ForEach-Object { try { (Get-Process -Id $_.ProcessId -ErrorAction Stop).ProcessorAffinity = [IntPtr]$mask } catch {} }`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000, stdio: 'pipe' });
}
module.exports = { applyCpuBudget };
