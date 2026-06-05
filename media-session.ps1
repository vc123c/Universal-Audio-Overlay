param([string]$Action = "get", [int]$Seconds = 10, [double]$PositionPct = -1, [string]$SessionKey = "")

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Get-AsTaskMethod {
  $methods = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and
    $_.IsGenericMethodDefinition -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  }

  if ($methods.Count -lt 1) {
    throw "Could not find generic AsTask(IAsyncOperation<T>) bridge."
  }

  return $methods | Select-Object -First 1
}

$script:AsTaskGeneric = $null
$script:SelectedSessionMissing = $false

function Await-Operation($Operation, [Type]$ResultType) {
  if ($null -eq $Operation) { return $null }
  if ($null -eq $script:AsTaskGeneric) {
    $script:AsTaskGeneric = Get-AsTaskMethod
  }

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

function Format-Ticks([double]$ticks) {
  if ($ticks -lt 0) { $ticks = 0 }
  $ts = [TimeSpan]::FromTicks([int64]$ticks)
  if ($ts.TotalHours -ge 1) {
    return ("{0}:{1:D2}:{2:D2}" -f [int]$ts.TotalHours, $ts.Minutes, $ts.Seconds)
  }
  return ("{0}:{1:D2}" -f [int]$ts.TotalMinutes, $ts.Seconds)
}

function Return-Json($obj) {
  $json = $obj | ConvertTo-Json -Compress -Depth 8
  "UAOJSON:{0}" -f [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}

function Get-SessionAppId($Session) {
  try { return $Session.SourceAppUserModelId } catch { return "" }
}

function Is-PlayingSession($Session) {
  try {
    return ($Session.GetPlaybackInfo().PlaybackStatus.ToString() -eq "Playing")
  }
  catch {
    return $false
  }
}

function Get-SessionSnapshot($Session, [Type]$PropsType) {
  $props = Await-Operation ($Session.TryGetMediaPropertiesAsync()) $PropsType
  $playback = $Session.GetPlaybackInfo()
  $timeline = $Session.GetTimelineProperties()
  $appId = Get-SessionAppId $Session

  $title = $props.Title
  if ([string]::IsNullOrWhiteSpace($title)) { $title = "System media" }

  $artist = $props.Artist
  if ([string]::IsNullOrWhiteSpace($artist)) { $artist = $props.AlbumArtist }
  if ([string]::IsNullOrWhiteSpace($artist)) { $artist = $appId }
  $albumTitle = $props.AlbumTitle

  $durationTicks = [Math]::Max([double]0, [double]$timeline.EndTime.Ticks - [double]$timeline.StartTime.Ticks)
  $progressTicks = [Math]::Max([double]0, [double]$timeline.Position.Ticks - [double]$timeline.StartTime.Ticks)
  $durationSeconds = [Math]::Round($durationTicks / [TimeSpan]::TicksPerSecond)
  $rawKey = "{0}`n{1}`n{2}`n{3}" -f $appId, $title, $artist, $durationSeconds
  $key = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($rawKey))

  return [pscustomobject]@{
    key = $key
    appId = $appId
    title = $title
    artist = $artist
    albumTitle = $albumTitle
    albumArt = (Get-AlbumArtDataUrl $props)
    progressTicks = $progressTicks
    durationTicks = $durationTicks
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

function Get-BestSession($Manager, [Type]$PropsType, [string]$PreferredKey) {
  $preferredWasRequested = ![string]::IsNullOrWhiteSpace($PreferredKey)
  $script:SelectedSessionMissing = $false
  if (![string]::IsNullOrWhiteSpace($PreferredKey)) {
    foreach ($candidate in (Get-AllSessions $Manager)) {
      try {
        $snapshot = Get-SessionSnapshot $candidate $PropsType
        if ($snapshot.key -eq $PreferredKey) { return $candidate }
      }
      catch {}
    }
  }

  $current = $Manager.GetCurrentSession()
  if ($null -ne $current -and (Is-PlayingSession $current)) { return $current }

  foreach ($candidate in (Get-AllSessions $Manager)) {
    if ($null -ne $candidate -and (Is-PlayingSession $candidate)) { return $candidate }
  }

  if ($preferredWasRequested -and $null -ne $current) {
    $script:SelectedSessionMissing = $true
  }

  return $current
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

try {
  $ManagerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
  $PropsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]

  $manager = Await-Operation ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) $ManagerType
  if ($Action -eq "list") {
    $items = @()
    foreach ($candidate in (Get-AllSessions $manager)) {
      try {
        $snapshot = Get-SessionSnapshot $candidate $PropsType
        $items += [pscustomobject]@{
          key = $snapshot.key
          appId = $snapshot.appId
          title = $snapshot.title
          artist = $snapshot.artist
          albumTitle = $snapshot.albumTitle
          isPlaying = $snapshot.isPlaying
          playbackStatus = $snapshot.playbackStatus
          durationText = $snapshot.durationText
        }
      }
      catch {}
    }
    Return-Json ([pscustomobject]@{ sessions = $items })
    exit 0
  }

  $session = Get-BestSession $manager $PropsType $SessionKey

  if ($null -eq $session) {
    Return-Json ([pscustomobject]@{
      source = "system"
      title = "No system media session"
      artist = "Play audio in Arc first"
      albumArt = ""
      progressPct = 0
      progressText = "0:00"
      durationText = "0:00"
      durationSeconds = 0
      isPlaying = $false
    })
    exit 0
  }

  if ($Action -eq "playpause") {
    Await-Operation ($session.TryTogglePlayPauseAsync()) ([bool]) | Out-Null
  }
  elseif ($Action -eq "previous") {
    Await-Operation ($session.TrySkipPreviousAsync()) ([bool]) | Out-Null
  }
  elseif ($Action -eq "next") {
    Await-Operation ($session.TrySkipNextAsync()) ([bool]) | Out-Null
  }
  elseif ($Action -eq "skip") {
    $timeline = $session.GetTimelineProperties()
    $target = [int64]$timeline.Position.Ticks + ([int64]$Seconds * 10000000)

    if ($target -lt 0) { $target = 0 }
    if ($timeline.EndTime.Ticks -gt 0 -and $target -gt $timeline.EndTime.Ticks) {
      $target = $timeline.EndTime.Ticks
    }

    Await-Operation ($session.TryChangePlaybackPositionAsync($target)) ([bool]) | Out-Null
  }
  elseif ($Action -eq "seek") {
    $timeline = $session.GetTimelineProperties()
    $pct = [Math]::Min([double]100, [Math]::Max([double]0, [double]$PositionPct))
    $durationTicks = [Math]::Max([double]0, [double]$timeline.EndTime.Ticks - [double]$timeline.StartTime.Ticks)
    $target = [int64]([double]$timeline.StartTime.Ticks + (($pct / 100) * $durationTicks))

    if ($target -lt $timeline.StartTime.Ticks) { $target = $timeline.StartTime.Ticks }
    if ($timeline.EndTime.Ticks -gt 0 -and $target -gt $timeline.EndTime.Ticks) {
      $target = $timeline.EndTime.Ticks
    }

    Await-Operation ($session.TryChangePlaybackPositionAsync($target)) ([bool]) | Out-Null
  }

  $snapshot = Get-SessionSnapshot $session $PropsType

  $durationTicks = $snapshot.durationTicks
  $progressTicks = $snapshot.progressTicks

  $pct = 0
  if ($durationTicks -gt 0) {
    $pct = [Math]::Min([double]100, [Math]::Max([double]0, ($progressTicks / $durationTicks) * 100))
  }

  Return-Json ([pscustomobject]@{
    source = "system"
    sessionKey = $snapshot.key
    selectedSessionMissing = $script:SelectedSessionMissing
    appId = $snapshot.appId
    title = $snapshot.title
    artist = $snapshot.artist
    albumArt = $snapshot.albumArt
    progressPct = $pct
    progressText = $snapshot.progressText
    durationText = $snapshot.durationText
    durationSeconds = $snapshot.durationSeconds
    isPlaying = $snapshot.isPlaying
  })
}
catch {
  if ($Action -eq "list") {
    Return-Json ([pscustomobject]@{
      sessions = @()
      error = $_.Exception.Message
    })
    exit 0
  }

  Return-Json ([pscustomobject]@{
    source = "system"
    title = "No system media session"
    artist = "Waiting for Windows media"
    albumArt = ""
    progressPct = 0
    progressText = "0:00"
    durationText = "0:00"
    durationSeconds = 0
    isPlaying = $false
  })
}
