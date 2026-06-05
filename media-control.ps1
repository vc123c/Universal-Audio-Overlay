param([string]$Action = "seek", [int]$Seconds = 10, [double]$PositionPct = -1, [string]$SessionKey = "", [switch]$Server)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Get-AsTaskMethod {
  $methods = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and
    $_.IsGenericMethodDefinition -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  }

  if ($methods.Count -lt 1) { throw "Could not find AsTask bridge." }
  return $methods | Select-Object -First 1
}

$script:AsTaskGeneric = Get-AsTaskMethod
$script:Manager = $null
$script:ManagerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$script:PropsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]

function Await-Operation($Operation, [Type]$ResultType) {
  if ($null -eq $Operation) { return $null }
  $task = $script:AsTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  try {
    $task.Wait()
  }
  catch [System.AggregateException] {
    $inner = $_.Exception.Flatten().InnerExceptions | Select-Object -First 1
    if ($null -ne $inner) { throw $inner }
    throw
  }
  return $task.Result
}

function Return-Json($obj) {
  $obj | ConvertTo-Json -Compress
}

function Format-Ticks([double]$ticks) {
  if ($ticks -lt 0) { $ticks = 0 }
  $ts = [TimeSpan]::FromTicks([int64]$ticks)
  if ($ts.TotalHours -ge 1) {
    return ("{0}:{1:D2}:{2:D2}" -f [int]$ts.TotalHours, $ts.Minutes, $ts.Seconds)
  }
  return ("{0}:{1:D2}" -f [int]$ts.TotalMinutes, $ts.Seconds)
}

function Get-Manager {
  if ($null -eq $script:Manager) {
    $script:Manager = Await-Operation ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) $script:ManagerType
  }
  return $script:Manager
}

function Is-PlayingSession($Session) {
  try {
    return ($Session.GetPlaybackInfo().PlaybackStatus.ToString() -eq "Playing")
  }
  catch {
    return $false
  }
}

function Get-SessionKey($Session) {
  try {
    $props = Await-Operation ($Session.TryGetMediaPropertiesAsync()) $script:PropsType
    $timeline = $Session.GetTimelineProperties()
    $appId = ""
    try { $appId = $Session.SourceAppUserModelId } catch {}
    $title = $props.Title
    if ([string]::IsNullOrWhiteSpace($title)) { $title = "System media" }
    $artist = $props.Artist
    if ([string]::IsNullOrWhiteSpace($artist)) { $artist = $props.AlbumArtist }
    if ([string]::IsNullOrWhiteSpace($artist)) { $artist = $appId }
    $durationTicks = [Math]::Max([double]0, [double]$timeline.EndTime.Ticks - [double]$timeline.StartTime.Ticks)
    $durationSeconds = [Math]::Round($durationTicks / [TimeSpan]::TicksPerSecond)
    $rawKey = "{0}`n{1}`n{2}`n{3}" -f $appId, $title, $artist, $durationSeconds
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($rawKey))
  }
  catch {
    return ""
  }
}

function Get-AlbumArtDataUrl($Props) {
  try {
    if ($null -eq $Props -or $null -eq $Props.Thumbnail) { return "" }

    $StreamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime]
    $stream = Await-Operation ($Props.Thumbnail.OpenReadAsync()) $StreamType
    if ($null -eq $stream -or $stream.Size -le 0 -or $stream.Size -gt 5242880) { return "" }

    $reader = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]::new($stream.GetInputStreamAt(0))
    Await-Operation ($reader.LoadAsync([uint32]$stream.Size)) ([uint32]) | Out-Null
    $bytes = New-Object byte[] ([int]$stream.Size)
    $reader.ReadBytes($bytes)
    $reader.Dispose()

    return ("data:image/jpeg;base64,{0}" -f [Convert]::ToBase64String($bytes))
  }
  catch {
    return ""
  }
}

function Get-SessionSnapshot($Session) {
  $props = Await-Operation ($Session.TryGetMediaPropertiesAsync()) $script:PropsType
  $playback = $Session.GetPlaybackInfo()
  $timeline = $Session.GetTimelineProperties()
  $appId = ""
  try { $appId = $Session.SourceAppUserModelId } catch {}

  $title = $props.Title
  if ([string]::IsNullOrWhiteSpace($title)) { $title = "System media" }

  $artist = $props.Artist
  if ([string]::IsNullOrWhiteSpace($artist)) { $artist = $props.AlbumArtist }
  if ([string]::IsNullOrWhiteSpace($artist)) { $artist = $appId }

  $durationTicks = [Math]::Max([double]0, [double]$timeline.EndTime.Ticks - [double]$timeline.StartTime.Ticks)
  $progressTicks = [Math]::Max([double]0, [double]$timeline.Position.Ticks - [double]$timeline.StartTime.Ticks)
  $durationSeconds = [Math]::Round($durationTicks / [TimeSpan]::TicksPerSecond)
  $key = Get-SessionKey $Session
  $pct = 0
  if ($durationTicks -gt 0) {
    $pct = [Math]::Min([double]100, [Math]::Max([double]0, ($progressTicks / $durationTicks) * 100))
  }

  return [pscustomobject]@{
    source = "system"
    sessionKey = $key
    appId = $appId
    title = $title
    artist = $artist
    albumTitle = $props.AlbumTitle
    albumArt = (Get-AlbumArtDataUrl $props)
    progressPct = $pct
    progressText = (Format-Ticks $progressTicks)
    durationText = (Format-Ticks $durationTicks)
    durationSeconds = $durationSeconds
    isPlaying = ($playback.PlaybackStatus.ToString() -eq "Playing")
    playbackStatus = $playback.PlaybackStatus.ToString()
  }
}

function Get-AllSessions($Manager) {
  $sessions = @()
  try {
    foreach ($session in $Manager.GetSessions()) {
      if ($null -ne $session) { $sessions += $session }
    }
  }
  catch {}
  return $sessions
}

function Get-BestSession($Manager, [string]$PreferredKey) {
  if (![string]::IsNullOrWhiteSpace($PreferredKey)) {
    foreach ($candidate in (Get-AllSessions $Manager)) {
      if ((Get-SessionKey $candidate) -eq $PreferredKey) { return $candidate }
    }
  }

  $current = $Manager.GetCurrentSession()
  if ($null -ne $current -and (Is-PlayingSession $current)) { return $current }

  foreach ($candidate in (Get-AllSessions $Manager)) {
    if ($null -ne $candidate -and (Is-PlayingSession $candidate)) { return $candidate }
  }

  return $current
}

function Invoke-MediaControl([string]$CmdAction, [int]$CmdSeconds, [double]$CmdPositionPct, [string]$CmdSessionKey) {
  try {
    $manager = Get-Manager
    $session = Get-BestSession $manager $CmdSessionKey
    if ($null -eq $session) {
      if ($CmdAction -eq "get") {
        return [pscustomobject]@{
          source = "system"
          title = "No system media session"
          artist = "Waiting for Windows media"
          albumArt = ""
          progressPct = 0
          progressText = "0:00"
          durationText = "0:00"
          durationSeconds = 0
          isPlaying = $false
        }
      }
      return [pscustomobject]@{ ok = $false; error = "No system media session" }
    }

    if ($CmdAction -eq "get") {
      return Get-SessionSnapshot $session
    }
    elseif ($CmdAction -eq "playpause") {
      $ok = Await-Operation ($session.TryTogglePlayPauseAsync()) ([bool])
      return [pscustomobject]@{ ok = $ok }
    }
    elseif ($CmdAction -eq "previous") {
      $ok = Await-Operation ($session.TrySkipPreviousAsync()) ([bool])
      return [pscustomobject]@{ ok = $ok }
    }
    elseif ($CmdAction -eq "next") {
      $ok = Await-Operation ($session.TrySkipNextAsync()) ([bool])
      return [pscustomobject]@{ ok = $ok }
    }
    elseif ($CmdAction -eq "skip") {
      $timeline = $session.GetTimelineProperties()
      $target = [int64]$timeline.Position.Ticks + ([int64]$CmdSeconds * 10000000)
      if ($target -lt 0) { $target = 0 }
      if ($timeline.EndTime.Ticks -gt 0 -and $target -gt $timeline.EndTime.Ticks) { $target = $timeline.EndTime.Ticks }
      $ok = Await-Operation ($session.TryChangePlaybackPositionAsync($target)) ([bool])
      return [pscustomobject]@{ ok = $ok }
    }
    elseif ($CmdAction -eq "seek") {
      $timeline = $session.GetTimelineProperties()
      $pct = [Math]::Min([double]100, [Math]::Max([double]0, [double]$CmdPositionPct))
      $durationTicks = [Math]::Max([double]0, [double]$timeline.EndTime.Ticks - [double]$timeline.StartTime.Ticks)
      $target = [int64]([double]$timeline.StartTime.Ticks + (($pct / 100) * $durationTicks))
      if ($target -lt $timeline.StartTime.Ticks) { $target = $timeline.StartTime.Ticks }
      if ($timeline.EndTime.Ticks -gt 0 -and $target -gt $timeline.EndTime.Ticks) { $target = $timeline.EndTime.Ticks }
      $ok = Await-Operation ($session.TryChangePlaybackPositionAsync($target)) ([bool])
      return [pscustomobject]@{ ok = $ok }
    }

    return [pscustomobject]@{ ok = $false; error = "Unknown action" }
  }
  catch {
    $script:Manager = $null
    return [pscustomobject]@{ ok = $false; error = $_.Exception.Message }
  }
}

if ($Server) {
  [Console]::Out.WriteLine((Return-Json ([pscustomobject]@{ ready = $true })))
  while ($null -ne ($line = [Console]::In.ReadLine())) {
    try {
      $cmd = $line | ConvertFrom-Json
      $result = Invoke-MediaControl ([string]$cmd.action) ([int]$cmd.seconds) ([double]$cmd.positionPct) ([string]$cmd.sessionKey)
      [Console]::Out.WriteLine((Return-Json $result))
    }
    catch {
      [Console]::Out.WriteLine((Return-Json ([pscustomobject]@{ ok = $false; error = $_.Exception.Message })))
    }
  }
  exit 0
}

Return-Json (Invoke-MediaControl $Action $Seconds $PositionPct $SessionKey)
