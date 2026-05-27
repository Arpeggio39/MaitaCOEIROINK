namespace MaitaCOEIROINK;

public static class AppConstants
{
    public const string MaitaUuid = "24e48b20-c14c-11f0-a12e-0242ac1c000c";
    public const string DefaultApiBase = "http://127.0.0.1:50032";
    public const int PlaybackSampleRate = 44100;
    public const int ExportSampleRateDefault = 44100;
    public const double MoraPitchDefault = 6;
    public const double MoraPitchMin = 3;
    public const double MoraPitchMax = 9;
    public const int IntonationCharWidth = 36;
    public const int SidebarWidth = 260;
    public const int ParamPaneWidth = 300;

    public static readonly int[] SampleRateOptions = [8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000];

    public static readonly string SegmentPunctPattern = @"[。、．.,!?！？…：:；;「」『』【】()（）\[\]{}'""‘’“”〜～]";
}
