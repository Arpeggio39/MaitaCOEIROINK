namespace MaitaCOEIROINK.Models;

public sealed class SentenceRange
{
    public required string Key { get; init; }
    public int Start { get; init; }
    public int End { get; init; }
    public required string Text { get; init; }
    public int Index { get; init; }
}

public sealed class SegmentMora
{
    public string Phoneme { get; set; } = "";
    public string Hira { get; set; } = "";
    public int Accent { get; set; }
    public double? Pitch { get; set; }

    public double GetPitch() => Pitch ?? AppConstants.MoraPitchDefault;

    public SegmentMora Clone() => new()
    {
        Phoneme = Phoneme,
        Hira = Hira,
        Accent = Accent,
        Pitch = Pitch,
    };
}

public sealed class MoraWavRange
{
    public int Start { get; set; }
    public int End { get; set; }
}

public sealed class SegmentProsody
{
    public string Text { get; set; } = "";
    public List<List<SegmentMora>> Detail { get; set; } = [];
    public List<double>? BaseF0 { get; set; }
    public List<double>? BaselinePitch { get; set; }
    public List<MoraWavRange>? MoraWavRanges { get; set; }
    public int? F0TotalSamples { get; set; }
    public double? F0SpeedScale { get; set; }

    public SegmentProsody Clone()
    {
        return new SegmentProsody
        {
            Text = Text,
            Detail = Detail.Select(p => p.Select(m => m.Clone()).ToList()).ToList(),
            BaseF0 = BaseF0?.ToList(),
            BaselinePitch = BaselinePitch?.ToList(),
            MoraWavRanges = MoraWavRanges?.Select(r => new MoraWavRange { Start = r.Start, End = r.End }).ToList(),
            F0TotalSamples = F0TotalSamples,
            F0SpeedScale = F0SpeedScale,
        };
    }
}

public sealed class Project
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Title { get; set; } = "無題";
    public string Text { get; set; } = "";
    public bool TitleEdited { get; set; }
    public ParamSet Params { get; set; } = ParamDefaults.Create();
    public Dictionary<string, ParamSet> SentenceParamsByKey { get; set; } = new();
    public Dictionary<string, SegmentProsody> SentenceProsodyByKey { get; set; } = new();
    public string UpdatedAt { get; set; } = DateTime.UtcNow.ToString("o");
}

public sealed class DictionaryEntry : CommunityToolkit.Mvvm.ComponentModel.ObservableObject
{
    private string _word = "";
    private string _yomi = "";
    private double _accent = 1;

    public string Word { get => _word; set => SetProperty(ref _word, value); }
    public string Yomi { get => _yomi; set => SetProperty(ref _yomi, value); }
    public double Accent { get => _accent; set => SetProperty(ref _accent, value); }
}

public sealed class ProjectsBlob
{
    public List<Project> Projects { get; set; } = [];
    public string? ActiveId { get; set; }
}

public sealed class AppSettings
{
    public int ExportSamplingRate { get; set; } = AppConstants.ExportSampleRateDefault;
}

public sealed class DictionaryBlob
{
    public List<DictionaryEntry> DictionaryWords { get; set; } = [];
}

public sealed class ProjectListItem
{
    public required Project Project { get; init; }
    public required string UpdatedLabel { get; init; }
    public bool IsActive { get; init; }
}

public sealed class MoraUiCell
{
    public required SegmentMora Mora { get; init; }
    public required string Char { get; init; }
    public double Pitch { get; set; }
}

public sealed class MoraSpanUi
{
    public required SegmentMora Mora { get; init; }
    public string Hira { get; set; } = "";
    public int CharStart { get; init; }
    public int CharEnd { get; init; }
}
