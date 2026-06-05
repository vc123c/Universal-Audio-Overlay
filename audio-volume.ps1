param([string]$Action = "get", [string]$AppId = "", [int]$Volume = -1, [switch]$Server)

$ErrorActionPreference = "Stop"

$source = @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace AudioVolumeBridge {
  [ComImport]
  [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  public class MMDeviceEnumerator {}

  public enum EDataFlow { eRender, eCapture, eAll }
  public enum ERole { eConsole, eMultimedia, eCommunications }
  public enum AudioSessionState { Inactive, Active, Expired }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    int NotImpl1();
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppDevice);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
  }

  [ComImport]
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioEndpointVolume {
    [PreserveSig]
    int RegisterControlChangeNotify(IntPtr pNotify);
    [PreserveSig]
    int UnregisterControlChangeNotify(IntPtr pNotify);
    [PreserveSig]
    int GetChannelCount(out uint pnChannelCount);
    [PreserveSig]
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    [PreserveSig]
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    [PreserveSig]
    int GetMasterVolumeLevel(out float pfLevelDB);
    [PreserveSig]
    int GetMasterVolumeLevelScalar(out float pfLevel);
    [PreserveSig]
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    [PreserveSig]
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    [PreserveSig]
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    [PreserveSig]
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    [PreserveSig]
    int SetMute(bool bMute, Guid pguidEventContext);
    [PreserveSig]
    int GetMute(out bool pbMute);
    [PreserveSig]
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    [PreserveSig]
    int VolumeStepUp(Guid pguidEventContext);
    [PreserveSig]
    int VolumeStepDown(Guid pguidEventContext);
    [PreserveSig]
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    [PreserveSig]
    int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
  }

  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioSessionManager2 {
    int NotImpl1();
    int NotImpl2();
    int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
  }

  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioSessionEnumerator {
    int GetCount(out int SessionCount);
    int GetSession(int SessionCount, out IAudioSessionControl Session);
  }

  [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioSessionControl {
    [PreserveSig]
    int GetState(out AudioSessionState pRetVal);
    [PreserveSig]
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, Guid EventContext);
    [PreserveSig]
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, Guid EventContext);
    [PreserveSig]
    int GetGroupingParam(out Guid pRetVal);
    [PreserveSig]
    int SetGroupingParam(Guid Override, Guid EventContext);
    [PreserveSig]
    int RegisterAudioSessionNotification(IntPtr NewNotifications);
    [PreserveSig]
    int UnregisterAudioSessionNotification(IntPtr NewNotifications);
  }

  [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioSessionControl2 {
    [PreserveSig]
    int GetState(out AudioSessionState pRetVal);
    [PreserveSig]
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, Guid EventContext);
    [PreserveSig]
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, Guid EventContext);
    [PreserveSig]
    int GetGroupingParam(out Guid pRetVal);
    [PreserveSig]
    int SetGroupingParam(Guid Override, Guid EventContext);
    [PreserveSig]
    int RegisterAudioSessionNotification(IntPtr NewNotifications);
    [PreserveSig]
    int UnregisterAudioSessionNotification(IntPtr NewNotifications);
    [PreserveSig]
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int GetProcessId(out uint pRetVal);
    [PreserveSig]
    int IsSystemSoundsSession();
    [PreserveSig]
    int SetDuckingPreference(bool optOut);
  }

  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface ISimpleAudioVolume {
    int SetMasterVolume(float fLevel, Guid EventContext);
    int GetMasterVolume(out float pfLevel);
    int SetMute(bool bMute, Guid EventContext);
    int GetMute(out bool pbMute);
  }

  [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioMeterInformation {
    int GetPeakValue(out float pfPeak);
    int GetMeteringChannelCount(out uint pnChannelCount);
    int GetChannelsPeakValues(uint u32ChannelCount, [Out] float[] afPeakValues);
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
  }

  public class SessionInfo {
    public int Index;
    public uint ProcessId;
    public string ProcessName;
    public string DisplayName;
    public string State;
    public float Volume;
    public float Peak;
  }

  public static class Bridge {
    static IMMDevice Device() {
      var deviceEnumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
      IMMDevice speakers;
      Marshal.ThrowExceptionForHR(deviceEnumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out speakers));
      return speakers;
    }

    public static float SystemVolume() {
      var speakers = Device();
      var iid = typeof(IAudioEndpointVolume).GUID;
      object endpointObj;
      Marshal.ThrowExceptionForHR(speakers.Activate(ref iid, 23, IntPtr.Zero, out endpointObj));
      float level;
      Marshal.ThrowExceptionForHR(((IAudioEndpointVolume)endpointObj).GetMasterVolumeLevelScalar(out level));
      if (level < 0) level = 0;
      if (level > 1) level = 1;
      return level;
    }

    static IAudioSessionEnumerator Enumerator() {
      var speakers = Device();
      var iid = typeof(IAudioSessionManager2).GUID;
      object managerObj;
      Marshal.ThrowExceptionForHR(speakers.Activate(ref iid, 23, IntPtr.Zero, out managerObj));
      IAudioSessionEnumerator sessionEnumerator;
      Marshal.ThrowExceptionForHR(((IAudioSessionManager2)managerObj).GetSessionEnumerator(out sessionEnumerator));
      return sessionEnumerator;
    }

    public static List<SessionInfo> List() {
      var result = new List<SessionInfo>();
      var sessionEnumerator = Enumerator();
      int count;
      Marshal.ThrowExceptionForHR(sessionEnumerator.GetCount(out count));
      for (int i = 0; i < count; i++) {
        try {
          IAudioSessionControl control;
          Marshal.ThrowExceptionForHR(sessionEnumerator.GetSession(i, out control));
          var control2 = control as IAudioSessionControl2;
          var volume = control as ISimpleAudioVolume;
          var meter = control as IAudioMeterInformation;
          uint pid = 0;
          string processName = "";
          string displayName = "";
          AudioSessionState state = AudioSessionState.Inactive;
          float level = 0;
          float peak = 0;
          try { control.GetDisplayName(out displayName); } catch {}
          try { control.GetState(out state); } catch {}
          try { if (control2 != null) control2.GetProcessId(out pid); } catch {}
          try {
            if (pid > 0) processName = Process.GetProcessById((int)pid).ProcessName;
          } catch {}
          try { if (volume != null) volume.GetMasterVolume(out level); } catch {}
          try { if (meter != null) meter.GetPeakValue(out peak); } catch {}
          if (peak < 0) peak = 0;
          if (peak > 1) peak = 1;
          result.Add(new SessionInfo { Index = i, ProcessId = pid, ProcessName = processName, DisplayName = displayName, State = state.ToString(), Volume = level, Peak = peak });
        } catch {}
      }
      return result;
    }

    static List<string> Terms(string appId) {
      appId = (appId ?? "").ToLowerInvariant();
      var terms = new List<string>();
      Action<string> add = value => {
        value = (value ?? "").Trim().ToLowerInvariant();
        if (value.Length > 1 && !terms.Contains(value)) terms.Add(value);
      };

      add(appId);
      foreach (var part in appId.Split(new char[] { '!', '.', '_', '-', ' ', '\\', '/' }, StringSplitOptions.RemoveEmptyEntries)) add(part);

      if (appId.Contains("spotify")) add("spotify");
      if (appId.Contains("youtube") || appId.Contains("ytmusic")) {
        add("chrome");
        add("msedge");
        add("arc");
      }
      if (appId.Contains("chrome")) add("chrome");
      if (appId.Contains("edge")) add("msedge");
      if (appId.Contains("arc") || appId.Contains("thebrowsercompany")) add("arc");
      if (appId.Contains("firefox")) add("firefox");
      if (appId.Contains("brave")) add("brave");

      return terms;
    }

    public static SessionInfo Match(string appId) {
      try {
        appId = (appId ?? "").ToLowerInvariant();
        var sessions = List();
        if (appId.Length < 1) return ActiveFallback(sessions);

        var terms = Terms(appId);
        SessionInfo best = null;
        int bestScore = -1;

        foreach (var s in sessions) {
          var processName = s.ProcessName ?? "";
          var hay = (processName + " " + (s.DisplayName ?? "")).ToLowerInvariant();
          var processLower = processName.ToLowerInvariant();
          int score = -1;

          if (processLower.Length > 0 && appId.Contains(processLower)) score = Math.Max(score, 80);
          if (hay.Length > 0 && hay.Contains(appId)) score = Math.Max(score, 70);
          foreach (var term in terms) {
            if (term.Length < 2) continue;
            if (processLower == term) score = Math.Max(score, 100);
            else if (processLower.Contains(term) || term.Contains(processLower)) score = Math.Max(score, 90);
            else if (hay.Contains(term)) score = Math.Max(score, 60);
          }

          if ((s.State ?? "") == "Active") score += 5;
          if (score > bestScore) {
            bestScore = score;
            best = s;
          }
        }

        return bestScore >= 60 ? best : ActiveFallback(sessions);
      } catch {
        return null;
      }
    }

    static bool IsMediaLike(SessionInfo s) {
      var processName = ((s.ProcessName ?? "") + " " + (s.DisplayName ?? "")).ToLowerInvariant();
      return processName.Contains("spotify") ||
        processName.Contains("chrome") ||
        processName.Contains("msedge") ||
        processName.Contains("arc") ||
        processName.Contains("firefox") ||
        processName.Contains("brave") ||
        processName.Contains("youtube") ||
        processName.Contains("music") ||
        processName.Contains("tidal") ||
        processName.Contains("vlc") ||
        processName.Contains("itunes");
    }

    static SessionInfo ActiveFallback(List<SessionInfo> sessions) {
      SessionInfo best = null;
      foreach (var s in sessions) {
        if ((s.State ?? "") != "Active") continue;
        if (!IsMediaLike(s)) continue;
        if (best == null || s.Volume > best.Volume) best = s;
      }
      if (best != null) return best;

      foreach (var s in sessions) {
        if ((s.State ?? "") == "Expired") continue;
        if (!IsMediaLike(s)) continue;
        if (best == null || s.Volume > best.Volume) best = s;
      }
      return best;
    }

    public static float SetPercentOfSystem(string appId, float percent) {
      try {
        var matched = Match(appId);
        if (matched == null) return -1;
        var systemLevel = SystemVolume();
        var level = systemLevel * percent;
        var sessionEnumerator = Enumerator();
        IAudioSessionControl control;
        Marshal.ThrowExceptionForHR(sessionEnumerator.GetSession(matched.Index, out control));
        var volume = control as ISimpleAudioVolume;
        if (volume == null) return -1;
        if (level < 0) level = 0;
        if (level > 1) level = 1;
        Marshal.ThrowExceptionForHR(volume.SetMasterVolume(level, Guid.Empty));
        return level;
      } catch {
        return -1;
      }
    }
  }
}
"@

Add-Type -TypeDefinition $source -Language CSharp

function Return-Json($obj) {
  $obj | ConvertTo-Json -Compress
}

function Invoke-VolumeCommand([string]$CmdAction, [string]$CmdAppId, [int]$CmdVolume) {
  try {
    $systemLevel = [AudioVolumeBridge.Bridge]::SystemVolume()
    $systemVolume = [Math]::Round($systemLevel * 100)

    if ($CmdAction -eq "list") {
      return [pscustomobject]@{
        systemVolume = $systemVolume
        sessions = [AudioVolumeBridge.Bridge]::List()
      }
    }

    if ($CmdAction -eq "set") {
      $requested = [Math]::Min([double]100, [Math]::Max([double]0, [double]$CmdVolume)) / 100
      $level = [AudioVolumeBridge.Bridge]::SetPercentOfSystem($CmdAppId, [single]$requested)
      if ($level -lt 0) {
        return [pscustomobject]@{ volume = 100; appId = $CmdAppId; matched = $false; systemVolume = $systemVolume; mixerVolume = $systemVolume }
      }
      return [pscustomobject]@{
        volume = [Math]::Round($requested * 100)
        appId = $CmdAppId
        matched = $true
        systemVolume = $systemVolume
        mixerVolume = [Math]::Round($level * 100)
      }
    }

    $matched = [AudioVolumeBridge.Bridge]::Match($CmdAppId)
    if ($null -eq $matched) {
      return [pscustomobject]@{ volume = 100; peak = 0; appId = $CmdAppId; matched = $false; systemVolume = $systemVolume; mixerVolume = $systemVolume }
    }

    if ($CmdAction -eq "peak") {
      return [pscustomobject]@{
        peak = [Math]::Round([Math]::Min([double]1, [Math]::Max([double]0, [double]$matched.Peak)), 4)
        appId = $CmdAppId
        matched = $true
        processName = $matched.ProcessName
        displayName = $matched.DisplayName
        state = $matched.State
      }
    }

    $relativeVolume = 100
    if ($systemLevel -le 0) {
      $relativeVolume = 0
    }
    else {
      $relativeVolume = [Math]::Min([double]100, [Math]::Max([double]0, ([double]$matched.Volume / [double]$systemLevel) * 100))
    }

    return [pscustomobject]@{
      volume = [Math]::Round($relativeVolume)
      peak = [Math]::Round([Math]::Min([double]1, [Math]::Max([double]0, [double]$matched.Peak)), 4)
      appId = $CmdAppId
      matched = $true
      systemVolume = $systemVolume
      mixerVolume = [Math]::Round($matched.Volume * 100)
      processName = $matched.ProcessName
      displayName = $matched.DisplayName
      state = $matched.State
    }
  }
  catch {
    return [pscustomobject]@{ volume = 100; appId = $CmdAppId; matched = $false; systemVolume = 100; mixerVolume = 100; error = $_.Exception.Message }
  }
}

if ($Server) {
  [Console]::Out.WriteLine((Return-Json ([pscustomobject]@{ ready = $true })))
  while ($null -ne ($line = [Console]::In.ReadLine())) {
    try {
      $cmd = $line | ConvertFrom-Json
      $result = Invoke-VolumeCommand ([string]$cmd.action) ([string]$cmd.appId) ([int]$cmd.volume)
      [Console]::Out.WriteLine((Return-Json $result))
    }
    catch {
      [Console]::Out.WriteLine((Return-Json ([pscustomobject]@{ volume = 100; matched = $false; error = $_.Exception.Message })))
    }
  }
  exit 0
}

Return-Json (Invoke-VolumeCommand $Action $AppId $Volume)
